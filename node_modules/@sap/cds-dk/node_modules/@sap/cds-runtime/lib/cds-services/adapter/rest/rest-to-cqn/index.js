const cds = global.cds || require('@sap/cds/lib')

const statements = require('../../../statements')
const { LIMIT } = require('../../../services/utils/constants')
const MAX = (cds.env.query && cds.env.query.limit && cds.env.query.limit.max) || LIMIT.PAGE.MAX

const getColumns = require('../../../services/utils/columns')
const { DATA_TYPES_NOT_TO_BE_CONVERTED_BY_COMPILER } = require('../../../services/utils/constants')

const _convertKeyForCompiler = (keyValue, type) => {
  if (!DATA_TYPES_NOT_TO_BE_CONVERTED_BY_COMPILER.has(type)) {
    return `'${keyValue}'`
  }

  return keyValue
}

const _createCqlString = (target, key, keyValue) => {
  let keyString = ''
  if (keyValue !== undefined) {
    keyString = `[${key}=${_convertKeyForCompiler(keyValue, target.keys[key].type)}]`
  }

  return `${target.name}${keyString}`
}

const _cqnForCustomOperations = ({ statements: { SELECT }, target }, { customOperation, segments }) => {
  // if custom operation is unbound, query is undefined
  if (customOperation.startsWith('bound')) {
    const key = Object.keys(target.keys)[0]
    return SELECT.from(_createCqlString(target, key, segments[1]))
  }
}

const _createToCQN = (context, parsedUrl) => {
  if (!parsedUrl.customOperation) {
    // REVISIT: Umbrella does not call our .INSERT
    return statements.INSERT.into(context.target).entries(context.data)
  }

  return _cqnForCustomOperations(context, parsedUrl)
}

const _getPaging = ({ query: { $top, $skip } }) => {
  return [Number($top) || MAX, Number($skip) || 0]
}

const _readToCQN = (service, context, parsedUrl) => {
  if (!parsedUrl.customOperation) {
    const key = Object.keys(context.target.keys)[0]
    const cqn = context.statements.SELECT.from(
      _createCqlString(context.target, key, parsedUrl.segments[1]),
      getColumns(context.target, true, true)
    )

    if (parsedUrl.isCollection) {
      cqn.limit(..._getPaging(context._.req))

      // no query option for ordering supported yet
      if (parsedUrl.segments[0]['@cds.default.order']) {
        for (const defaultOrder of parsedUrl.segments[0]['@cds.default.order']) {
          cqn.orderBy(defaultOrder.by['='], defaultOrder.desc ? 'desc' : 'asc')
        }
      }
    }

    return cqn
  }

  return _cqnForCustomOperations(context, parsedUrl)
}

const _updateToCQN = (context, parsedUrl) => {
  const key = Object.keys(context.target.keys)[0]

  if (Array.isArray(context.data)) {
    return context.data.map(data => {
      // REVISIT: Umbrella does not call our .UPDATE
      return statements.UPDATE(_createCqlString(context.target, key, data[key])).data(data)
    })
  }

  // REVISIT: Umbrella does not call our .UPDATE
  return statements.UPDATE(_createCqlString(context.target, key, parsedUrl.segments[1])).data(context.data)
}

/**
 * @param {Object} service
 * @param {Object} context
 * @param {Object} parsedUrl
 * @returns {Object}
 */
module.exports = (service, context, parsedUrl) => {
  // TODO: replace with generic solution
  switch (parsedUrl.method) {
    case 'CREATE':
      return _createToCQN(context, parsedUrl)
    case 'READ':
      return _readToCQN(service, context, parsedUrl)
    case 'UPDATE':
      return _updateToCQN(context, parsedUrl)
    case 'DELETE':
      // REVISIT: Umbrella does not call our .DELETE
      return statements.DELETE.from(
        _createCqlString(context.target, Object.keys(context.target.keys)[0], parsedUrl.segments[1])
      )
    default:
      return {}
  }
}
