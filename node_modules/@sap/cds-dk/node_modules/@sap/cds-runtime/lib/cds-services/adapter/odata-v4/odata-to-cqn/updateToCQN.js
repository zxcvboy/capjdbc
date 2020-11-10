const statements = require('../../../statements')
const { getFeatureNotSupportedError } = require('../../../util/errors')
const { isStreaming } = require('../utils/stream')
const { convertUrlPathToCqn } = require('./utils')
const SUPPORTED_KINDS = ['NAVIGATION.TO.ONE', 'ENTITY', 'SINGLETON']
/**
 * Transform odata UPDATE request into a CQN object.
 *
 * @param context - Contains request information and utility methods like statements.
 * @param req - An odata request.
 * @throws Error - If invalid segment kind provided
 * @private
 */
const updateToCQN = (context, req) => {
  const segments = req.getUriInfo().getPathSegments()
  const segment = segments[segments.length - 1]
  const streaming = isStreaming(segments)

  if (SUPPORTED_KINDS.includes(segment.getKind()) || streaming) {
    // FIXME: need to support update on to-one association
    // REVISIT: Umbrella does not call our .UPDATE
    return statements.UPDATE(convertUrlPathToCqn(segments)).data(context.data)
  }

  throw getFeatureNotSupportedError(`UPDATE of kind "${segment.getKind()}"`)
}

module.exports = updateToCQN
