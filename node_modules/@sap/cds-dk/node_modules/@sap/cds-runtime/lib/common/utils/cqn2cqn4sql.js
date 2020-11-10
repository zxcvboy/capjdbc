const { getTargetData } = require('./data')
const { resolveCqnIfView } = require('./view')
const { getOnCond } = require('../../common/utils/generateOnCond')
const cds = global.cds || require('@sap/cds/lib')

const ensureNoDraftsSuffix = name => name.replace(/_drafts$/g, '')

const _addOnCondToWhere = (cqn, entity, tableAlias, identifier, csn) => {
  const onCond = getOnCond(
    csn.definitions[entity.previous].elements[entity.current],
    entity.current,
    csn,
    tableAlias,
    identifier
  )

  cqn.where(onCond)
}

const _addAliasToElement = (e, alias) => {
  if (e.ref) {
    return { ref: [alias, ...e.ref] }
  }

  if (e.list) {
    return { list: e.list.map(arg => _addAliasToElement(arg, alias)) }
  }

  if (e.func) {
    const args = e.args.map(arg => _addAliasToElement(arg, alias))
    return { ...e, args }
  }

  return e
}

const _addAliasToExpression = (expression, alias) => {
  if (!alias) {
    return expression
  }

  return expression.map(e => _addAliasToElement(e, alias))
}

const convertPathExpressionToWhere = (fromClause, model) => {
  if (fromClause.ref.length === 1) {
    const target = fromClause.ref[0].id || fromClause.ref[0]
    const alias = fromClause.as
    const where = fromClause.ref[0].where

    return { target, alias, where }
  }

  let previousSelect, previousEntityName, tableAlias
  for (let i = 0; i < fromClause.ref.length; i++) {
    tableAlias = `T${i}`
    const currentEntityName =
      i === 0
        ? fromClause.ref[i].id
        : model.definitions[previousEntityName].elements[fromClause.ref[i].id || fromClause.ref[i]].target

    const currentSelect = cds.ql.SELECT.from(`${currentEntityName} as ${tableAlias}`)

    if (fromClause.ref[i].where) {
      currentSelect.where(_addAliasToExpression(fromClause.ref[i].where, tableAlias))
    }

    if (i !== fromClause.ref.length - 1) {
      currentSelect.columns([1])
    }

    if (previousSelect) {
      _addOnCondToWhere(
        previousSelect,
        { current: fromClause.ref[i].id || fromClause.ref[i], previous: previousEntityName },
        tableAlias,
        `T${i - 1}`,
        model
      )
      currentSelect.where('exists', previousSelect)
    }

    previousSelect = currentSelect
    previousEntityName = currentEntityName
  }

  return {
    target: previousEntityName,
    alias: tableAlias,
    where: previousSelect && previousSelect.SELECT && previousSelect.SELECT.where
  }
}

const _convertPathExpressionForInsertOrDelete = (intoClause, model) => {
  // .into is plain string or csn entity
  if (typeof intoClause === 'string' || intoClause.name) {
    return intoClause
  }

  return intoClause.ref.reduce((res, curr, i) => {
    if (i === 0) {
      return curr.id || curr
    }
    return model.definitions[res].elements[curr.id || curr].target
  }, '')
}

const _resolveStructured = (columnName, subElements, model, flattenedElements) => {
  if (!subElements) {
    return
  }

  for (const structElement in subElements) {
    if (subElements[structElement].kind === 'type') {
      _resolveStructured(
        `${columnName}_${subElements[structElement].name}`,
        subElements[structElement].elements,
        model,
        flattenedElements
      )
      continue
    }
    flattenedElements.push({ ref: [`${columnName}_${structElement}`] })
  }
}

const _getEntityNames = from => {
  if (from.ref) {
    return [ensureNoDraftsSuffix(from.ref[0])]
  }

  if (Array.isArray(from.args)) {
    // TODO this only considers first level refs and not from sub selects
    return from.args.filter(arg => arg.ref).map(arg => ensureNoDraftsSuffix(arg.ref[0]))
  }

  return []
}

