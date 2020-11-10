const getError = require('../../../../common/error')

const contentTypeCheck = req => {
  if (req.headers['content-type'] && req.headers['content-type'] !== 'application/json') {
    return getError(415, "Invalid Content-Type. Only 'application/json' is supported.")
  }
}
module.exports = {
  contentTypeCheck
}
