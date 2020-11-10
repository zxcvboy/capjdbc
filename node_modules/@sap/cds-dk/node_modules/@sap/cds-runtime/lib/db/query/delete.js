const { processNestedCQNs, timestampToISO } = require('./util')
const { hasCompositionDelete, createCascadeDeleteCQNs } = require('../../common/utils/composition/compositionTree')

const deleteFn = executeDeleteCQN => (model, dbc, query, req) => {
  if (hasCompositionDelete(model && model.definitions, query)) {
    return processNestedCQNs(
      createCascadeDeleteCQNs(model && model.definitions, query),
      executeDeleteCQN,
      model,
      dbc,
      req.user.id,
      req.user.locale,
      timestampToISO(req.timestamp)
    )
  }

  return executeDeleteCQN(model, dbc, query, req.user.id, req.user.locale, timestampToISO(req.timestamp))
}

module.exports = deleteFn
