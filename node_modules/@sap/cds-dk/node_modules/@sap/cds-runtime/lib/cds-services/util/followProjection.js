// FIXME: move to rest as only used there

const _newData = (data, transition) => {
  const newData = { ...data }
  Object.keys(newData)
    .filter(key => transition.has(key))
    .forEach(key => {
      const value = data[key]
      newData[transition.get(key)] = value
      delete newData[key]
    })
  return newData
}

const _newColumns = (columns, transition, withAlias = false) => {
  const newColumns = []
  ;(columns || []).forEach(column => {
    const transitioned = column.ref && transition.get(column.ref[0])
    if (transitioned) {
      const newColumn = { ...column }
      if (withAlias) {
        newColumn.as = column.ref[0]
      }
      newColumn.ref = [transition.get(column.ref[0])]
      newColumns.push(newColumn)
    } else {
      newColumns.push(column)
    }
  })
  return newColumns
}

const _newInsertColumns = (columns, transition) => {
  const newColumns = []
  ;(columns || []).forEach(column => {
    const transitioned = transition.get(column)
    if (transitioned) {
      newColumns.push(transitioned)
    } else {
      newColumns.push(column)
    }
  })
  return newColumns
}

const _newEntries = (entries, transition) => {
  const newEntries = []
  ;(entries || []).forEach(entry => {
    newEntries.push(_newData(entry, transition))
  })
  return newEntries
}

const _newWhere = (where, transition) => {
  const newWhere = []
  ;(where || []).forEach(whereElement => {
    const transitioned = whereElement.ref && transition.get(whereElement.ref[0])
    if (transitioned) {
      const newWhereElement = { ...whereElement }
      newWhereElement.ref = [transitioned]
      newWhere.push(newWhereElement)
    } else {
      newWhere.push(whereElement)
    }
  })
  return newWhere
}

const _name = target => target.name.id || target.name

const _isProjectionToRemoteService = (target, service) => {
  if (!target || !target.name) return false
  const targetName = _name(target)
  if (!target['@mashup'] && targetName.startsWith(service.name)) return false

  const source = target.query && target.query._target
  if (!source) return false
  if (source.query) {
    return _isProjectionToRemoteService(source, service)
  }
  const sourceName = _name(source)
  if (!sourceName.startsWith(service.name)) return false
  else return true
}

const _newUpdate = (query, transition, targetName) => {
  const newUpdate = { ...query.UPDATE }
  newUpdate.entity = targetName
  newUpdate.data = _newData({ ...(newUpdate.data || {}), ...(newUpdate.with || {}) }, transition)
  if (newUpdate.where) newUpdate.where = _newWhere(newUpdate.where, transition)
  return newUpdate
}

const _newSelect = (query, transition, queryTarget, targetName) => {
  const newSelect = { ...query.SELECT }
  newSelect.from = { ...newSelect.from }
  newSelect.from.ref = [targetName]
  if (!newSelect.columns) {
    newSelect.columns = queryTarget.query.SELECT.columns.map(column => ({
      ref: [column.as || column.ref[0]]
    }))
  }
  newSelect.columns = _newColumns(newSelect.columns, transition, true)
  if (newSelect.having) newSelect.having = _newColumns(newSelect.having, transition)
  if (newSelect.groupBy) newSelect.groupBy = _newColumns(newSelect.groupBy, transition)
  if (newSelect.orderBy) newSelect.orderBy = _newColumns(newSelect.orderBy, transition)
  if (newSelect.where) newSelect.where = _newWhere(newSelect.where, transition)
  return newSelect
}

const _newInsert = (query, transition, targetName) => {
  const newInsert = { ...query.INSERT }
  newInsert.into = targetName
  if (newInsert.columns) newInsert.columns = _newInsertColumns(newInsert.columns, transition)
  if (newInsert.entries) newInsert.entries = _newEntries(newInsert.entries, transition)
  return newInsert
}

const _newDelete = (query, transition, targetName) => {
  const newDelete = { ...query.DELETE }
  newDelete.from = targetName
  if (newDelete.where) newDelete.where = _newWhere(newDelete.where, transition)
  return newDelete
}

const _queryTarget = (query, service) => {
  const _target = query._target
  if (
    _target &&
    !_target.elements &&
    service.model &&
    _target.name &&
    service.model.definitions[_target.name.id || _target.name]
  ) {
    return service.model.definitions[_target.name.id || _target.name]
  }

  return _target
}
// Find aliased column from the projection and set it as ref
const _renameColumns = (query, columns) => {
  for (const col of query.SELECT.columns) {
    if (typeof col === 'object' && col.ref && col.as && col.ref[0] !== col.as) {
      for (const initCol of columns) {
        if (initCol.ref[0] === col.as) {
          initCol.ref[0] = col.ref[0]
        }
      }
    }
  }
}

const _getTransitionData = (target, columns) => {
  const transitionColumns = columns
  if (target.query && target.query.SELECT && target.query.SELECT.columns) {
    _renameColumns(target.query, transitionColumns)

    if (target.query._target) {
      return _getTransitionData(target.query._target, transitionColumns)
    }
  }

  return { target, transitionColumns }
}

module.exports = (query, service) => {
  // If the query is a projection, one must follow it
  // to let the underlying service know its true entity.

  const queryTarget = _queryTarget(query, service)
  if (_isProjectionToRemoteService(queryTarget, service)) {
    const { target, transitionColumns } = _getTransitionData(queryTarget, queryTarget.query.SELECT.columns || [])
    const transition = new Map(transitionColumns.map(key => [key.as, key.ref[0]]))
    const newQuery = {}
    Object.setPrototypeOf(newQuery, query)
    for (const prop in newQuery) {
      if (prop === 'UPDATE') {
        newQuery.UPDATE = _newUpdate(newQuery, transition, target.name)
      } else if (prop === 'SELECT') {
        newQuery.SELECT = _newSelect(newQuery, transition, queryTarget, target.name)
      } else if (prop === 'INSERT') {
        newQuery.INSERT = _newInsert(newQuery, transition, target.name)
      } else if (prop === 'DELETE') {
        newQuery.DELETE = _newDelete(newQuery, transition, target.name)
      }
    }
    newQuery.target = queryTarget.query.target
    return newQuery
  }
  return query
}
