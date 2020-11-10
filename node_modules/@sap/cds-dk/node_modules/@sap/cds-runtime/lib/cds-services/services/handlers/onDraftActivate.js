const { setStatusCodeAndHeader, getEntityName, ensureNoDraftsSuffix } = require('../utils/draftUtils')
const { getKeyData } = require('../utils/draftWhereUtils')
const { getDeepSelect } = require('../utils/handlerUtils')
const { DRAFT_COLUMNS } = require('../utils/constants')

/*
 * read data as on db and return
 */
const _getResult = async context => {
  const defs = context._model.definitions
  const cqn = getDeepSelect(context, defs, true)
  return (await context.run(cqn))[0]
}

const _getKeysObj = context => {
  let keysObj = {}

  if (context.query.UPDATE) {
    keysObj = getKeyData(Object.keys(context.target.keys), context.query.UPDATE.where)
  }

  if (context.query.INSERT) {
    for (const key in context.query.INSERT.entries[0]) {
      if (Object.keys(context.target.keys).includes(key)) {
        keysObj[key] = context.query.INSERT.entries[0][key]
      }
    }
  }
  return keysObj
}

/*
 * do not copy to active entity:
 * - null values of defaulted properties
 * - @cds.on.insert/update (based on event)
 */
const _cleanupData = context => {
  if (!context.data) {
    return
  }

  const anno = context.event === 'CREATE' ? '@cds.on.insert' : '@cds.on.update'
  const props = Object.keys(context.target.elements).filter(
    k => !DRAFT_COLUMNS.includes(k) && (context.target.elements[k].default || context.target.elements[k][anno])
  )
  for (const p of props) {
    const data = Array.isArray(context.data) ? context.data : [context.data]
    for (const d of data) {
      if (context.target.elements[p][anno] || d[p] === null) {
        delete d[p]
      }
    }
  }
}

const _deepCleanupData = context => {
  // root
  _cleanupData(context)

  // items
  const comps = Object.keys(context.target.elements).filter(k => context.target.elements[k].type === 'cds.Composition')
  for (const c of comps) {
    if (!context.data[c]) {
      continue
    }
    const ctx = {
      event: context.event,
      data: context.data[c],
      target: context._model.definitions[context.target.elements[c].target]
    }
    ctx[Symbol.for('sap.cds.model')] = context[Symbol.for('sap.cds.model')]
    _deepCleanupData(ctx)
  }
}

/**
 * Generic Handler for ActivationAction requests.
 * In case of success it returns the prepared draft entry.
 *
 * @param context - operation object, that provides error, continuation and other functions as well as information
 * regarding the current operation.
 * @alias module:handlers.onDraftActivate
 */
const _handler = async (req, next) => {
  _deepCleanupData(req)

  await next() // > defer to normal CRUD handling

  setStatusCodeAndHeader(req._.odataRes, _getKeysObj(req), getEntityName(ensureNoDraftsSuffix(req.target.name)), true)

  return _getResult(req)
}

const { ODATA, COMMON } = require('../../../common/constants/annotation')
const _relevant = e => e[ODATA.DRAFT] || e[COMMON.DRAFT_NODE.PREP_ACTION]
module.exports = function () {
  for (const entity of Object.values(this.entities).filter(_relevant)) {
    this.on(['CREATE', 'UPDATE'], entity, _handler)
  }
}
module.exports._handler = _handler
