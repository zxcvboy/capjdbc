const RestRequest = require('../RestRequest')

const { parseReadUrl } = require('../utils/parse-url')
const handleError = require('../utils/handle-error')
const getError = require('../../../../common/error')
const { bufferToBase64 } = require('../utils/binary')
const { validateReturnType } = require('../utils/validation-checks')

const _convertCustomOperationReturnValue = (returns, result) => {
  if (returns.items) {
    return result
  }

  return Array.isArray(result) ? result[0] : result
}

const read = service => {
  return (restReq, restRes) => {
    let parsedUrl

    try {
      parsedUrl = parseReadUrl(service, restReq)
    } catch (err) {
      return handleError(err, service, restReq, restRes)
    }

    const req = new RestRequest(parsedUrl, service, restReq, restRes)

    if (parsedUrl.customOperation) {
      const operation = parsedUrl.segments[parsedUrl.segments.length - 1]

      return service
        .dispatch(req)
        .then(result => {
          if (!operation.returns) {
            return restRes.status(204).send()
          }

          validateReturnType(service, req, operation, result)

          bufferToBase64(result, parsedUrl.segments[0])

          restRes.status(200)
          restRes.send(_convertCustomOperationReturnValue(operation.returns, result))
        })
        .catch(err => {
          // Hide errors in generic message but log detailed error
          handleError(err, service, restReq, restRes)
        })
    }

    return service
      .dispatch(req)
      .then(result => {
        // REVISIT
        if (!Array.isArray(result)) result = [result]

        bufferToBase64(result, parsedUrl.segments[0])

        if (parsedUrl.isCollection) {
          restRes.status(200)
          restRes.send(result)

          return
        }

        if (result.length !== 1) {
          throw getError(404, 'The server has not found a resource matching the Data Services Request URI.')
        }

        restRes.status(200)
        restRes.send(result[0])
      })
      .catch(err => {
        // Hide errors in generic message but log detailed error
        handleError(err, service, restReq, restRes)
      })
  }
}

module.exports = read
