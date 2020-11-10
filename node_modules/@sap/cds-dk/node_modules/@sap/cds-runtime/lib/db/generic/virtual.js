const { processDeep } = require('../../cds-services/util/dataProcessUtils')

const isVirtual = e => e && e.vrtual

const filterVirtual = req => {
  if (typeof req.query === 'string' || !req.target || req.target._unresolved) {
    return
  }

  // REVISIT: probably need to filter for .columns/.rows combination as well
  if (req.query.INSERT && !req.query.INSERT.entries) {
    return
  }

  processDeep(
    (data, entity) => {
      const d = Array.isArray(data) ? data : [data]

      for (const obj of d) {
        for (const property in obj) {
          if (isVirtual(entity.elements[property])) {
            delete obj[property]
          }
        }
      }
    },
    req.data,
    req.target,
    false,
    true
  )
}

filterVirtual._initial = true

module.exports = filterVirtual
