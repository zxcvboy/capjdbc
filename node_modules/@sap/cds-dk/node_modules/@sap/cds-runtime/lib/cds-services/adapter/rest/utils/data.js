const { getKeyValuePair } = require('./key-value-utils')

const _getKeyValues = (method, target, keys) => {
  if (method === 'CREATE' || (method === 'UPDATE' && !keys)) {
    return {}
  }

  return getKeyValuePair(target, keys)
}

// REVISIT: copied from BaseContext
const _fillKeyValues = (keyValues, data) => {
  for (const key of Object.keys(keyValues)) {
    data[key] = keyValues[key]
  }
}

const getData = ({ method, segments }, target, req) => {
  // TODO: what to do by reading collections
  const keyValues = _getKeyValues(method, target, segments[1])

  if (method === 'READ' || method === 'DELETE') {
    return keyValues
  }

  const data = req.body || {}
  const dataArray = Array.isArray(data) ? data : [data]

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    for (const data of dataArray) {
      _fillKeyValues(keyValues, data)
    }
  }

  return data
}

module.exports = {
  getData
}
