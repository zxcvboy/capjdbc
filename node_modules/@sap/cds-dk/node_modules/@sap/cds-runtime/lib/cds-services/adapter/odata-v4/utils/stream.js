const cds = global.cds || require('@sap/cds/lib')

const { adaptStreamCQN } = require('../../../services/utils/draftUtils')
const cqn2cqn4sql = require('../../../../common/utils/cqn2cqn4sql')
const isStreaming = segments => {
  const lastSegment = segments[segments.length - 1]
  return (
    segments.length > 1 &&
    lastSegment.getKind() === 'PRIMITIVE.PROPERTY' &&
    lastSegment
      .getProperty()
      .getType()
      .getName() === 'Stream'
  )
}

const _getType = async (property, req, changeset) => {
  // REVISIT DRAFT HANDLING: cqn2cqn4sql should not happen here, but adaptStreamCQN relies on exists clause
  const cqn = cqn2cqn4sql(cds.ql.SELECT.from(req.query.SELECT.from)).columns([property])

  adaptStreamCQN(cqn)

  // REVISIT: we shouldn't have to read stuff here anymore, or we should use own transaction
  const tx = cds.db.transaction(req)
  try {
    const res = await tx.run(cqn)
    return res.length !== 0 ? res[0][property] : undefined
  } catch (e) {
    // REVISIT: why ignore?
  } finally {
    !changeset && (await tx.commit())
  }
}

const getContentType = (segments, serviceName, definitions, req, changeset) => {
  if (!cds.db) return Promise.resolve()
  const propertyName = segments[segments.length - 1].getProperty().getName()
  let propertyType
  if (segments[segments.length - 2].getKind() === 'ENTITY') {
    const entityName = segments[segments.length - 2].getEntitySet().getName()
    const entityDefinition = definitions[`${serviceName}.${entityName}`]
    if (entityDefinition['@cds.persistence.skip'] === true) return Promise.resolve()
    propertyType = entityDefinition.elements[`${propertyName}`]['@Core.MediaType']
    if (typeof propertyType === 'object') {
      return _getType(Object.values(propertyType)[0], req, changeset)
    }
  }

  return Promise.resolve(propertyType)
}

module.exports = { isStreaming, getContentType }