const _flattenStructuredForExpand = (column, expandedEntity, model) => {
  const flattenedElements = []
  const toBeDeleted = []
  for (const expandElement of column.expand) {
    const propertyName = expandElement.ref[expandElement.ref.length - 1]
    if (expandElement.expand) {
      _flattenStructuredForExpand(expandElement, expandedEntity.elements[propertyName]._target, model)
      continue
    }
    const element = expandedEntity.elements[expandElement.ref[0]]
    if (element && element.kind === 'type') {
      toBeDeleted.push(propertyName)
      _resolveStructured(propertyName, element.elements, model, flattenedElements)
    }
  }

  column.expand = column.expand.filter(e => !toBeDeleted.includes(e.ref[e.ref.length - 1]))
  column.expand.push(...flattenedElements)
}

const _flatten = (SELECT, model, flattenedElements, toBeDeleted) => {
  const entityNames = _getEntityNames(SELECT.from) // TODO consider alias for custom CQNs?
  for (const entityName of entityNames) {
    const csnEntity = model.definitions[entityName]
    for (const column of SELECT.columns) {
      if (!column.ref) continue
      const propertyName = column.ref[column.ref.length - 1]
      if (column.expand) {
        _flattenStructuredForExpand(column, csnEntity.elements[propertyName]._target, model)
        continue
      }
      const element = csnEntity.elements[propertyName]
      if (element && element.kind === 'type') {
        toBeDeleted.push(propertyName)
        _resolveStructured(propertyName, element.elements, model, flattenedElements)
      }
    }
  }
}

const _flattenStructured = (SELECT, model) => {
  if (Array.isArray(SELECT.columns) && SELECT.columns.length > 0) {
    const flattenedElements = []
    const toBeDeleted = []
    _flatten(SELECT, model, flattenedElements, toBeDeleted)
    SELECT.columns = SELECT.columns.filter(e => (e.ref && !toBeDeleted.includes(e.ref[e.ref.length - 1])) || e.func)
    SELECT.columns.push(...flattenedElements)
  }
}

const _convertSelect = (cqn, model) => {
  // no path expression
  if (!cqn.SELECT.from.ref || (cqn.SELECT.from.ref.length === 1 && !cqn.SELECT.from.ref[0].where)) {
    if (cds.env.odata_x4 && cqn.SELECT.columns) {
      _flattenStructured(cqn.SELECT, model)
    }
    return cqn
  }
  const { target, alias, where } = convertPathExpressionToWhere(cqn.SELECT.from, model)

  const select = cds.ql.SELECT.from(target)

  if (alias) {
    select.SELECT.from.as = alias
  }

  // TODO: REVISIT: We need to add alias to subselect in .where, .columns, .from, ... etc
  if (where) {
    select.where(where)
  }
  if (cqn.SELECT.where) {
    select.where(_addAliasToExpression(cqn.SELECT.where, select.SELECT.from.as))
  }

  // We add all previous properties ot the newly created query.
  // Reason is to not lose the query API functionality
  Object.assign(select.SELECT, cqn.SELECT, { from: select.SELECT.from, where: select.SELECT.where })

  if (cds.env.odata_x4 && select.SELECT.columns) {
    _flattenStructured(select.SELECT, model)
  }

  return select
}

const _getElement = (column, columns, target) => {
  if (!target) return

  if (columns) {
    // if columns is defined, column is index and row[column] should contain value that belongs to name in columns with same index
    return target.elements[columns[column]]
  }

  return target.elements[column]
}

const _handleArrayedElements = (rows, target, columns) => {
  for (const row of rows) {
    for (const column in row) {
      const element = _getElement(column, columns, target)

      if (element && element.is2one) {
        _handleArrayedElements([row[column]], element._target, columns)
      } else if (element && element.is2many) {
        _handleArrayedElements(row[column], element._target, columns)
      } else if (element && element.kind === 'type') {
        _handleArrayedElements([row[column]], element, columns)
      } else if (Array.isArray(row[column])) {
        row[column] = JSON.stringify(row[column])
      }
    }
  }
}

