const OData = require('./OData')
const Dispatcher = require('./Dispatcher')
const cds = global.cds || require('@sap/cds/lib')

const to = service => {
  let edm, odata

  // REVISIT: !snapi still needed?
  /* istanbul ignore else */
  if (cds.env.features && cds.env.features.snapi) {
    const compileOpts = Object.assign({ service: service.options.service }, service.model.meta.options)
    compileOpts.version = compileOpts.odataVersion
    edm = cds.compile.to.edm(service.model, compileOpts)
    odata = new OData(edm, service.model, service.options)
  } else {
    edm = cds.compile.to.edm(service._csn, { service: service.options.service, version: 'v4' })
    odata = new OData(edm, service._csn, service.options)
  }

  odata.addCDSServiceToChannel(service)

  return new Dispatcher(odata).getService()
}

module.exports = to
