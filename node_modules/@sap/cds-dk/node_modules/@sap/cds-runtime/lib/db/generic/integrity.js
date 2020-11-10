const { checkNotNull } = require('../../cds-services/services/utils/handlerUtils')

const cds = global.cds || require('@sap/cds/lib')

/*
 * before delete
 */
const _isPrimitiveKey = e => !e.is2one && !e.is2many

async function beforeDelete (req) {
  // REVISIT: temp private for AFC
  if (cds.env.runtime && cds.env.runtime.skipIntegrity) {
    return
  }

  if (!this.model || typeof req.query === 'string' || !req.target || req.target._unresolved) {
    return
  }

  if (Object.keys(req.data).length > 0) {
    // via protocol adapter with key predicates
    return
  }

  const target = this.model.definitions[req.target.name]
  if (!target) {
    return
  }

  // REVISIT: only if target is parent
  const keys = Object.keys(target.keys).filter(k => _isPrimitiveKey(target.elements[k]))
  let select = cds.ql.SELECT(keys).from(req.query.DELETE.from)
  if (req.query.DELETE.where) {
    select = select.where(req.query.DELETE.where)
  }

  req._beforeDeleteData = await this._read(this.model, this.dbc, select, req.context || req)
}

beforeDelete._initial = true

/*
 * not null
 */
function notNull (req) {
  // REVISIT: find better solution to exclude drafts
  // REVISIT: consider also INSERT with rows and values
  // REVISIT: consider moving imported checkNotNull to another (common or db) package
  if (
    req.query.INSERT &&
    !req.query.INSERT.into.endsWith('_drafts') &&
    req.query.INSERT.into !== 'DRAFT_DraftAdministrativeData' &&
    !Array.isArray(req.data) &&
    typeof req.data === 'object'
  ) {
    checkNotNull(req)
  }
}

notNull._initial = true

/*
 * perform check
 */
const { checkIntegrityUtil } = require('../../cds-services/services/utils/handlerUtils')
const RELEVANT_EVENTS = ['CREATE', 'UPDATE', 'DELETE']

const _performCheck = async (req, cur, csn, run) => {
  const prev = (cur.errors && cur.errors.length) || 0

  await checkIntegrityUtil(cur, csn, run)

  // only additional errors
  if (cur.errors && cur.errors.length > prev) {
    req.errors = req.errors ? [...req.errors, ...cur.errors] : cur.errors
  }
}

async function performCheck (req) {
  // REVISIT: temp private for AFC
  if (cds.env.runtime && cds.env.runtime.skipIntegrity) {
    return
  }

  const root = req.context || req

  const srv = this._is_tx ? Object.getPrototypeOf(this) : this
  const reqs = root._children ? root._children.get(srv) || [] : [root]
  for (const r of reqs) {
    if (RELEVANT_EVENTS.includes(r.event)) {
      await _performCheck(req, r, this.model, query => this._read(this.model, this.dbc, query, root))
    }
  }
}

performCheck._initial = true

module.exports = {
  beforeDelete,
  notNull,
  performCheck
}
