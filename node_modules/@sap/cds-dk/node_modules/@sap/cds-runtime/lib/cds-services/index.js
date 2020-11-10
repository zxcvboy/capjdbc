const publicAPI = {
  to: {
    odata_v4 (service) {
      return require('./adapter/odata-v4/to')(service)
    },
    rest (service) {
      return require('./adapter/rest/to')(service)
    }
  },
  passport (...args) {
    return require('../common/auth/passport')(...args)
  },
  performanceMeasurement (...args) {
    return require('./adapter/perf/performanceMeasurement')(...args)
  },
  get statements () {
    const statements = require('./statements')
    Object.defineProperty(publicAPI, 'statements', { value: statements })
    return statements
  },
  get version () {
    const version = require('../../package').version
    Object.defineProperty(publicAPI, 'version', { value: version })
    return version
  }
}

module.exports = publicAPI
