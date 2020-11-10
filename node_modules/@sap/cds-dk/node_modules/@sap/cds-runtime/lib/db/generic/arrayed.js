const getEntityFromCQN = require('../utils/entityFromCqn')

const _toArray = (result, elements) => {
  for (const row of result) {
    for (const column in row) {
      if (elements[column] === undefined || row[column] === undefined) continue

      // .items marks arrayed element
      if (elements[column].items) {
        row[column] = JSON.parse(row[column])
      } else if (elements[column].is2many) {
        _toArray(row[column], elements[column]._target.elements)
      } else if (elements[column].is2one) {
        _toArray([row[column]], elements[column]._target.elements)
      } else if (elements[column].kind === 'type') {
        _toArray([row[column]], elements[column].elements)
      }
    }
  }
}

/**
 * Formats JSON Strings to arrayed data
 *
 * @param result - the result of the DB query
 * @param req - the context object
 * @returns {Promise}
 */
const transformToArrayed = (result, req) => {
  if (!Array.isArray(result)) {
    return transformToArrayed([result], req)
  }

  const { elements } = getEntityFromCQN(req)
  _toArray(result, elements)
}

module.exports = transformToArrayed
