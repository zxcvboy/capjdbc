const { fillKeysDeep } = require('../../cds-services/util/dataProcessUtils')

function _handler (req) {
  fillKeysDeep(this.model.definitions, req.data, req.target)
}

_handler._initial = true

module.exports = function () {
  this.before(['CREATE', 'UPDATE', 'NEW', 'PATCH'], '*', _handler)
}
