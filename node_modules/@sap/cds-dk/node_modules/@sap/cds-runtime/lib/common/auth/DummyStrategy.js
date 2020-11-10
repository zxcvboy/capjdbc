// REVISIT: use cds.User once ready
const User = require('./User')

class DummyStrategy {
  constructor () {
    this.name = 'dummy'
  }
  authenticate (req) {
    const dummy = new User({ _dummy: true, id: 'dummy' })
    Object.defineProperty(dummy, '_req', { enumerable: false, value: req })
    Object.defineProperty(dummy, 'is', {
      get () {
        return () => {
          return true
        }
      }
    })
    this.success(dummy)
  }
}

module.exports = DummyStrategy
