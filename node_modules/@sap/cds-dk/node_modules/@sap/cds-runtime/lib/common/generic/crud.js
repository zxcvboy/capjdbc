const cds = global.cds || require('@sap/cds/lib')

const _getSelectCQN = (query, columns) => {
  const cqn = cds.ql.SELECT.from(query.UPDATE.entity, columns)

  if (query.UPDATE.entity.as) {
    cqn.SELECT.from.as = query.UPDATE.entity.as
  }

  // REVISIT: compat mode for service functions .update
  if (query.UPDATE && query.UPDATE.where) {
    cqn.where(query.UPDATE.where)
  }
  return cqn
}

module.exports = function () {
  this.on(['CREATE', 'READ', 'UPDATE', 'DELETE'], '*', async req => {
    if (typeof req.query !== 'string' && req.target['@cds.persistence.skip'] === true) {
      req.reject(501, 'PERSISTENCE_SKIP_NO_GENERIC_CRUD', [req.target.name])
    }

    if (!cds.db) {
      // REVISIT: error message
      req.reject(501, `No database connection.`)
    }

    const tx = cds.tx(req)
    const result = await tx.run(req.query, req.data)

    if (req.event === 'READ') {
      return result
    }

    if (req.event === 'DELETE') {
      if (result === 0) {
        req.reject(404)
      }
      return result
    }

    // flag to trigger read after write in protocol adapter
    req._.readAfterWrite = true

    if (req.event === 'UPDATE') {
      if (result === 0) {
        const testRead = await tx.run(_getSelectCQN(req.query, [1]))
        if (testRead.length === 0) req.reject(404)
      }
    }

    return req.data
  })
}
