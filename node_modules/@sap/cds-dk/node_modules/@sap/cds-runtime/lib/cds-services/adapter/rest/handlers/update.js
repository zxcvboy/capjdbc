const cds = global.cds || require('@sap/cds/lib')

const RestRequest = require('../RestRequest')

const { parseUpdateUrl } = require('../utils/parse-url')
const handleError = require('../utils/handle-error')
const { validationChecks } = require('../utils/validation-checks')
const { contentTypeCheck } = require('../utils/header-checks')
const { base64toBuffer, bufferToBase64 } = require('../utils/binary')

// REVISIT: copied from atomicity group end
const _endBatchUpdate = async (root, err) => {
  const event = err ? 'failed' : 'succeeded'
  try {
    // REVISIT: event payload?
    for (let each of root.listeners(event)) await each.call(root)
  } catch (e) {
    if (event !== 'failed') {
      try {
        for (let each of root.listeners('failed')) await each.call(root, e)
      } catch (e1) {
        // > rollback failed... REVISIT: what to do?
      }
    } else {
      // > rollback failed... REVISIT: what to do?
    }
  } finally {
    for (let each of root.listeners('done')) await each.call(root)
  }
}

const _isUpsertAllowed = target =>
  cds.db && !(cds.env.runtime && cds.env.runtime.allow_upsert === false) && target['@cds.persistence.skip'] !== true

const _rewriteUpsertQueries = async function (req) {
  if (Array.isArray(req.query)) {
    // query can be an array, need to check if some of them are inserts
    const reads = await Promise.all(req.query.map(q => cds.db.tx(req).run(cds.ql.SELECT.from(q.UPDATE.entity, [1]))))
    for (let i = 0; i < reads.length; i++) {
      if (reads[i].length === 0) req.query[i] = cds.ql.INSERT.into(req.target).entries(req.data[i])
    }
  } else {
    const read = await cds.db.tx(req).run(cds.ql.SELECT.from(req.query.UPDATE.entity, [1]))

    if (read.length === 0) {
      req.query = cds.ql.INSERT.into(req.target).entries(req.data)
      req.event = 'CREATE'
    }
  }
}

const update = service => {
  return async (restReq, restRes) => {
    const contentTypeErr = contentTypeCheck(restReq)
    if (contentTypeErr) return handleError(contentTypeErr, service, restReq, restRes)
    let parsedUrl
    try {
      parsedUrl = parseUpdateUrl(service.entities, restReq)
    } catch (err) {
      return handleError(err, service, restReq, restRes)
    }

    base64toBuffer(restReq.body, parsedUrl.segments[0])

    const req = new RestRequest(parsedUrl, service, restReq, restRes)

    const err = validationChecks(req.event, req.data, req.target)
    if (err) return handleError(err, service, restReq, restRes)

    if (_isUpsertAllowed(req.target)) {
      await _rewriteUpsertQueries(req)
    }

    let processedEvent

    if (Array.isArray(req.query)) {
      const tx = service.transaction(req)
      processedEvent = Promise.all(req.query.map(q => tx.run(q)))
    } else {
      processedEvent = service.dispatch(req)
    }

    return processedEvent
      .then(async result => {
        if (Array.isArray(req.query)) {
          await _endBatchUpdate(req)
        }

        bufferToBase64(result, parsedUrl.segments[0])
        // FOLLOW-UP: allow mtx to set status code to 202
        // FOLLOW-UP: default is 200
        // restRes.status(200)
        restRes.send(result)
      })
      .catch(async err => {
        if (Array.isArray(req.query)) {
          await _endBatchUpdate(req, err)
        }

        // Hide errors in generic message but log detailed error
        handleError(err, service, restReq, restRes)
      })
  }
}

module.exports = update
