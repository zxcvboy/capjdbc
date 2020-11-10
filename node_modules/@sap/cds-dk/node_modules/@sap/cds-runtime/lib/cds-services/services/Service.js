const cds = global.cds || require('@sap/cds/lib')

const { ensureDraftsSuffix } = require('./utils/draftUtils')

// Service utils
const auditLogger = require('../util/auditlog')
const { selectDeepUpdateData } = require('./utils/compositionTree')
const logger = require('./utils/logger')
const compareJson = require('./utils/compareJson')
const { DRAFT_COLUMNS } = require('./utils/constants')

/**
 * Generic Service Event Handler.
 */
class ApplicationService extends cds.Service {
  constructor (name, csn, options) {
    // REVISIT: do we still need that -> likely due to legacy test?
    // If not we should remove this legacy constructor
    if (typeof name === 'object') [name, csn, options] = [csn.service, name, csn]
    const o = { kind: options.use, ...options, service: name }
    super(name, csn, o)
  }

  set model (csn) {
    const m = csn && 'definitions' in csn ? cds.linked(cds.compile.for.odata(csn)) : csn
    const db = cds.db || cds.requires.db
    if (db && db.kind === 'sqlite') cds.alpha_localized(m) // REVISIT: should move to ApplicationService?
    super.model = m
  }

  init () {
    // service api, e.g. srv.cancelOrder(...args)
    require('../../common/generic/api').call(this)

    // prepend => LIFO
    return new Promise(async (resolve, reject) => {
      try {
        /*
         * _initial
         */
        await this.prepend(require('../../common/generic/temporal'))
        await this.prepend(require('../../common/generic/inputValidation'))
        await this.prepend(require('../../common/generic/keys'))
        await this.prepend(require('./handlers/beforeFilterReadOnlyFields'))
        await this.prepend(require('../../common/generic/etag'))
        await this.prepend(require('../../common/generic/auth'))
        // draft
        await this.prepend(require('./handlers/beforeCreateDraft'))
        await this.prepend(require('./handlers/beforeUpdateDraft'))
        await this.prepend(require('./handlers/beforeDeleteOrCancelDraft'))
        /*
         * before
         */
        // none
        /*
         * on
         */
        // non-draft crud
        await this.prepend(require('../../common/generic/crud'))
        // draft crud
        await this.prepend(require('./handlers/onCreateDraft')) // > NEW
        await this.prepend(require('./handlers/onDraftActivate')) // > CREATE, 'UPDATE'
        await this.prepend(require('./handlers/onReadDraft')) // > READ
        await this.prepend(require('./handlers/onReadOverDraft')) // > READ non-draft via navigation
        await this.prepend(require('./handlers/onPatchDraft')) // > PATCH
        await this.prepend(require('./handlers/onDeleteDraft')) // > DELETE
        // draft actions
        await this.prepend(require('./handlers/onDraftPrepare')) // > draftPrepare (-> should be PREPARE)
        await this.prepend(require('./handlers/onDraftEdit')) // > EDIT
        await this.prepend(require('./handlers/onCancelDraft')) // > CANCEL
        await this.prepend(require('./handlers/onDraftActivateEvent')) // > draftActivate (-> should be ACTIVATE)
        /*
         * after
         */
        // none

        resolve(this)
      } catch (e) {
        reject(e)
      }
    })
  }

  /**
   * Require logger on first usage.
   * Could be provided via options.
   *
   * @returns {Object}
   */
  get logger () {
    const log = logger(this.options)
    Object.defineProperty(this, 'logger', { value: log })
    return log
  }

  /**
   * Require @sap/audit-logging on first usage.
   * @returns {Object}
   * @private
   */
  get _auditLogger () {
    const audit = auditLogger(this.options.auditlog, this.logger)
    Object.defineProperty(this, '_auditLogger', { value: audit })
    return audit
  }

  /**
   * @deprecated since version 1.11.0 - use Service.prepend instead
   */
  with (serviceImpl) {
    return this.prepend(serviceImpl)
  }

  /**
   * Registers custom handlers.
   * @param {string|object|function} serviceImpl - init function to register custom handlers.
   */
  impl (serviceImpl) {
    if (typeof serviceImpl === 'string') {
      serviceImpl = require(serviceImpl)
    }

    return this.prepend(serviceImpl)
  }

  _createSelectColumnsForDelete (entity) {
    const columns = []
    for (const element of Object.values(entity.elements)) {
      if (element.type === 'cds.Composition') {
        if (element._target['@cds.persistence.skip'] === true) continue
        columns.push({
          ref: [element.name],
          expand: this._createSelectColumnsForDelete(element._target)
        })
      } else if (element.type !== 'cds.Association' && !DRAFT_COLUMNS.includes(element.name)) {
        columns.push({ ref: [element.name] })
      }
    }

    return columns
  }

  _createWhereCondition (entity, data) {
    // FIXME: need to support update on to-one association
    return Object.keys(entity.keys).reduce((prev, curr) => {
      if (!DRAFT_COLUMNS.includes(curr)) {
        prev[curr] = data[curr]
      }

      return prev
    }, {})
  }

  _diffDelete (context) {
    return context
      .run(
        context.statements.SELECT.from(context.target)
          .columns(this._createSelectColumnsForDelete(context.target))
          .where(this._createWhereCondition(context.target, context.data))
      )
      .then(dbState => {
        return compareJson(undefined, dbState, context.target)
      })
  }

  async _diffUpdate (context, providedData) {
    if (context.run) {
      try {
        await this._addPartialPersistentState(context)
      } catch (e) {}
    }
    const combinedData =
      providedData || Object.assign({}, context.query.UPDATE.data || {}, context.query.UPDATE.with || {})
    return compareJson(combinedData, context._.partialPersistentState, context.target)
  }

  async _diffPatch (context, providedData) {
    if (context.run) {
      // SELECT because req.query in custom handler does not have access to _drafts
      context._.partialPersistentState = await context.run(
        context.statements.SELECT.from(ensureDraftsSuffix(context.target.name))
          .where(this._createWhereCondition(context.target, context.data))
          .limit(1)
      )

      return compareJson(providedData || context.data, context._.partialPersistentState, context.target)
    }
  }

  _diffCreate (context, providedData) {
    return compareJson(providedData || context.data, undefined, context.target)
  }

  async _calculateDiff (context, providedData) {
    if (context.event === 'CREATE') {
      return this._diffCreate(context, providedData)
    }

    if (context.target['@cds.persistence.skip'] === true) {
      return
    }

    if (context.event === 'DELETE') {
      return this._diffDelete(context)
    }

    if (context.event === 'UPDATE') {
      return this._diffUpdate(context, providedData)
    }

    if (context.event === 'PATCH') {
      return this._diffPatch(context, providedData)
    }
  }

  async _addPartialPersistentState (context) {
    const deepUpdateData = await selectDeepUpdateData(this.model.definitions, context.query, context.run, context, true)
    context._.partialPersistentState = deepUpdateData
  }
}

module.exports = ApplicationService
