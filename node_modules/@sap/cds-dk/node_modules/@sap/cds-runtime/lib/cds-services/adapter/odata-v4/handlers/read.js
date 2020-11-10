const {
  QueryOptions,
  Components: { DATA_READ_HANDLER },
  uri: {
    UriResource: {
      ResourceKind: { BOUND_FUNCTION, COUNT, FUNCTION_IMPORT, NAVIGATION_TO_ONE, VALUE, SINGLETON }
    }
  }
} = require('@sap/odata-server')
const cds = global.cds || require('@sap/cds/lib')

const ODataRequest = require('../ODataRequest')

const getError = require('../../../../common/error')
const { getSapMessages } = require('../../../../common/error/frontend')
const { isCustomOperation, skipToken } = require('../utils/request')
const { toODataResult } = require('../utils/event')
const { actionAndFunctionQueries, getActionOrFunctionReturnType } = require('../utils/handlerUtils')
const { validateResourcePath } = require('../utils/request')
const { isStreaming, getContentType } = require('../utils/stream')
const { removeContainmentKeys, isSingleton } = require('../utils/handlerUtils')

/**
 * Checks whether a bound function or function import is invoked.
 * @param {Array} segments - The uri path segments of the request.
 * @returns {boolean} - True if a function is invoked, else false.
 * @private
 */
const _isFunction = segments => [BOUND_FUNCTION, FUNCTION_IMPORT].includes(segments[segments.length - 1].getKind())

/**
 * Invoke a function.
 * @param {Object} service
 * @param {Object} req
 * @param {Array} segments
 * @return {Promise}
 * @private
 */
const _invokeFunction = (service, req, odataReq, changeset) => {
  return service.dispatch(req).then(async result => {
    const functionReturnType = getActionOrFunctionReturnType(
      odataReq.getUriInfo().getPathSegments(),
      service.model.definitions
    )
    if (functionReturnType && functionReturnType.kind === 'entity' && odataReq.getQueryOptions()) {
      await actionAndFunctionQueries(req, odataReq, result, service, changeset)
    }

    return toODataResult(result, req)
  })
}

/**
 * Checks whether a count of entities is requested
 * (not count embedded into collection).
 * @param {Array} segments - The uri path segments of the request.
 * @returns {boolean} - True if a count of entities is requested, else false.
 * @private
 */
const _isCount = segments => {
  return segments[segments.length - 1].getKind() === COUNT
}

/**
 * Get the count by using the general READ CQN and alter it to a COUNT query.
 * @param {Object} service
 * @param {Object} readReq
 * @param {boolean} shareReq
 * @return {Promise}
 * @private
 */
const _getCount = (service, readReq) => {
  // REVISIT: this process appears to be rather clumsy

  // Copy CQN including from and where and changing columns
  const select = readReq.statements.SELECT.from(readReq.query.SELECT.from, [{ 'COUNT(1)': 'counted' }])

  if (readReq.query.SELECT.where) {
    select.SELECT.where = readReq.query.SELECT.where
  }

  const req = readReq

  // preserve _target
  select._target = req.query._target

  // remove as Object.defineProperty would cause a conflict
  delete req.query

  // Define new CQN
  req.query = select

  return (
    service
      .dispatch(req)
      // Transform into scalar result
      .then(result => {
        return result[0] && result[0].counted ? result[0].counted : 0
      })
  )
}

/**
 * Checks whether a collection of entities or a single entity is requested.
 * Returns false in case of a custom operation.
 * @returns {boolean} - True if a collection of entities is requested, else false.
 * @private
 */
const _isCollection = segments => {
  const lastEntitySegment = Array.from(segments)
    .reverse()
    .find(segment => segment.getProperty() === null)
  const kind = lastEntitySegment.getKind()

  return (
    !isCustomOperation(segments) &&
    kind !== NAVIGATION_TO_ONE &&
    kind !== COUNT &&
    kind !== VALUE &&
    kind !== SINGLETON &&
    lastEntitySegment.getKeyPredicates().length === 0
  )
}

/**
 * Checks whether the count needs to be included in the result set as an annotation.
 * @param {Object} req - The odata-v4 request.
 * @returns {boolean}
 * @private
 */
const _checkIfCountToBeIncluded = req => {
  return req.getUriInfo().getQueryOption(QueryOptions.COUNT)
}

/**
 * Checks whether single entity via navigation-to-one is requested.
 * @returns {boolean}
 * @private
 */
