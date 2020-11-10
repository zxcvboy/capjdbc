const { hasDeepInsert, createDeepInsertCQNs } = require('../../common/utils/composition/compositionTree')
const { processNestedCQNs, timestampToISO } = require('./util')


const insert = executeInsertCQN => (model, dbc, query, req) => {
  if (hasDeepInsert(model && model.definitions, query)) {
    return processNestedCQNs(
      [createDeepInsertCQNs(model && model.definitions, query)],
      executeInsertCQN,
      model,
      dbc,
      req.user.id,
      req.user.locale,
      timestampToISO(req.timestamp)
    )
  }

  return executeInsertCQN(model, dbc, query, req.user.id, req.user.locale, timestampToISO(req.timestamp))
}

module.exports = insert
