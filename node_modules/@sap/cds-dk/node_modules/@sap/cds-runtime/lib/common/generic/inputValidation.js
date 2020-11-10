const { checkInputConstraints, assertableInputConstraints } = require('../../cds-services/util/assert')
const getTemplate = require('../utils/getTemplate')

const _validateDataRec = (row, template, errors) => {
  for (const [templateName, templateValue] of template.elements) {
    const val = row[templateName]
    if (val === null || val === undefined) continue
    if (Array.isArray(val)) {
      for (const subVal of val) {
        _validateDataRec(subVal, templateValue, errors)
      }
      continue
    }
    if (!templateValue.isTemplate) {
      checkInputConstraints(template.target, templateName, val, errors)
      continue
    }
    _validateDataRec(val, templateValue, errors)
  }
}

const _beforeInputValidationDeep = (data, context, model, target) => {
  if (!Array.isArray(data)) {
    return _beforeInputValidationDeep([data], context, model, target)
  }
  const errors = []

  const template = getTemplate(model, target.name, {
    pick: assertableInputConstraints,
    ignore: el => el.type === 'cds.Association'
  })

  if (template.elements.size === 0) return

  for (const row of data) {
    _validateDataRec(row, template, errors)
  }

  if (errors.length !== 0) {
    for (const error of errors) {
      context.error(error)
    }
  }
}

/**
 * Generic handler for input validation
 * Checks if input constrains like @assert.range or @assert.format are provided and validates input values
 * @returns context.reject in case of incorrect values
 *
 * @alias module:handlers.beforeInputValidation
 */
const beforeInputValidation = ({ model } = {}) => context => {
  if (context.target) {
    return _beforeInputValidationDeep(context.data, context, model, context.target)
  }
}

/* istanbul ignore next */
module.exports = function () {
  const _handler = beforeInputValidation(this)
  _handler._initial = true

  // REVISIT: only when needed
  this.before(['CREATE', 'UPDATE'], '*', _handler)
}

module.exports.handler = beforeInputValidation