const _isNavigationToOne = segments => {
  return segments[segments.length - 1].getKind() === NAVIGATION_TO_ONE
}

const _hasRedirectProperty = elements => {
  return Object.values(elements).some(val => {
    return val['@Core.IsURL']
  })
}

const _addMediaType = (key, entry, mediaType) => {
  if (mediaType) {
    if (typeof mediaType === 'object') {
      entry[`${key}@odata.mediaContentType`] = entry[Object.values(mediaType)[0]]
    } else {
      entry[`${key}@odata.mediaContentType`] = mediaType
    }
  }
}

const _transformRedirectProperties = (req, result) => {
  if (!Array.isArray(result) || result.length === 0) {
    return
  }

  // optimization
  if (!_hasRedirectProperty(req.target.elements)) {
    return
  }

  for (const entry of result) {
    for (const key of Object.keys(entry)) {
      if (entry[key] !== undefined && req.target.elements[key]['@Core.IsURL']) {
        entry[`${key}@odata.mediaReadLink`] = entry[key]
        _addMediaType(key, entry, req.target.elements[key]['@Core.MediaType'])
        delete entry[key]
      }
    }
  }
}

/**
 * Reading the full entity or only a property of it is alike.
 * In case of an entity, odata-v4 wants the value an object structure,
 * in case of a property as scalar.
 * @param {Object} service
 * @param {Object} req
 * @param {Array} segments
 * @return {Promise}
 * @private
 */
const _readEntityOrProperty = (service, req, segments) => {
  return service.dispatch(req).then(result => {
    if (!Array.isArray(result)) result = [result]

    if (result.length === 0 && _isNavigationToOne(segments)) {
      return toODataResult(null)
    }

    // Reading one entity or a property of it should yield only a result length of one.
    if (result.length !== 1) {
      throw getError(404)
    }

    const index = segments[segments.length - 1].getKind() === VALUE ? 2 : 1
    const propertyElement = segments[segments.length - index].getProperty()

    if (propertyElement === null) {
      _transformRedirectProperties(req, result)

      return toODataResult(result[0])
    }

    const modifiedResult = toODataResult(result[0][propertyElement.getName()])

    // property is read via a to one association and last segment is not $value
    if (index !== 2 && segments.length > 2) {
      // find keys in result
      const keys = Object.keys(result[0])
        .filter(k =>
          segments[segments.length - index - 1]
            .getEdmType()
            .getOwnKeyPropertyRefs()
            .has(k)
        )
        .reduce((res, curr) => {
          res[curr] = result[0][curr]
          return res
        }, {})
      // prepare key map for Okra
      modifiedResult.keysForParam = new Map().set(segments[segments.length - index - 1], keys)
    }

    return modifiedResult
  })
}

/**
 * Read an entity collection without including the count of the total amount of entities.
 * @param {Object} service
 * @param {Object} req
 * @param {Object} req
 * @return {Promise}
 * @private
 */
const _readCollectionNoCount = (service, req, odataReq) => {
  return service.dispatch(req).then(result => {
    const modifiedResult = toODataResult(result, req)

    const limit = req.query && req.query.SELECT.limit && req.query.SELECT.limit.rows && req.query.SELECT.limit.rows.val
    if (limit && limit === result.length && limit !== odataReq.getUriInfo().getQueryOption(QueryOptions.TOP)) {
      modifiedResult['*@odata.nextLink'] = skipToken(odataReq.getUriInfo()) + limit
    }

    _transformRedirectProperties(req, result)

    return modifiedResult
  })
}

/**
 * Read an entity collection and include the count count of the total amount of entities.
 * odata-v4 wants the count to be added as annotation.
 * @param {Object} service
 * @param {Object} req
 * @param {Object} req
 * @return {Promise}
 * @private
 */
const _readCollectionWithCount = (service, req, odataReq) => {
  req.query.SELECT.count = true

  return _readCollectionNoCount(service, req, odataReq).then(result => {
    result['*@odata.count'] = result.value.$count
    return result
  })
}

/**
 * Reading the full entity or only a property of it is alike.
 * In case of an entity, odata-v4 wants the value an object structure,
 * in case of a property as scalar.
 * @param {Object} service
 * @param {Object} req
 * @param {Array} segments
 * @return {Promise}
 * @private
 */