const _convertInsert = (cqn, model) => {
  // resolve path expression
  const resolvedIntoClause = _convertPathExpressionForInsertOrDelete(cqn.INSERT.into, model)

  // overwrite only .into, foreign keys are already set
  const insert = cds.ql.INSERT.into(resolvedIntoClause)

  // REVISIT flatten structured types, currently its done in SQL builder

  // We add all previous properties ot the newly created query.
  // Reason is to not lose the query API functionality
  Object.assign(insert.INSERT, cqn.INSERT, { into: resolvedIntoClause })

  const targetName = insert.INSERT.into.name || insert.INSERT.into
  const queryTarget = model.definitions[ensureNoDraftsSuffix(targetName)]

  if (cds.env.odata_x4) {
    if (cqn.INSERT.entries) {
      _handleArrayedElements(cqn.INSERT.entries, queryTarget)
    } else if (cqn.INSERT.rows) {
      _handleArrayedElements(cqn.INSERT.rows, queryTarget, cqn.INSERT.columns)
    } else if (cqn.INSERT.values) {
      _handleArrayedElements([cqn.INSERT.values], queryTarget, cqn.INSERT.columns)
    }
  }

  if (queryTarget && !targetName.endsWith('_drafts')) {
    return resolveCqnIfView(insert, queryTarget)
  }

  return insert
}

const _convertDelete = (cqn, model) => {
  const fromClause = _convertPathExpressionForInsertOrDelete(cqn.DELETE.from, model)

  if (!model.definitions[fromClause]) {
    return cqn
  }
  const newDelete = cds.ql.DELETE.from(getTargetData(model.definitions[fromClause]).target.name)
  // TODO: delete on to one not yet supported
  const whereClause = cqn.DELETE.from.ref ? cqn.DELETE.from.ref[cqn.DELETE.from.ref.length - 1].where : undefined

  if (cqn.DELETE.from.as) {
    // continue current support for deep delete
    const newTarget = newDelete.DELETE.from
    newDelete.DELETE.from = { ref: [newTarget], as: cqn.DELETE.from.as }
  }

  if (whereClause) {
    newDelete.where(whereClause)
  }

  if (cqn.DELETE.where) {
    newDelete.where(cqn.DELETE.where)
  }

  return newDelete
}

function _plainUpdate (model, cqn) {
  const queryTarget = model.definitions[cqn.UPDATE.entity.name || cqn.UPDATE.entity]

  if (cds.env.odata_x4) {
    cqn.UPDATE.data && _handleArrayedElements([cqn.UPDATE.data], queryTarget)
    cqn.UPDATE.set && _handleArrayedElements([cqn.UPDATE.set], queryTarget)
  }

  if (queryTarget) {
    return resolveCqnIfView(cqn, queryTarget)
  }

  return cqn
}

const _convertUpdate = (cqn, model) => {
  // REVISIT flatten structured types, currently its done in SQL builder

  // .into is plain string or csn entity
  if (typeof cqn.UPDATE.entity === 'string' || cqn.UPDATE.entity.name) {
    return _plainUpdate(model, cqn)
  }

  const { target, alias, where } = convertPathExpressionToWhere(cqn.UPDATE.entity, model)

  // link .with and .data and set query target and remove current where clause
  // REVISIT: update statement does not accept cqn partial as input
  const update = cds.ql.UPDATE('x')
  Object.assign(update.UPDATE, cqn.UPDATE, { entity: target, where: undefined })

  if (alias) {
    update.UPDATE.entity = { ref: [target], as: alias }
  }

  if (where) {
    update.where(where)
  }
  if (cqn.UPDATE.where) {
    update.where(_addAliasToExpression(cqn.UPDATE.where, alias))
  }

  const queryTarget = model.definitions[target]

  if (cds.env.odata_x4) {
    cqn.UPDATE.data && _handleArrayedElements([cqn.UPDATE.data], queryTarget)
    cqn.UPDATE.set && _handleArrayedElements([cqn.UPDATE.set], queryTarget)
  }

  if (queryTarget) {
    return resolveCqnIfView(update, queryTarget)
  }

  return update
}

/**
 * Converts a CQN with path expression into exists clause.
 * Converts insert/update/delete on view to target table including renaming of properties
 *
 * @param {*} cqn - incoming query
 * @param {*} model - csn model
 */
const cqn2cqn4sql = (cqn, model) => {
  if (cqn.DELETE) {
    return _convertDelete(cqn, model)
  }

  if (cqn.SELECT) {
    return _convertSelect(cqn, model)
  }

  if (cqn.INSERT) {
    return _convertInsert(cqn, model)
  }

  if (cqn.UPDATE) {
    return _convertUpdate(cqn, model)
  }

  return cqn
}

module.exports = cqn2cqn4sql
