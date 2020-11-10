const convertDateTimeElements = (entry, { name, type, _target }) => {
  if (!(entry[name] === undefined || entry[name] === null)) {
    if (type === 'cds.DateTime' || type === 'cds.Timestamp') {
      entry[name] = new Date(entry[name]).toISOString()
      if (type === 'cds.DateTime') {
        entry[name] = `${entry[name].slice(0, 19)}Z`
      }
    }

    if (type === 'cds.Composition') {
      convert({ target: _target, data: entry[name] })
    }
  }
}

/**
 * This method finds and converts the cds.DateTime and cds.Timestamp types to UTC.
 * HANA stores date time values without timezone
 * @param req - cds.Request
 * @returns {undefined}
 */
const convert = req => {
  if (typeof req.query === 'string' || !req.target || req.target._unresolved) return
  const data = Array.isArray(req.data) ? req.data : [req.data]

  // check all entries
  for (const entry of data) {
    for (const column of Object.keys(entry)) {
      // skip unknown columns
      if (!req.target.elements[column]) continue

      convertDateTimeElements(entry, req.target.elements[column])
    }
  }
}

convert._initial = true

module.exports = convert
