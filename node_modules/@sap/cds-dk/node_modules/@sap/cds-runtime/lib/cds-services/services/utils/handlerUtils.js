const { getParent } = require('./compositionTree')
const { checkNotNullAll, checkReferenceIntegrity } = require('../../util/assert')
const { processDeep, processDeepAsync } = require('../../util/dataProcessUtils')
const { ensureNoDraftsSuffix, ensureDraftsSuffix } = require('./draftUtils')
const generateUUID = require('../../../common/utils/uuid')
const cds = global.cds || require('@sap/cds/lib')

const { DRAFT_COLUMNS, DRAFT_COLUMNS_FOR_CQN_SELECT } = require('./constants')
const DRAFT_ADMIN_COLUMNS = [
  'DraftUUID',
  'CreatedByUser',
  'InProcessByUser',
  'CreationDateTime',
  'LastChangeDateTime',
  'LastChangedByUser',
  'DraftIsProcessedByMe',
  'DraftIsCreatedByMe'
]

const _isAssociation = element => {
  return (
    element.type === 'cds.Association' && (!element['@odata.contained'] || element.name === 'DraftAdministrativeData')
  )
}

const _isComposition = element => {
  return (
    element.type === 'cds.Composition' ||
    (element.type === 'cds.Association' && element['@odata.contained'] && element.name !== 'DraftAdministrativeData')
  )
}

const _prefixDraftColumns = () => {
  return DRAFT_ADMIN_COLUMNS.map(col => {
    return { ref: ['DRAFT_DraftAdministrativeData', col] }
  })
}

const _getSelectDraftDataCqn = ({ statements }, entityName, where) => {
  return statements.SELECT.from(ensureDraftsSuffix(entityName), _prefixDraftColumns())
    .join('DRAFT.DraftAdministrativeData')
    .on(`DraftAdministrativeData_DraftUUID = "DRAFT.DraftAdministrativeData"."DraftUUID"`)
    .where(where)
}

const _getWheres = (key, data, context) => {
  const wheres = []
  for (const d of data) {
    wheres.push({ [key.name]: d[key.name] })
  }
  return wheres
}

const allKeysAreProvided = context => {
  const data = context.data && (Array.isArray(context.data) ? context.data : [context.data])
  for (const key of Object.values(context.target.keys)) {
    if (key.type === 'cds.Association' || DRAFT_COLUMNS.includes(key.name)) {
      continue
    }
    for (const d of data) {
      if (d[key.name] === undefined) return false
    }
  }
  return true
}

const getSelectCQN = (context, columns) => {
  const cqn = cds.ql.SELECT.from(context.target)

  if (columns) {
    cqn.columns(...columns)
  }

  const data = context.data && (Array.isArray(context.data) ? context.data : [context.data])

  for (const key of Object.values(context.target.keys)) {
    if (key.type === 'cds.Association' || DRAFT_COLUMNS.includes(key.name)) {
      continue
    }

    const wheres = _getWheres(key, data, context)
    if (wheres.length === 0) {
      continue
    } else if (wheres.length === 1) {
      cqn.where(wheres[0])
    } else {
      cqn.where({ or: wheres })
    }
  }

  if (context.target.query && context.target.query.SELECT && context.target.query.SELECT.orderBy) {
    cqn.SELECT.orderBy = context.target.query.SELECT.orderBy
  }

  return cqn
}

const validateDraft = (result, context) => {
  if (!result || !result[0]) {
    context.reject(404)
    return
  }

  if (result[0].CreatedByUser !== context.user.id || result[0].InProcessByUser !== context.user.id) {
    context.reject(403, 'The requested draft is locked by another user.')
  }
}

const checkNotNull = context => {
  let error = false
  processDeep(
    (data, entity) => {
      const errors = checkNotNullAll(entity, data)
      if (errors.length !== 0) {
        for (const err of errors) {
          context.error(err)
        }
        error = true
      }
    },
    context.data,
    context.target,
    false,
    true
  )
  return error
}

const _flattenToOneAssociation = (element, entity, row, property, csn) => {
  if (element.is2one) {
    const targetEntity = element._target
    if (!element.on) {
      for (const key in targetEntity.keys) {
        if (targetEntity.keys[key].is2one) {
          _flattenToOneAssociation(targetEntity.keys[key], targetEntity, row[element.name], key, csn)
          continue
        }
        row[element.name + '_' + key] = row[element.name] && row[element.name] !== null ? row[element.name][key] : null
      }

      delete row[element.name]
    }
  }
}

const _flattenDeepToOneAssociations = (entity, data, csn) => {
  if (!Array.isArray(data)) {
    return _flattenDeepToOneAssociations(entity, [data], csn)
  }

  for (const row of data) {
    for (const property in row) {
      const element = entity.elements[property]
      if (element && _isAssociation(element)) {
        _flattenToOneAssociation(element, entity, row, property, csn)
      }
    }
  }
}

