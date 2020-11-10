const {
  hasDeepUpdate,
  createDeepUpdateCQNs,
  selectDeepUpdateData
} = require('../../common/utils/composition/compositionTree')
const { processNestedCQNs, timestampToISO } = require('./util')

const update = (executeUpdateCQN, executeSelectCQN) => (model, dbc, query, req) => {
  if (hasDeepUpdate(model && model.definitions, query)) {
    const wrapperFn = q => executeSelectCQN(model, dbc, q, req.user.id, req.user.locale, timestampToISO(req.timestamp))
    /* istanbul ignore next */
    return selectDeepUpdateData(model && model.definitions, query, wrapperFn).then(selectData => {
      return processNestedCQNs(
        createDeepUpdateCQNs(model && model.definitions, query, selectData),
        executeUpdateCQN,
        model,
        dbc,
        req.user.id,
        req.user.locale,
        timestampToISO(req.timestamp)
      )
    })
  }
  // REVISIT: don't invoke setters if not needed
  return executeUpdateCQN(model, dbc, query, req.user.id, req.user.locale, timestampToISO(req.timestamp))
}

module.exports = update
