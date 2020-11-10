const {
  Components: { DATA_CREATE_HANDLER }
} = require('@sap/odata-server')
const cds = global.cds || require('@sap/cds/lib')

const ODataRequest = require('../ODataRequest')

const { getSapMessages } = require('../../../../common/error/frontend')
const { toODataResult } = require('../utils/event')
const { validateResourcePath } = require('../utils/request')
const { removeContainmentKeys } = require('../utils/handlerUtils')
const { getDeepSelect } = require('../../../services/utils/handlerUtils')
const _addETag = (req, context, result) => {
  if (req.getConcurrentResource() !== null) {
    const etagElement = Object.values(context.target.elements).find(element => {
      return element['@odata.etag']
    })

    result['*@odata.etag'] = result[etagElement.name]
  }
}

/**
 * The handler that will be registered with odata-v4.
 * @param {Service} service
 * @param {Object} options
 * @return {Function}
 */
const create = (service, options) => {
  return (odataReq, odataRes, next) => {
    // End here if length is greater then allowed
    validateResourcePath(odataReq, options, service.model)

    const req = new ODataRequest(DATA_CREATE_HANDLER, service, odataReq, odataRes)
    const changeset = odataReq.getAtomicityGroupId()
    let root
    if (changeset) {
      odataReq.getBatchApplicationData().roots[changeset]._adopt(req, service)
    } else {
      root = new cds.Request({ user: req.user })
      root._adopt(req, service)
    }

    service
      .dispatch(req)
      .then(async result => {
        if (req._.readAfterWrite) {
          const tx = cds.tx(req)
          const data = await tx.run(getDeepSelect(req, service.model.definitions))
          result = data[0]
        }

        root && root._commit && (await root._commit())

        _addETag(odataReq, req, result)
        if (cds.env.odata_x4) {
          require('../utils/autoExpandToOne')(req.target, result)
        }
        removeContainmentKeys(service.model, req.target.name, result)

        req.messages && odataRes.setHeader('sap-messages', getSapMessages(req.messages, req._.req))

        next(null, toODataResult(result))
      })
      .catch(async err => {
        try {
          root && root._rollback && (await root._rollback())
        } catch (e) {
          // > rollback failed... REVISIT: what to do?
        }

        req.messages && odataRes.setHeader('sap-messages', getSapMessages(req.messages, req._.req))

        next(err)
      })
  }
}

module.exports = create