const flattenDeepToOneAssociations = (context, csn) => {
  if (!context.target) {
    return
  }

  if (context.event !== 'CREATE' && context.event !== 'UPDATE') {
    return
  }

  processDeep(
    (data, entity) => {
      _flattenDeepToOneAssociations(entity, data, csn)
    },
    context.data,
    context.target,
    false,
    true
  )
}

const checkIntegrityWrapper = (context, csn, run) => async (data, entity) => {
  const errors = await checkReferenceIntegrity(entity, data, context, csn, run)
  if (errors.length !== 0) {
    for (const err of errors) {
      context.error(err)
    }
  }
}

// REVISIT: lower to db layer, where it's used
const checkIntegrityUtil = async (context, csn, run) => {
  if (!run) {
    return
  }

  // REVISIT
  if (typeof context.query === 'string' || context.target._unresolved) {
    return
  }

  // FIXME: doesn't work for rows
  if (context.query.INSERT && context.query.INSERT.rows) {
    return
  }

  // REVISIT: integrity check needs context.data
  if (Object.keys(context.data).length === 0) {
    if (context.context.data) {
      context.data = context.context.data
    } else if (context.query.DELETE) {
      context.data = context._beforeDeleteData
    }
  }
  if (Object.keys(context.data).length === 0) {
    return
  }

  await processDeepAsync(checkIntegrityWrapper(context, csn, run), context.data, context.target, false, true)
}

const _addDraftDataToContext = (context, result) => {
  validateDraft(result, context)

  if (context.rejected) {
    return
  }

  if (!context._draftMetadata) {
    context._draftMetadata = {}
  }

  DRAFT_ADMIN_COLUMNS.forEach(column => {
    if (column in result[0]) context._draftMetadata[column] = result[0][column]
  })

  context.data.DraftAdministrativeData_DraftUUID = result[0].DraftUUID
}

const rejectSkippedEntity = context => {
  context.reject(
    501,
    process.env.NODE_ENV === 'production'
      ? undefined
      : `The entity "${
        context.target.name
      }" is annotated with "@sap.persistence.skip", please implement a custom handler for it.`
  )
}

const addDraftDataFromExistingDraft = async (context, service) => {
  const parent = getParent(service, context)
  let result

  if (parent && parent.IsActiveEntity === 'false') {
    const parentWhere = [{ ref: [parent.keyName] }, '=', { val: parent.keyValue }]
    result = await context.run(_getSelectDraftDataCqn(context, parent.entityName, parentWhere))
    _addDraftDataToContext(context, result)
    return result
  }

  if (!parent) {
    const keys = Object.keys(context.target.keys)
    const rootWhere = keys.reduce((res, key) => {
      if (key === 'IsActiveEntity') {
        return res
      }
      res[key] = context.data[key]
      return res
    }, {})

    result = await context.run(_getSelectDraftDataCqn(context, ensureNoDraftsSuffix(context.target.name), rootWhere))
    if (result && result.length > 0) {
      _addDraftDataToContext(context, result)
    }
    return result
  }

  return []
}

const addGeneratedDraftUUID = async context => {
  context._draftMetadata = context._draftMetadata || {}
  context.data.DraftAdministrativeData_DraftUUID = generateUUID()
  context._draftMetadata.DraftUUID = context.data.DraftAdministrativeData_DraftUUID
}

const _updateNavigationApprovals = (restrictedProperty, navigationApprovals) => {
  if (restrictedProperty.InsertRestrictions && restrictedProperty.InsertRestrictions.Insertable === true) {
    navigationApprovals.Insertable = true
  }
  if (restrictedProperty.UpdateRestrictions && restrictedProperty.UpdateRestrictions.Updatable === true) {
    navigationApprovals.Updatable = true
  }
  if (restrictedProperty.DeleteRestrictions && restrictedProperty.DeleteRestrictions.Deletable === true) {
    navigationApprovals.Deletable = true
  }
}

const _getNavigationApprovals = (target, serviceEntities) => {
  const navigationApprovals = {}

  for (const serviceEntity of serviceEntities) {
    if (serviceEntity['@Capabilities.NavigationRestrictions.RestrictedProperties']) {
      for (const restrictedProperty of serviceEntity['@Capabilities.NavigationRestrictions.RestrictedProperties']) {
        if (serviceEntity.elements[restrictedProperty.NavigationProperty['=']].target === target.name) {
          _updateNavigationApprovals(restrictedProperty, navigationApprovals)
        }
      }
    }
  }
  return navigationApprovals
}

const getScenario = (entity, serviceEntities) => {
  if (entity['@readonly']) {
    return '@readonly'
  }

  if (entity['@insertonly']) {
    return '@insertonly'
  }

  let navApprovals = _getNavigationApprovals(entity, serviceEntities)

  let scenario = 'Not'
  if (entity['@Capabilities.InsertRestrictions.Insertable'] === false && !navApprovals.Insertable) {
    scenario += 'Insertable'
  }

  if (entity['@Capabilities.UpdateRestrictions.Updatable'] === false && !navApprovals.Updatable) {
    scenario += 'Updatable'
  }

  if (entity['@Capabilities.DeleteRestrictions.Deletable'] === false && !navApprovals.Deletable) {
    scenario += 'Deletable'
  }

  if (scenario.length > 3) {
    return scenario
  }
  return 'default'
}

