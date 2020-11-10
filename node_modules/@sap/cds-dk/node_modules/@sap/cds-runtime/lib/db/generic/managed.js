// draft columns have default values, must be ignored on activate
const DRAFT_COLUMNS = ['IsActiveEntity', 'HasDraftEntity', 'HasActiveEntity']

const _isDefined = e => e !== undefined && e !== null
const _normalizeToArray = element => (Array.isArray(element) ? element : [element])
const _annotatedValueFor = (annotation, user, timestamp) => {
  return annotation === '$user' ? user.id : new Date(timestamp).toISOString()
}
const _filterDefaultAndManaged = (event, target, user, timestamp) => {
  const elements = Object.values(target.elements)
  if (event === 'CREATE') {
    return elements
      .filter(e => !DRAFT_COLUMNS.includes(e.name) && (e.default || e['@cds.on.insert']))
      .map(e => {
        if (e.default) return { name: e.name, value: e.default.val, nullable: !e.notNull }
        return { name: e.name, value: _annotatedValueFor(e['@cds.on.insert']['='], user, timestamp) }
      })
  }
  return elements
    .filter(e => !DRAFT_COLUMNS.includes(e.name) && e['@cds.on.update'])
    .map(e => ({ name: e.name, value: _annotatedValueFor(e['@cds.on.update']['='], user, timestamp) }))
}

const _setManagedValues = (defaultColumns, entry) => {
  for (const column of defaultColumns) {
    // if undefined and nullable, default value is set
    // if null and nullable, no default is set
    if (entry[column.name] === undefined || (entry[column.name] === null && !column.nullable)) {
      entry[column.name] = column.value
    }
  }
}

const _forCreate = (req, target) => {
  const defaultColumns = _filterDefaultAndManaged('CREATE', target, req.user, req.timestamp)
  const compositions = Object.values(target.elements).filter(e => e.type === 'cds.Composition')

  const data = _normalizeToArray(req.data)

  // check all entries
  for (const entry of data) {
    // TODO: rows/values
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }

    _setManagedValues(defaultColumns, entry)

    for (const comp of compositions) {
      if (_isDefined(entry[comp.name])) {
        _forCreate(
          {
            data: entry[comp.name],
            user: req.user,
            timestamp: req.timestamp
          },
          comp._target
        )
      }
    }
  }
}

const _addDefaultManagedValuesToData = (defaultColumns, diffEntry, entry) => {
  if (diffEntry._op === 'create') {
    defaultColumns.forEach(column => {
      // if undefined and nullable, default value is set
      // if null and nullable, no default is set
      if (entry[column.name] === undefined || (entry[column.name] === null && !column.nullable)) {
        entry[column.name] = column.value
      }
    })
  } else if (diffEntry._op === 'update') {
    defaultColumns.forEach(column => {
      if (entry[column.name] === undefined) {
        entry[column.name] = column.value
      }
    })
  }
}

const _forUpdate = async (req, target) => {
  const defaultColumns = _filterDefaultAndManaged(req.event, target, req.user, req.timestamp)
  const compositions = Object.values(target.elements).filter(e => e.type === 'cds.Composition')

  const data = _normalizeToArray(req.data)
  const diff = await req.diff()

  const diffArray = _normalizeToArray(diff)

  // check all entries TODO rows/values
  for (let i = 0; i < diffArray.length; i++) {
    const entry = data[i]
    const diffEntry = diffArray[i]
    _addDefaultManagedValuesToData(defaultColumns, diffEntry, entry)

    if (diffEntry._op !== 'delete') {
      for (const comp of compositions) {
        if (_isDefined(entry[comp.name]) && diffEntry[comp.name]) {
          handler({
            target: comp._target,
            data: entry[comp.name],
            user: req.user,
            timestamp: req.timestamp,
            _model: req._model,
            event: req.event,
            diff: () => diffEntry[comp.name]
          })
        }
      }
    }
  }
}
/**
 * This method adds default and managed values to insert and update queries.
 * Supports also deep insert and deep update.
 * Manipulates req.data
 * @param req - cds.Request
 * @returns {undefined}
 */
async function handler (req) {
  if (!this.model || typeof req.query === 'string' || !req.target) return

  // support for draft patches and new drafts
  let target = req.target
  if (req.target._unresolved) {
    if (this.model.definitions[req.target.name.replace('_drafts', '')]) {
      target = this.model.definitions[req.target.name.replace('_drafts', '')]
    } else {
      return
    }
  }

  if (req.event === 'CREATE') {
    _forCreate(req, target)
  } else {
    await _forUpdate(req, target)
  }
}

handler._initial = true

module.exports = handler
