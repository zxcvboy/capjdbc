const {
  Components: { DATA_DELETE_HANDLER }
} = require('@sap/odata-server')

const ODataRequest = require('../ODataRequest')

const { getSapMessages } = require('../../../../common/error/frontend')
const { validateResourcePath } = require('../utils/request')

/**
 * The handler that will be registered with odata-v4.
 * @param {Service} service
 * @param {Object} options
 * @return {Function}
 */
const del = (service, options) => {
  return (odataReq, odataRes, next) => {
    // End here if length is greater then allowed
    validateResourcePath(odataReq, options, service.model)

    const req = new ODataRequest(DATA_DELETE_HANDLER, service, odataReq, odataRes)
    const changeset = odataReq.getAtomicityGroupId()
    if (changeset) {
      odataReq.getBatchApplicationData().roots[changeset]._adopt(req, service)
    }

    service
      .dispatch(req)
      .then(() => {
        req.messages && odataRes.setHeader('sap-messages', getSapMessages(req.messages, req._.req))

        next(null, null)
      })
      .catch(err => {
        req.messages && odataRes.setHeader('sap-messages', getSapMessages(req.messages, req._.req))

        next(err)
      })
  }
}

module.exports = del
