const InsertResult = require('../utils/InsertResult')

/**
 * Generic Handler for CREATE requests.
 * REVISIT: add description
 *
 * @param req - cds.Request
 */
module.exports = async function (req) {
  if (typeof req.query === 'string') {
    return this._execute.sql(this.dbc, req.query, req.data)
  }

  try {
    const results = await this._insert(this.model, this.dbc, req.query, req)
    return new InsertResult(req, results)
  } catch (err) {
    // If entry is available, reject event
    // REVISIT: db specifics
    if (err.message.match(/unique constraint/i)) {
      // REVISIT: Steals original error
      req.reject(400, 'Entity Already Exists')
    }
    req.reject(err)
  }
}
