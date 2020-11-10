// TODO: Which EDM Types are missing?
const notToBeConvertedForCompiler = new Set([
  'Edm.Boolean',
  'Edm.Int16',
  'Edm.Int32',
  'Edm.Int64',
  'Edm.Decimal',
  'Edm.Double'
])

const addLimit = (item, rows, offset) => {
  // ignore 0 offset -> truthy check
  if (rows != null || offset) {
    if (!item.limit) {
      item.limit = {}
    }
    if (rows != null) {
      item.limit.rows = { val: rows }
    }
    if (offset) {
      item.limit.offset = { val: offset }
    }
  }
}

const convertKeyPredicatesToStringExpr = keyPredicates => {
  if (keyPredicates.length) {
    return `[${keyPredicates
      .map(kp => {
        const keyName = kp.getEdmRef().getName()
        let keyValue = kp.getText().replace(/'/g, "''")

        if (
          !notToBeConvertedForCompiler.has(
            kp
              .getEdmRef()
              .getProperty()
              .getType()
              .toString()
          )
        ) {
          keyValue = `'${keyValue}'`
        }

        return `${keyName}=${keyValue}`
      })
      .join(' and ')}]`
  }

  return ''
}

const convertUrlPathToCqn = segments => {
  return segments
    .filter(
      segment =>
        segment.getKind() !== 'COUNT' && segment.getKind() !== 'PRIMITIVE.PROPERTY' && segment.getKind() !== 'VALUE'
    )
    .reduce((expr, segment, i) => {
      if (segment.getKind() === 'ENTITY' || segment.getKind() === 'ENTITY.COLLECTION') {
        const entity = segment
          .getEntitySet()
          .getEntityType()
          .getFullQualifiedName()
          .toString()
        const keys = convertKeyPredicatesToStringExpr(segment.getKeyPredicates())
        return `${entity}${keys}`
      }

      if (segment.getKind() === 'SINGLETON') {
        return segment
          .getSingleton()
          .getEntityType()
          .getFullQualifiedName()
          .toString()
      }

      const navigation = segment.getNavigationProperty().getName()
      const keys = convertKeyPredicatesToStringExpr(segment.getKeyPredicates())
      return `${expr}${i === 1 ? ':' : '.'}${navigation}${keys}`
    }, '')
}

module.exports = {
  addLimit,
  convertUrlPathToCqn
}
