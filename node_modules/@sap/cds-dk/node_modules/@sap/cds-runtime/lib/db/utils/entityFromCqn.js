const { ensureNoDraftsSuffix } = require('../../common/utils/draft')

const _getEntityNameFromCQN = cqn => {
  while (cqn.SELECT) {
    cqn = cqn.SELECT.from
  }

  return _getEntityNameFromUnionCQN(cqn) || cqn.ref[0]
}

const _getEntityNameFromUnionCQN = cqn => {
  // TODO cleanup
  // REVISIT infer should do this for req.target
  if (cqn.SET) {
    return cqn.SET.args
      .map(arg => {
        return _getEntityNameFromCQN(arg)
      })
      .filter(name => {
        return name !== 'DRAFT.DraftAdministrativeData'
      })[0]
  }
  if (cqn.join) {
    return cqn.args
      .map(arg => {
        return _getEntityNameFromCQN(arg)
      })
      .filter(name => {
        return !name.endsWith('_drafts')
      })[0]
  }
}

const getEntityFromCQN = req => {
  return req.target._unresolved
    ? req._model.definitions[ensureNoDraftsSuffix(_getEntityNameFromCQN(req.query))]
    : req.target
}

module.exports = getEntityFromCQN
