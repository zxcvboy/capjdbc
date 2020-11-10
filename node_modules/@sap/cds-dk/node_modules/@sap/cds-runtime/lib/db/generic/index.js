// before
const rewrite = require('./rewrite')
const virtual = require('./virtual')
const keys = require('./keys')
const managed = require('./managed')
const integrity = require('./integrity')
// on
const CREATE = require('./create')
const READ = require('./read')
const UPDATE = require('./update')
const DELETE = require('./delete')
// after
const structured = require('./structured')
const arrayed = require('./arrayed')

module.exports = {
  rewrite,
  virtual,
  keys,
  managed,
  integrity,
  CREATE,
  READ,
  UPDATE,
  DELETE,
  structured,
  arrayed
}
