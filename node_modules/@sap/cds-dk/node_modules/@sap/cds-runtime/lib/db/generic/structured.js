const getEntityFromCQN = require('../utils/entityFromCqn')

const _getStructuredTypes = entity => {
  return Object.values(entity.elements || {}).filter(
    e => e.kind === 'type' || e.type === 'cds.Composition' || e.type === 'cds.Association'
  )
}

const _handleNavigation = (structuredType, data, prefixes) => {
  const nestedStructuredTypes = _getStructuredTypes(structuredType._target)

  for (const nestedStructuredType of nestedStructuredTypes) {
    if (!data[structuredType.name]) {
      continue
    }
    if (structuredType.is2many) {
      for (const entry of data[structuredType.name]) {
        _flatToStructured(nestedStructuredType, entry, [...prefixes])
      }
    } else {
      _flatToStructured(nestedStructuredType, data[structuredType.name], [...prefixes])
    }
  }
}

const _flatToStructured = (structuredType, data, prefixes = [], structuredData = {}) => {
  if (structuredType.kind === 'type') {
    structuredData[structuredType.name] = {}
    prefixes.push(structuredType.name)
  }

  if (structuredType.type === 'cds.Association' || structuredType.type === 'cds.Composition') {
    _handleNavigation(structuredType, data, prefixes)
  }

  for (const element in structuredType.elements) {
    if (structuredType.elements[element].kind === 'type') {
      _flatToStructured(structuredType.elements[element], data, [...prefixes], structuredData[structuredType.name])
      continue
    }

    structuredData[structuredType.name][element] = data[`${prefixes.join('_')}_${element}`] // data[property]
    delete data[`${prefixes.join('_')}_${element}`]
  }

  if (prefixes.length === 1) {
    data[structuredType.name] = structuredData[structuredType.name]
  }
}

/**
 * Formats flat data to structured data
 *
 * @param result - the result of the event
 * @param req - the context object
 * @returns {Promise}
 */
const transformToStructured = (result, req) => {
  if (!Array.isArray(result)) {
    return transformToStructured([result], req)
  }

  for (let i = 0; i < result.length; i++) {
    const d = result[i]
    // REVISIT draft union
    const structuredTypes = _getStructuredTypes(getEntityFromCQN(req))

    for (const structuredType of structuredTypes) {
      _flatToStructured(structuredType, d)
    }
  }
}

module.exports = transformToStructured
