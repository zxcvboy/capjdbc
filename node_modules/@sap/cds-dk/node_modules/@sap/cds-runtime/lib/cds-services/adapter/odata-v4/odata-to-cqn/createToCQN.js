const statements = require('../../../statements')
const { getFeatureNotSupportedError } = require('../../../util/errors')
const { convertUrlPathToCqn } = require('./utils')
/**
 * Transform odata CREATE request into a CQN object.
 *
 * @param context - Contains request information and utility methods like statements.
 * @param req - An odata request.
 * @throw Error - if invalid segments are provided in request
 * @private
 */
const createToCQN = (context, req) => {
  const segments = req.getUriInfo().getPathSegments()
  const segment = segments[segments.length - 1]

  if (segment.getKind() === 'ENTITY.COLLECTION') {
    // REVISIT: Umbrella does not call our .INSERT
    return statements.INSERT.into(context.target).rows(context.data)
  }

  if (segment.getKind() === 'NAVIGATION.TO.MANY') {
    // REVISIT: Umbrella does not call our .INSERT
    return statements.INSERT.into(convertUrlPathToCqn(segments)).rows(context.data)
  }

  throw getFeatureNotSupportedError(`INSERT of kind "${segment.getKind()}"`)
}

module.exports = createToCQN
