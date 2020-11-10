const cds = global.cds || require('@sap/cds/lib')

const { isDraftEnabled } = require('../../../../common/utils/draft')
const { isCustomOperation } = require('./request')
const expandToCQN = require('../odata-to-cqn/expandToCQN')
const QueryOptions = require('@sap/odata-server').QueryOptions

const getTemplate = require('../../../../common/utils/getTemplate.js')

const _selectForFunction = (selectColumns, result, context) => {
  if (!Array.isArray(result)) {
    return _selectForFunction(selectColumns, [result], context)
  }

  const keys = context._.returnType.keys

  for (const row of result) {
    for (const entry in row) {
      if (keys[entry]) {
        continue
      }

      if (!selectColumns.includes(entry)) {
        delete row[entry]
      }
    }
  }
}
const { ensureDraftsSuffix, isDraftActivateAction } = require('../../../services/utils/draftUtils')

// REVISIT: move to a common csn utils
const isSingleton = target =>
  target['@odata.singleton'] || (target['@odata.singleton.nullable'] && target['@odata.singleton'] !== false)

const _expandForFunction = async (uriInfo, result, context, service, changeset) => {
  if (!Array.isArray(result)) {
    return _expandForFunction(uriInfo, [result], context, service, changeset)
  }

  const ress = []

  // REVISIT: isDraft is (always?!) undefined because context._.returnType is not a string (at least always)
  const isDraft = isDraftEnabled(service.model.definitions[context._.returnType])

  const isDraftActivate = isDraftActivateAction(context)

  // REVISIT: we shouldn't have to read stuff here anymore, or we should use own transaction
  let tx

  for (const row of result) {
    const selectQuery = context.statements.SELECT.from(
      isDraft && !isDraftActivate ? ensureDraftsSuffix(context._.returnType.name) : context._.returnType
    )
    for (const key in context._.returnType.keys) {
      if ((!isDraft || isDraftActivate) && key === 'IsActiveEntity') {
        continue
      }
      selectQuery.where(key, '=', row[key])
    }

    const expandCqn = _expand(context._.returnType, uriInfo)
    selectQuery.columns(expandCqn)

    tx = tx || cds.db.transaction(context)

    // REVISIT: what happens here exactly?
    let res = await tx.run(selectQuery)
    res = res && Object.assign(row, res[0])
    ress.push(res)
  }

  // only commit if request not part of an atomicity group
  tx && !changeset && (await tx.commit())

  return ress
}

const _expand = (reflectedEntity, uriInfo) => {
  const expand = uriInfo.getQueryOption(QueryOptions.EXPAND)

  if (!expand || expand.length === 0) {
    return []
  }

  return expandToCQN(reflectedEntity, expand, uriInfo.getFinalEdmType())
}

const _cleanupResult = (result, context) => {
  if (!Array.isArray(result)) {
    return _cleanupResult([result], context)
  }

  for (const row of result) {
    for (const element in context._.returnType.elements) {
      if (context._.returnType.elements[element].is2many) {
        delete row[element]
      }
    }
  }
}

const getActionOrFunctionReturnType = (pathSegments, definitions) => {
  if (!isCustomOperation(pathSegments, true)) {
    return undefined
  }

  const actionOrFunction =
    pathSegments[pathSegments.length - 1].getFunction() || pathSegments[pathSegments.length - 1].getAction()
  if (actionOrFunction) {
    const returnType = actionOrFunction.getReturnType()
    if (returnType) {
      // eslint-disable-next-line standard/computed-property-even-spacing
      return definitions[
        returnType
          .getType()
          .getFullQualifiedName()
          .toString()
      ]
    }
  }
}

const actionAndFunctionQueries = async (context, odataReq, result, service, changeset) => {
  _cleanupResult(result, context)

  if (odataReq.getQueryOptions().$select) {
    _selectForFunction(odataReq.getQueryOptions().$select.split(','), result, context)
  }
  if (odataReq.getQueryOptions().$expand) {
    await _expandForFunction(odataReq.getUriInfo(), result, context, service, changeset)
  }
}

const _getBacklinkName = element => {
  if (element.on && element.on.length === 3 && element.on[0].ref && element.on[2].ref) {
    if (element.on[0].ref[0] === '$self') {
      return element.on[2].ref[element.on[2].ref.length - 1]
    } else if (element.on[2].ref[0] === '$self') {
      return element.on[0].ref[element.on[0].ref.length - 1]
    }
  }
}

const _isContainment = element => {
  return (
    ((element.type === 'cds.Association' && element['@odata.contained']) ||
      (element.type === 'cds.Composition' && cds.env.cdsc.odataContainment)) &&
    element.name !== 'DraftAdministrativeData_DraftUUID'
  )
}

const _isBacklink = (element, parent) => {
  if (element.type !== 'cds.Association') {
    return false
  }

  if (!parent || !element.keys) {
    return false
  }

  if (element.target !== parent.name) {
    return false
  }

  for (const parentElement of Object.values(parent.elements)) {
    if (_isContainment(parentElement) && _getBacklinkName(parentElement) === element.name) {
      return true
    }
  }

  return false
}

const _removeKeys = (row, template) => {
  for (const [templateName, templateValue] of template.elements) {
    const val = row[templateName]
    if (val === undefined) continue
    if (Array.isArray(val)) {
      for (const subVal of val) {
        _removeKeys(subVal, templateValue)
      }
      continue
    }
    if (!templateValue.isTemplate) {
      delete row[templateName]
      continue
    }
    if (val !== null) {
      _removeKeys(val, templateValue)
    }
  }
}

const removeContainmentKeys = (model, name, result, backlinks = []) => {
  // TODO: workaround for draft
  if (!model.definitions[name] || !result) {
    return
  }

  const template = getTemplate(model, name, {
    pick: (element, target, parent, templateElements) => {
      if ((element.type !== 'cds.Association' && element.type !== 'cds.Composition') || !element.keys) {
        return false
      }

      if (_isContainment(element) || _isBacklink(element, parent)) {
        element.keys
          .map(key => key['$generatedFieldName'])
          .filter(key => key !== undefined)
          .forEach(name => templateElements.set(name, true))
      }
    },
    includeNavigations: true
  })

  if (template.elements.size === 0) {
    return
  }

  const data = Array.isArray(result) ? result : [result]

  for (const row of data) {
    _removeKeys(row, template)
  }
}

module.exports = {
  _expand,
  actionAndFunctionQueries,
  getActionOrFunctionReturnType,
  removeContainmentKeys,
  isSingleton
}
