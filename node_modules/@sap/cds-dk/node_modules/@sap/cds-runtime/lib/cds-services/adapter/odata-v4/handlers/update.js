const {
  Components: { DATA_UPDATE_HANDLER }
} = require('@sap/odata-server')

const cds = global.cds || require('@sap/cds/lib')
const DRAFT_COLUMNS = ['IsActiveEntity', 'HasActiveEntity', 'HasDraftEntity', 'DraftAdministrativeData_DraftUUID']

const ODataRequest = require('../ODataRequest')

const { getSapMessages } = require('../../../../common/error/frontend')
const { toODataResult } = require('../utils/event')
const { validateResourcePath } = require('../utils/request')
const { removeContainmentKeys } = require('../utils/handlerUtils')
const { getDeepSelect } = require('../../../services/utils/handlerUtils')

const _addETag = (odataReq, req, result) => {
  if (odataReq.getConcurrentResource() !== null) {
    const element = Object.values(req.target.elements).find(ele => ele['@odata.etag'])
    result['*@odata.etag'] = result[element.name]
  }
}

const { COMMON, ODATA } = require('../../../../common/constants/annotation')

function _isDraftEntity (target) {
  return (
    target &&
    (target[ODATA.DRAFT] || target[COMMON.DRAFT_NODE.PREP_ACTION] || target.name.endsWith('.DraftAdministrativeData'))
  )
}

const _columnsForTestRead = target => {
  const columns = Object.keys(target.elements).filter(
    k =>
      target.elements[k].type !== 'cds.Association' &&
      target.elements[k].type !== 'cds.Composition' &&
      !target.elements[k].virtual &&
      !DRAFT_COLUMNS.includes(k) // > getDeepSelect() used in onCreate._getResult() does the same
  )

  return columns
}

const _readAfterWrite = async (service, req, tx) => {
  if (req.event === 'UPDATE') {
    return tx.run(cds.ql.SELECT.from(req.query.UPDATE.entity, _columnsForTestRead(req.target)))
  } else {
    // UPSERT
    return tx.run(getDeepSelect(req, service.model.definitions))
  }
}

const _isUpsertAllowed = target =>
  cds.db &&
  !(cds.env.runtime && cds.env.runtime.allow_upsert === false) &&
  target['@cds.persistence.skip'] !== true &&
  !_isDraftEntity(target)

const _autoExpandIfNecessary = (req, result) => {
  if (cds.env.odata_x4) {
    require('../utils/autoExpandToOne')(req.target, result)
  }
}

/**
 * The handler that will be registered with odata-v4.
 *
 * In case of success it calls next with the number of updated entries as result.
 * In case of error it calls next with error.
 *
 * @param {Service} service
 * @param {Object} options
 * @return {Function}
 */
const update = (service, options) => {
  return async (odataReq, odataRes, next) => {
    // End here if length is greater then allowed
    validateResourcePath(odataReq, options, service.model)

    // TODO: Measure ODataIn, also in other handlers

    const req = new ODataRequest(DATA_UPDATE_HANDLER, service, odataReq, odataRes)
    const changeset = odataReq.getAtomicityGroupId()
    let root
    if (changeset) {
      odataReq.getBatchApplicationData().roots[changeset]._adopt(req, service)
    } else {
      root = new cds.Request({ user: req.user })
      root._adopt(req, service)
    }

    // rewrite req for UPSERT if needed
    // REVISIT: use srv.dispatch, custom handlers might override db access
    if (_isUpsertAllowed(req.target)) {
      const read = await cds.tx(req).run(cds.ql.SELECT.from(req.query.UPDATE.entity, [1]))

      if (read.length === 0) {
        req.query = cds.ql.INSERT.into(req.target).entries(req.data)
        req.event = 'CREATE'
      }
    }

    service
      .dispatch(req)
      .then(async result => {
        if (req._.readAfterWrite) {
          const testRead = await _readAfterWrite(service, req, cds.tx(req))
          result = testRead[0]
        }

        root && root._commit && (await root._commit())

        _addETag(odataReq, req, result)
        _autoExpandIfNecessary(req, result)
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

module.exports = update
