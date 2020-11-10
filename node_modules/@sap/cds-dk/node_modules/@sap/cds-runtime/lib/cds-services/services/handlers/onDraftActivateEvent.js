const cds = global.cds || require('@sap/cds/lib')

const { activeVersionExists, ensureNoDraftsSuffix, ensureDraftsSuffix } = require('../utils/draftUtils')
const { readAndDeleteKeywords, isActiveEntityRequested } = require('../utils/draftWhereUtils')
const { readDraftCompositionTree } = require('../utils/readDraftCompositionTree')
const { isDraftRootEntity } = require('../utils/compositionTree')
const _isLocked = (InProcessByUser, id) => InProcessByUser && InProcessByUser !== id

const _getDeleteDraftAdminCqn = (draftUUID, DELETE) =>
  DELETE.from('DRAFT.DraftAdministrativeData').where([{ ref: ['DraftUUID'] }, '=', { val: draftUUID }])

const _getDeleteRootDraftCqn = (targetName, rootWhere, DELETE) => DELETE.from(targetName).where(rootWhere)

/**
 * Generic Handler for draftActivate requests.
 * In case of success it triggers an 'UPDATE' or 'CREATE' event.
 *
 * @param context - operation object, that provides error, continuation and other functions as well as information
 * regarding the current operation.
 * @alias module:handlers.onDraftActivate
 */
const onDraftActivateEvent = service => async req => {
  if (
    isActiveEntityRequested(req.query.SELECT.from.ref[0].where || []) ||
    req.query.SELECT.from.ref.length > 2 ||
    !isDraftRootEntity(service.model.definitions, ensureNoDraftsSuffix(req.target.name))
  ) {
    req.reject(400)
  }

  const draftCompositionTree = await readDraftCompositionTree(service, req)

  if (draftCompositionTree.data.length === 0) {
    req.reject(404)
  }

  if (_isLocked(draftCompositionTree.administrativeData.InProcessByUser, req.user.id)) {
    req.reject(403)
  }

  req._draftMetadata = draftCompositionTree.administrativeData

  // new object to have 'real' object
  const data = Object.assign({}, draftCompositionTree.data[0])

  const deleteDraftAdminCqn = _getDeleteDraftAdminCqn(req._draftMetadata.DraftUUID, req.statements.DELETE)
  const deleteRootDraftCqn = _getDeleteRootDraftCqn(
    ensureDraftsSuffix(req.target.name),
    req.query.SELECT.from.ref[0].where,
    req.statements.DELETE
  )

  await Promise.all([req.run(deleteDraftAdminCqn), req.run(deleteRootDraftCqn)])

  let query, event
  if (await activeVersionExists(req)) {
    readAndDeleteKeywords(['IsActiveEntity'], req.query.SELECT.from.ref[0].where)
    event = 'UPDATE'
    // REVSIIT: setting data should be part of ql
    query = cds.ql.UPDATE(req.target).where(req.query.SELECT.from.ref[0].where)
    query.UPDATE.data = data
  } else {
    event = 'CREATE'
    query = cds.ql.INSERT.into(req.target).entries(data)
  }

  // REVISIT: _draftMetadata
  const r = new cds.Request({ event, query, data, _draftMetadata: req._draftMetadata })

  // REVISIT: should not be necessary
  r._ = Object.assign(r._, req._)
  r.run = req.run

  return service.tx(req).emit(r)
}

// REVISIT: draftActivate -> ACTIVATE

const { ODATA, COMMON } = require('../../../common/constants/annotation')
const _relevant = e => e[ODATA.DRAFT] || e[COMMON.DRAFT_NODE.PREP_ACTION]
module.exports = function () {
  let _handler
  for (const entity of Object.values(this.entities).filter(_relevant)) {
    _handler = _handler || onDraftActivateEvent(this)
    this.on('draftActivate', entity, _handler)
  }
}