/*
 * merge CQNs
 */
const _mergeExpandCQNs = (cqn, cqns) => {
  for (const c of cqns) {
    const cols = c.SELECT.columns.filter(col => col.expand)
    for (const col of cols) {
      if (!cqn.SELECT.columns.find(ele => ele.ref[0] === col.ref[0])) {
        cqn.SELECT.columns.push(col)
      }
    }
  }
}

/*
 * build and merge CQNs for (to many) compositions with input data
 */
const _getExpandCqnForInstance = (elementKey, data, context, definitions) => {
  let cqn

  const target = definitions[context.target.elements[elementKey].target]
  let compData = data[elementKey]
  if (target && compData) {
    if (!Array.isArray(compData)) {
      compData = [compData]
    }

    const cqns = []
    for (const data of compData) {
      cqns.push(getDeepSelect({ statements: context.statements, target, data }, definitions))
    }
    cqn = cqns[0]
    cqns.length > 0 && _mergeExpandCQNs(cqn, cqns)
  }

  return cqn
}

/*
 * build and merge CQNs for (batch) input data
 */
const _getExpandCqnForEntity = (elementKey, context, definitions) => {
  let cqn

  const data = Array.isArray(context.data) ? context.data : [context.data]

  let cqns = []
  for (const d of data) {
    cqns.push(_getExpandCqnForInstance(elementKey, d, context, definitions))
  }
  cqns = cqns.filter(cqn => cqn !== undefined)

  cqn = cqns[0]
  cqns.length > 0 && _mergeExpandCQNs(cqn, cqns)

  return cqn
}

const _columnsNoSkippedNoAssocNoDraft = elements =>
  Object.keys(elements).filter(
    k =>
      !DRAFT_COLUMNS.includes(k) &&
      !_isAssociation(elements[k]) &&
      !(elements[k]._target && elements[k]._target['@cds.persistence.skip'] === true)
  )

const _columnsAssocToOne = elements => Object.keys(elements).filter(k => _isAssociation(elements[k]))
const _addKeysRef = elements => {
  const keys = []
  for (const k of elements) {
    keys.push({ ref: [k.ref[0]] })
  }
  return keys
}

const _mergeAssocToOneColumns = (colsAssocToOne, context, cqn) => {
  if (colsAssocToOne.length !== 0) {
    for (const assocCol of colsAssocToOne) {
      const assocKeys = context.target.elements[assocCol].keys
      if (assocKeys) {
        const assocC = {
          ref: [assocCol],
          expand: _addKeysRef(assocKeys)
        }
        cqn.SELECT.columns = cqn.SELECT.columns ? cqn.SELECT.columns.concat(assocC) : [assocC]
      }
    }
  }
}

/*
 * recursively builds a select cqn for deep read after write
 * (depth determined by context.data)
 */
const getDeepSelect = (context, definitions, draft) => {
  let cqn
  const cols = _columnsNoSkippedNoAssocNoDraft(context.target.elements)
  // root? -> with where clause
  if (context.event) {
    if (!allKeysAreProvided(context)) throw new Error('Not all keys provided')
    cqn = getSelectCQN(context, cols)
  } else {
    cqn = cds.ql.SELECT.from(context.target).columns(...cols)
  }
  const colsAssocToOne = _columnsAssocToOne(context.target.elements)
  _mergeAssocToOneColumns(colsAssocToOne, context, cqn)
  if (draft) {
    cqn.SELECT.columns = cqn.SELECT.columns.concat(DRAFT_COLUMNS_FOR_CQN_SELECT)
  }

  const comps = cols.filter(k => _isComposition(context.target.elements[k]))
  if (comps.length > 0) {
    for (const k of comps) {
      const expandCqn = _getExpandCqnForEntity(k, context, definitions)

      // transform cqn to expand OR remove composition column if no data in input
      const colIndex = cqn.SELECT.columns.findIndex(col => col.ref && Array.isArray(col.ref) && col.ref[0] === k)
      if (expandCqn && expandCqn.SELECT && expandCqn.SELECT.columns) {
        cqn.SELECT.columns[colIndex].expand = expandCqn.SELECT.columns
      } else {
        cqn.SELECT.columns.splice(colIndex, 1)
      }
    }
  }

  return cqn
}

module.exports = {
  addDraftDataFromExistingDraft,
  addGeneratedDraftUUID,
  getDeepSelect,
  allKeysAreProvided,
  getSelectCQN,
  getScenario,
  checkNotNull,
  checkIntegrityUtil,
  flattenDeepToOneAssociations,
  rejectSkippedEntity
}
