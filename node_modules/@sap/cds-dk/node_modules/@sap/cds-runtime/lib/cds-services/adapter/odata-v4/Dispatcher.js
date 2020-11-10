const serviceFactory = require('../../services/service_factory')
const OData = require('./OData')
const cds = global.cds || require('@sap/cds/lib')

class Dispatcher {
  /**
   * Constructs an Dispatcher for OData service.
   * New OData services will be created in case of extensibility.
   *
   * @param odata
   */
  constructor (odata) {
    this._odata = odata
  }

  _enableMtx () {
    if (!this._extMap) {
      this._extMap = new Map()
      cds.mtx.eventEmitter.on(cds.mtx.events.TENANT_UPDATED, async tenantId => {
        this._extMap.delete(tenantId)
      })
    }
  }

  _addCustomHandlers (service) {
    service._handlers = this._odata._cdsService._handlers
  }

  async _getProtocolAndService (tenantId) {
    const csn = await cds.mtx.getCsn(tenantId)

    // REVISIT: !snapi still needed?
    /* istanbul ignore else */
    if (cds.env.features && cds.env.features.snapi) {
      this._odata._options.reflectedModel = cds.linked(cds.compile.for.odata(csn, { version: 'v4' }))
    } else {
      this._odata._options.reflectedModel = cds.linked(cds.compile.for.odata(csn))
    }

    const service = serviceFactory(csn, this._odata._options)
    this._addCustomHandlers(service)
    service._isExtended = true
    const edm = cds.compile.to.edm(csn, { service: service.options.service, version: 'v4' })
    const odata = new OData(edm, csn, this._odata._options)
    odata.addCDSServiceToChannel(service)

    return odata
  }

  async _processExtTenant (req, res) {
    try {
      if (!this._extMap.has(req.user.tenant)) {
        this._extMap.set(req.user.tenant, await this._getProtocolAndService(req.user.tenant))
      }

      this._extMap.get(req.user.tenant).process(req, res)
    } catch (err) {
      res.status(500).send({
        error: {
          code: 'null',
          message: 'Internal Server Error'
        }
      })
    }
  }

  /**
   * Dispatch request in case of extensibility to other odata adapters.
   * @private
   */
  dispatch (req, res) {
    if (cds.mtx && Object.keys(cds.mtx).length !== 0 && req.user && req.user.tenant) {
      this._enableMtx()
      this._processExtTenant(req, res)
    } else {
      this._odata.process(req, res)
    }
  }

  /**
   * Return service middleware, which can be used by node server, express, connect, ...
   * @returns {function}
   */
  getService () {
    return (req, res) => {
      this.dispatch(req, res)
    }
  }
}

module.exports = Dispatcher
