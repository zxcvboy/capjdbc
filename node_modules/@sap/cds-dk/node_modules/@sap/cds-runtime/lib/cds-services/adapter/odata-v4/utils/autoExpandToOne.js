const addAssociationToRow = (row, foreignKey, assocName) => {
  // foreign key null or undefined, set assoc to null
  if (row[foreignKey] === null || row[foreignKey] === undefined) {
    row[assocName] = null
    delete row[foreignKey]
    return
  }

  const keyOfAssociatedEntity = foreignKey.replace(`${assocName}_`, '')
  if (!row[assocName]) {
    row[assocName] = {}
  }

  if (row[assocName][keyOfAssociatedEntity] === undefined) {
    row[assocName][keyOfAssociatedEntity] = row[foreignKey]
  }

  delete row[foreignKey]
}

const isAssocOrComp = e => e.is2one || e.is2many

const autoExpandToOneAssociations = (entity, result) => {
  if (result === null) {
    return
  }

  if (!Array.isArray(result)) {
    return autoExpandToOneAssociations(entity, [result])
  }
  for (const row of result) {
    for (const e of Object.keys(row)) {
      if (typeof row !== 'object') return
      if (entity.elements[e]['@odata.foreignKey4']) {
        addAssociationToRow(row, e, entity.elements[e]['@odata.foreignKey4'])
      }

      // assoc or comp is not null, autoExpand as well
      if (isAssocOrComp(entity.elements[e]) && row[e] !== null) {
        autoExpandToOneAssociations(entity.elements[e]._target, row[e])
      }
    }
  }
}

module.exports = autoExpandToOneAssociations
