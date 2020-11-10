const cqn2cqn4sql = require('../../common/utils/cqn2cqn4sql')
const getColumns = require('../utils/columns')

const _isDraft = req => {
  return (
    req.target &&
    ((typeof req.target.name === 'string' && req.target.name.endsWith('_drafts')) ||
      typeof req.target.name === 'object') // > union, which is (currently) only the case with draft
  )
}

const _rewriteExpandAsterisks = (expand, entity, ref) => {
  const targetEntity = entity.elements[ref]._target

  expand.forEach(col => {
    if (col.ref && col.expand) {
      _rewriteExpandAsterisks(col.expand, targetEntity, col.ref[0])
    }
  })

  const asteriskColumnIndex = expand.findIndex(col => {
    return col === '*'
  })

  if (asteriskColumnIndex !== -1) {
    expand.splice(asteriskColumnIndex, 1)
    getColumns(targetEntity).forEach(col => {
      expand.push({ ref: [col.name] })
    })
  }
}

const _rewriteAsterisks = req => {
  if (!_isDraft(req) && req.query.SELECT && req.query.SELECT.columns) {
    const asteriskColumnIndex = req.query.SELECT.columns.findIndex(col => {
      return col.ref && col.ref[0] === '*'
    })

    if (asteriskColumnIndex !== -1) {
      req.query.SELECT.columns.splice(asteriskColumnIndex, 1)
      getColumns(req.target).forEach(col => {
        req.query.SELECT.columns.push({ ref: [col.name] })
      })
    }

    req.query.SELECT.columns.forEach(col => {
      if (col.ref && col.ref[0] !== 'DraftAdministrativeData' && col.expand && req.target) {
        _rewriteExpandAsterisks(col.expand, req.target, col.ref[0])
      }
    })
  }
}

function handler (req) {
  // REVISIT: req.target._unresolved for join queries
  if (!this.model || typeof req.query === 'string' /* || !req.target || req.target._unresolved */) {
    return
  }

  const streaming = req.query._streaming
  const validationQuery = req.query._validationQuery

  _rewriteAsterisks(req)

  // convert to sql cqn
  req.query = cqn2cqn4sql(req.query, this.model)

  if (streaming) req.query._streaming = streaming
  if (validationQuery) req.query._validationQuery = validationQuery
}

handler._initial = true

module.exports = handler
