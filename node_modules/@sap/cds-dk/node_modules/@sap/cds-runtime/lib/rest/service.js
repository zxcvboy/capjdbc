const cds = global.cds || require('@sap/cds/lib')
const followProjection = require('../cds-services/util/followProjection')
const { getKind, run, getDestination, getAdditionalOptions, getReqOptions, postProcess } = require('./utils/service')

class RestService extends cds.Service {
  init () {
    this.destination = this.options.credentials && this.options.credentials.destination
    this.requestTimeout = this.options.credentials && this.options.credentials.requestTimeout
    if (this.requestTimeout === null || this.requestTimeout === undefined) this.requestTimeout = 60000
    this.path = this.options.credentials && this.options.credentials.path
    this.datasource = this.options.datasource
    this.kind = getKind(this.options) // TODO: Simplify
    this._cqnToQueryOptions = {
      generateKeyPath: require(`./utils/cqnToQuery/generate${this.kind === 'odata' ? 'OData' : 'Rest'}KeyPath`) // TODO: Inheritance
    }

    if (!this.destination && process.env.NODE_ENV === 'production') {
      throw new Error('In production mode it is required to set `options.destination`')
    }

    this.on('*', async (req, next) => {
      let { query } = req
      if (!query && !(typeof req.path === 'string')) return next()
      if (query) query = followProjection(query, this)
      if (!this.destination) this.destination = getDestination(this.model, this.datasource, this.options)
      const reqOptions = getReqOptions(req, query, this)
      Object.assign(reqOptions.headers, req.headers)
      const additionalOptions = getAdditionalOptions(req, this.destination, this.kind)
      const result = await run(reqOptions, additionalOptions)
      return postProcess(query, result)
    })
  }
}

module.exports = RestService
