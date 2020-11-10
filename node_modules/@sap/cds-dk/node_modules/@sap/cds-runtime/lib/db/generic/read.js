// REVISIT: ReadResult?!
// const ReadResult = require('../utils/ReadResult')

/**
 * Generic Handler for READ requests.
 * REVISIT: add description
 *
 * @param req - cds.Request
 */
module.exports = async function (req) {
  if (typeof req.query === 'string') {
    return this._execute.sql(this.dbc, req.query, req.data)
  }

  // REVISIT: should be handled in protocol adapter
  // execute validation query first to fail early
  if (req.query._validationQuery) {
    const validationResult = await this._read(this.model, this.dbc, req.query._validationQuery, req)

    if (validationResult.length === 0) {
      // > validation target (e.g., root of navigation) doesn't exist
      req.reject(404)
    }
  }

  const result = await this._read(this.model, this.dbc, req.query, req)

  if (req.query._validationQuery && req.query._validationQuery.__navToMany && result.length === 0) {
    // > navigation to collection without result -> 404
    req.reject(404)
  }

  return result
}