const _readStream = (service, req, segments, changeset) => {
  req.query._streaming = true

  return service.dispatch(req).then(result => {
    // REVISIT: compat, should actually be treated as object
    if (!Array.isArray(result)) result = [result]

    // Reading one entity or a property of it should yield only a result length of one.
    if (result.length === 0 || result[0] === undefined) {
      throw getError(404)
    }

    if (result.length > 1) {
      throw getError(400)
    }

    if (result[0] === null) {
      return null
    }

    const streamObj = result[0]
    const stream = streamObj.value

    if (stream) {
      stream.on('error', () => {
        stream.removeAllListeners('error')
        // stream.destroy() does not end stream in node 10 and 12
        stream.push(null)
      })
    }

    // REVISIT: we shouldn't have to read stuff here anymore, or we should use own transaction
    return getContentType(segments, service.name, service.model.definitions, req, changeset).then(contentType => {
      if (contentType) {
        streamObj['*@odata.mediaContentType'] = contentType
      }

      return streamObj
    })
  })
}

/**
 * Depending on the read request segments, create one ore more reading service request.
 * @param {Object} service
 * @param {Object} req
 * @param {Object} req
 * @return {Promise}
 * @private
 */
const _readAndTransform = (service, req, odataReq, changeset) => {
  // REVISIT: check what is still needed and cleanup!

  const segments = odataReq.getUriInfo().getPathSegments()

  if (_isFunction(segments)) {
    return _invokeFunction(service, req, odataReq)
  }

  // Scalar count is requested
  if (_isCount(segments)) {
    return _getCount(service, req).then(result => {
      return toODataResult(result)
    })
  }

  if (_isCollection(segments)) {
    if (_checkIfCountToBeIncluded(odataReq)) {
      return _readCollectionWithCount(service, req, odataReq)
    }

    return _readCollectionNoCount(service, req, odataReq)
  }

  if (isStreaming(segments)) {
    return _readStream(service, req, segments, changeset)
  }

  if (isSingleton(req.target)) {
    return service.dispatch(req).then(result => {
      if (result === null && !req.target['@odata.singleton.nullable']) {
        throw getError(404)
      }

      return toODataResult(result, req)
    })
  }

  return _readEntityOrProperty(service, req, segments)
}

const _addETag = (odataReq, req, result) => {
  if (odataReq.getConcurrentResource() !== null) {
    const element = Object.values(req.target.elements).find(ele => ele['@odata.etag'])
    if (Array.isArray(result.value)) {
      result.value.forEach(val => {
        val['*@odata.etag'] = val[element.name]
      })
    } else {
      result.value['*@odata.etag'] = result.value[element.name]
    }
  }
}

const _removeKeysForParams = result => {
  let options

  if (result.keysForParam) {
    options = { keys: result.keysForParam }
    delete result.keysForParam
  }

  return options
}

/**
 * The handler that will be registered with odata-v4.
 *
 * If an entity collection is read, it calls next with result as an Array with all entities of the collection.
 * If a count of the entities in the collection is requested, it uses number of the entities as a Number value.
 * If an single entity is read, it uses the entity as an object.
 * If a property of a single entity is requested (e.g. /Books(1)/name), it unwraps the property from the result.
 * If the single entity to be read does not exist, calls next with error to return a 404.
 * In all other failure cases it calls next with error to return a 500.
 *
 * @param {Service} service
 * @param {Object} options
 * @return {Function}
 */
const read = (service, options) => {
  return (odataReq, odataRes, next) => {
    // End here if length is greater then allowed
    validateResourcePath(odataReq, options, service.model)

    const req = new ODataRequest(DATA_READ_HANDLER, service, odataReq, odataRes)
    const changeset = odataReq.getAtomicityGroupId()
    if (changeset) {
      odataReq.getBatchApplicationData().roots[changeset]._adopt(req, service)
    }

    // Get the service result(s) and hand them over the odata-v4
    _readAndTransform(service, req, odataReq, changeset)
      .then(result => {
        if (result === null) {
          return next(null, { value: null }, {})
        }
        _addETag(odataReq, req, result)
        const options = _removeKeysForParams(result)
        if (cds.env.odata_x4) {
          require('../utils/autoExpandToOne')(req.target, result.value)
        }
        if (req.target) {
          removeContainmentKeys(service.model, req.target.name, result.value)
        }

        req.messages && odataRes.setHeader('sap-messages', getSapMessages(req.messages, req._.req))

        next(null, result, options)
      })
      .catch(err => {
        req.messages && odataRes.setHeader('sap-messages', getSapMessages(req.messages, req._.req))

        next(err)
      })
  }
}

module.exports = read
