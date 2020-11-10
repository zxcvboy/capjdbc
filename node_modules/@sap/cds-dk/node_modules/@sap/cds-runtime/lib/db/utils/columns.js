const cds = global.cds || require('@sap/cds/lib')
const { isDraftEnabled } = require('../../common/utils/draft')

const DRAFT_COLUMNS = [
  'IsActiveEntity',
  'HasActiveEntity',
  'HasDraftEntity',
  'DraftAdministrativeData_DraftUUID',
  'SiblingEntity',
  'DraftAdministrativeData'
]

const _filterAssociationAndComposition = (entity, columnName) => {
  return entity.elements[columnName]
    ? entity.elements[columnName].is2one !== true && entity.elements[columnName].is2many !== true
    : true
}
const _filterDraft = (entity, columnName) => {
  return DRAFT_COLUMNS.includes(columnName) !== true && _filterAssociationAndComposition(entity, columnName)
}

const _mapNameToValue = (entity, array) => array.map(key => entity.elements[key] || { name: key })

const _resolveStructured = (columnName, subElements, flattenedElements = []) => {
  if (!subElements) {
    return
  }

  for (const structElement in subElements) {
    if (subElements[structElement].kind === 'type') {
      _resolveStructured(
        `${columnName}_${subElements[structElement].name}`,
        subElements[structElement].elements,
        flattenedElements
      )
      continue
    }
    flattenedElements.push(`${columnName}_${structElement}`)
  }

  return flattenedElements
}

/**
 * This method gets all columns for an entity.
 * It includes the generated foreign keys from managed associations, structured elements and complex and custom types.
 * As well, it provides the annotations starting with '@' for each column.
 *
 * @param entity - the csn entity
 * @returns {Array} - array of columns
 */
const getColumns = entity => {
  let columnNames = Object.keys(entity.elements)

  if (cds.env.odata_x4) {
    const toBeDeleted = []
    for (const column of columnNames) {
      const element = entity.elements[column]
      if (element && element.kind === 'type') {
        toBeDeleted.push(column)
        columnNames.push(..._resolveStructured(column, element.elements))
      }
    }

    columnNames = columnNames.filter(col => !toBeDeleted.includes(col))
  }

  if (isDraftEnabled(entity)) {
    return _mapNameToValue(entity, columnNames.filter(key => _filterDraft(entity, key)))
  }

  return _mapNameToValue(entity, columnNames.filter(key => _filterAssociationAndComposition(entity, key)))
}

module.exports = getColumns
