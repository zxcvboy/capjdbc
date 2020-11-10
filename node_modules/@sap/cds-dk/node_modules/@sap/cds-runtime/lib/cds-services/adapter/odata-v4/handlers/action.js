const {
  Components: { ACTION_EXECUTE_HANDLER }
} = require('@sap/odata-server')

const ODataRequest = require('../ODataRequest')

const { getSapMessages } = require('../../../../common/error/frontend')
const { toODataResult } = require('../utils/event')
const { actionAndFunctionQueries, getActionOrFunctionReturnType } = require('../utils/handlerUtils')
const { validateResourcePath } = require('../utils/request')

/*
 * Get the returns object for the (un)bound action from CSN.
 */
const _getTypeReturns = (definitions, req, service) => {
  if (req.event === 'draftPrepare' || req.event === 'EDIT' || req.event === 'draftActivate') {
    return 'Other'
  }

  if (
    req.target &&
    req._.odataReq
      .getUriInfo()
      .getLastSegment()
      .getKind() === 'BOUND.ACTION'
  ) {
    return definitions[req.target.name].actions[req.event].returns
  }

  // Also support correct req.event without service prefix
  return (definitions[req.event] || definitions[`${service.name}.${req.event}`]).returns
}

/*
 * Check if the return is an array or any other.
 */
const _getActionReturnType = (service, req) => {
  const returns = _getTypeReturns(service.model.definitions, req, service)

  return returns && returns.items ? 'Array' : 'Other'
}

/**
 * The handler that will be registered with odata-v4.
 * @param {Service} service
 * @param {Object} options
 * @return {Function}
 */
const action = (service, options) => {
  return (odataReq, odataRes, next) => {
    // End here if length is greater then allowed
    validateResourcePath(odataReq, options, service.model)

    const req = new ODataRequest(ACTION_EXECUTE_HANDLER, service, odataReq, odataRes)
    const changeset = odataReq.getAtomicityGroupId()
    if (changeset) {
      odataReq.getBatchApplicationData().roots[changeset]._adopt(req, service)
    }

    service
      .dispatch(req)
      .then(async result => {
        // REVISIT: harmonize getactionreturntype functions
        const actionReturnType = getActionOrFunctionReturnType(
          odataReq.getUriInfo().getPathSegments(),
          service.model.definitions
        )
        if (actionReturnType && actionReturnType.kind === 'entity' && odataReq.getQueryOptions()) {
          await actionAndFunctionQueries(req, odataReq, result, service, changeset)
        }

        if (odataReq.getConcurrentResource() !== null) {
          const etagElement = Object.values(req.target.elements).find(element => {
            return element['@odata.etag']
          })

          if (result && result[etagElement.name]) {
            result['*@odata.etag'] = result[etagElement.name]
          }
        }

        req.messages && odataRes.setHeader('sap-messages', getSapMessages(req.messages, req._.req))

        next(null, toODataResult(result, _getActionReturnType(service, req)))
      })
      .catch(err => {
        req.messages && odataRes.setHeader('sap-messages', getSapMessages(req.messages, req._.req))

        next(err)
      })
  }
}

module.exports = action
