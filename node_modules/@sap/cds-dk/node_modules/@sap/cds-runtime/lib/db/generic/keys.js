const { fillKeysDeep } = require('../../cds-services/util/dataProcessUtils')

function _handler (req) {
  if (
    !this.model ||
    !this.model.definitions ||
    typeof req.query === 'string' ||
    req.target._unresolved ||
    !['CREATE', 'UPDATE'].includes(req.event)
  ) {
    return
  }
  const generate = req.event === 'CREATE'
  if (req.query && req.query.INSERT && (req.query.INSERT.rows || req.query.INSERT.values)) return // we only support entries
  fillKeysDeep(this.model.definitions, req.data, req.target, generate)
}

_handler._initial = true

module.exports = _handler
