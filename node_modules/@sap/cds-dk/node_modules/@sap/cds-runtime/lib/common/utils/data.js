// REVISIT: use follow projection

const getError = require('../error')

const _renameData = (query, data) => {
  if (query.SELECT && query.SELECT.columns) {
    for (const col of query.SELECT.columns) {
      if (typeof col === 'object' && col.ref && col.as && col.ref[0] !== col.as) {
        if (data[col.as]) {
          data[col.ref[0]] = data[col.as]
          delete data[col.as]
        }
      }
    }
  }
}

const getTargetData = (target, data = {}) => {
  if (target.query) {
    _renameData(target.query, data)

    if (target.query._target) {
      return getTargetData(target.query._target, data)
    }

    if (!target.query.from || target.query.from.length > 1 || target.query.where) {
      throw getError(501, 'Insert, Update or Delete on views with join|union|where is not supported')
    }

    return { target: target.query.from[0].absolute, data }
  }

  return { target, data }
}

module.exports = {
  getTargetData
}
