const statements = require('../../../statements')
const { getFeatureNotSupportedError } = require('../../../util/errors')
const { convertUrlPathToCqn } = require('./utils')
const SUPPORTED_KINDS = ['NAVIGATION.TO.ONE', 'ENTITY']

/**
 * Transform odata DELETE request into a CQN object.
 *
 * @param context - Contains request information and utility methods like statements.
 * @param req - An odata request.
 * @throws Error - If invalid path segment provided
 * @private
 */
const deleteToCQN = (context, req) => {
  const segments = req.getUriInfo().getPathSegments()
  const segment = segments[segments.length - 1]

  if (SUPPORTED_KINDS.includes(segment.getKind())) {
    // REVISIT: Umbrella does not call our .DELETE
    return statements.DELETE.from(convertUrlPathToCqn(segments))
  } else if (segment.getKind() === 'PRIMITIVE.PROPERTY') {
    // REVISIT: Umbrella does not call our .UPDATE
    return statements.UPDATE(convertUrlPathToCqn(segments)).data({ [segment.getProperty().getName()]: null })
  } else {
    throw getFeatureNotSupportedError(`DELETE of kind "${segment.getKind()}"`)
  }
}

module.exports = deleteToCQN
