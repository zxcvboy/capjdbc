const RestRequest = require('../RestRequest')

const { parseCreateUrl } = require('../utils/parse-url')
const handleError = require('../utils/handle-error')
const { validationChecks, validateReturnType } = require('../utils/validation-checks')
const { contentTypeCheck } = require('../utils/header-checks')
const { base64toBuffer, bufferToBase64 } = require('../utils/binary')

const _locationHeader = (entity, serviceName, resultObject) => {
  const keyName = Object.keys(entity.keys)[0]
  const entityNameWithoutServicePrefix = entity.name.replace(`${serviceName}.`, '')

  return `../${entityNameWithoutServicePrefix}/${resultObject[keyName]}`
}

const _convertCustomOperationReturnValue = (returns, result) => {
  if (returns.items) {
    return result
  } else {
    return Array.isArray(result) ? result[0] : result
  }
}

const _isBatch = req => {
  return Array.isArray(req.data)
}

/*
 * optimistically transforms result from flat to complex based on input
 */
const _transformToComplex = (data, req) => {
  const isBatch = _isBatch(req)
  if (!Array.isArray(data)) data = [data]

  for (let i = 0; i < data.length; i++) {
    const d = data[i]
    const cd = isBatch ? req.data[i] : req.data

    const props = Object.keys(d)
    const keys = Object.keys(cd).filter(k => !props.includes(k))

    for (const k of keys) {
      const inner = props.filter(p => p.startsWith(`${k}_`)).map(p => p.split(`${k}_`)[1])
      if (inner.length > 0) {
        d[k] = {}
        for (const i of inner) {
          d[k][i] = d[`${k}_${i}`]
          delete d[`${k}_${i}`]
        }
      }
    }
  }

  return isBatch ? data : data[0]
}

const create = service => {
  return (restReq, restRes) => {
    const contentTypeError = contentTypeCheck(restReq)
    if (contentTypeError) return handleError(contentTypeError, service, restReq, restRes)
    let parsedUrl
    try {
      parsedUrl = parseCreateUrl(service, restReq)
    } catch (err) {
      return handleError(err, service, restReq, restRes)
    }

    base64toBuffer(restReq.body, parsedUrl.segments[0])

    const req = new RestRequest(parsedUrl, service, restReq, restRes)

    const err = validationChecks(
      req.event,
      req.data,
      req.target && req.target.elements ? req.target : { elements: parsedUrl.segments[0].params }
    )
    if (err) return handleError(err, service, restReq, restRes)

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
        _transformToComplex(result, req)

        restRes.status(201)

        bufferToBase64(result, parsedUrl.segments[0])

        if (Array.isArray(result)) {
          restRes.send(result)
        } else {
          restRes.set('location', _locationHeader(req.target, service.name, result))
          restRes.send(result)
        }
      })
      .catch(err => {
        // Hide errors in generic message but log detailed error
        handleError(err, service, restReq, restRes)
      })
  }
}

module.exports = create
