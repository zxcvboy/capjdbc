const { processDeep } = require('../../util/dataProcessUtils')

const _isReadOnlyFieldControl = element => {
  return (
    (element['@Common.FieldControl'] && element['@Common.FieldControl']['#'] === 'ReadOnly') ||
    element['@Common.FieldControl.ReadOnly'] ||
    element['@FieldControl.ReadOnly'] ||
    element['@readonly']
  )
}

const _isImmutableReadOnly = (element, event) => {
  return event === 'UPDATE' && element['@Core.Immutable']
}

const _isComputedReadOnly = element => {
  return element['@Core.Computed']
}

const _isOnUpdateOrInsert = element => {
  return element['@cds.on.update'] || element['@cds.on.insert']
}

const _isReadOnlyField = (element, event) => {
  return (
    element &&
    (_isReadOnlyFieldControl(element) ||
      _isComputedReadOnly(element) ||
      _isImmutableReadOnly(element, event) ||
      _isOnUpdateOrInsert(element) ||
      element['virtual'])
  )
}

const removeReadOnlyColumns = (entity, data, event) => {
  if (!Array.isArray(data)) {
    return removeReadOnlyColumns(entity, [data], event)
  }

  for (const subData of data) {
    for (const columnName in subData) {
      // keys are intentionally added to data by the framework to build queries later on. Must not be removed
      if (
        subData[columnName] !== undefined &&
        _isReadOnlyField(entity.elements[columnName], event) &&
        !entity.elements[columnName].key
      ) {
        delete subData[columnName]
      }
    }
  }
}

const filterReadOnly = context => {
  processDeep(
    (data, entity) => {
      removeReadOnlyColumns(entity, data, context.event)
    },
    context.data,
    context.target,
    false,
    true
  )
}

/**
 * Generic handler for removing read only values, deals with computed, immutable, readonly, virtual
 *
 * @alias module:handlers.beforeFilterReadOnlyFields
 */
const _handler = context => {
  filterReadOnly(context)

  // REVISIT: Workaround for rest adapter not having ref on context.data
  if (context.query.UPDATE && context.data !== context.query.UPDATE.data) {
    filterReadOnly({ data: context.query.UPDATE.data, target: context.target, event: context.event })
  } else if (context.query.INSERT && context.query.INSERT.entries && context.data !== context.query.INSERT.entries[0]) {
    filterReadOnly({ data: context.query.INSERT.entries[0], target: context.target, event: context.event })
  }
}

module.exports = function () {
  _handler._initial = true
  // REVISIT: only register if needed
  // for (const k in this.entities) {
  //   if (NEEDED?) {
  //     this.on(['CREATE', 'UPDATE'], this.entities[k], _handler)
  //   }
  // }
  this.before(['CREATE', 'UPDATE', 'NEW', 'PATCH'], '*', _handler)
}
