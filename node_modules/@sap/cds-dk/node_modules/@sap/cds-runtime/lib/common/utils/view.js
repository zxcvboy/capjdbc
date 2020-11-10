const cds = global.cds || require('@sap/cds/lib')
// REVISIT: use follow projection

const { getTargetData } = require('./data')

const _determineInputStructure = query => {
  if (query.INSERT) {
    if (query.INSERT.entries) {
      return query.INSERT.entries
    }

    if (query.INSERT.columns) {
      return query.INSERT.columns.reduce((obj, col) => {
        obj[col] = undefined
        return obj
      }, {})
    }
  }

  if (query.UPDATE) {
    return Object.assign({}, query.UPDATE.data || {}, query.UPDATE.with || {})
  }
}

const resolveCqnIfView = (query, target) => {
  // Find input structure
  const input = _determineInputStructure(query)

  let { target: newTarget, data } = getTargetData(target, Object.assign({}, Array.isArray(input) ? input[0] : input))
  if (Array.isArray(input)) {
    data = [data]
    for (let i = 1; i < input.length; i++) {
      data.push(getTargetData(target, Object.assign({}, input[i])).data)
    }
  }

  if (newTarget === target) {
    return query
  }

  if (query.INSERT) {
    if (query.INSERT.entries) {
      return cds.ql.INSERT.into(newTarget).entries(data)
    }

    const insert = cds.ql.INSERT.into(newTarget)

    if (query.INSERT.columns) {
      insert.columns(Object.keys(data))
    }

    if (query.INSERT.rows) {
      return insert.rows(query.INSERT.rows)
    }

    return insert.values(query.INSERT.values)
  }

  // REVISIT: update statement does not accept cqn partial as input
  const update = cds.ql.UPDATE('x')
  update.UPDATE.entity = { ref: [newTarget.name] }

  if (query.UPDATE.entity.as) {
    update.UPDATE.entity.as = query.UPDATE.entity.as
  }

  if (query.UPDATE.where) {
    update.where(query.UPDATE.where)
  }

  update.UPDATE.with = data // we combine 'data' and 'with' here, however as it might contain expressions we use UPDATE.with
  return update
}

module.exports = {
  resolveCqnIfView
}
