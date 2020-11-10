const cds = global.cds || require('@sap/cds/lib')

const MODEL = Symbol.for('sap.cds.model')

const restToCqn = require('./rest-to-cqn')
const { getData } = require('./utils/data')
const { getEvent } = require('./utils/event')
const proxifyContext = require('./utils/proxify-context')
const { flattenDeepToOneAssociations } = require('../../services/utils/handlerUtils')
const negotiateLocale = require('../utils/locale')

function _isCustomOperation (element) {
  return element.kind === 'action' || element.kind === 'function'
}

/*
 * Class representing a REST request.
 * @extends Request
 *
 * @param {String} parsedUrl - The parsed url of the incoming request
 * @param {Object} service - The underlying CAP service
 * @param {Object} req - express' req
 * @param {Object} res - express' res
 */
class RestRequest extends cds.Request {
  constructor (parsedUrl, service, req, res) { // NOSONAR
    const _ = { req, res }

    /*
     * event
     */
    const event = getEvent(parsedUrl, service)

    /*
     * target
     */
    let target
    // TODO: replace with generic solution, target is either the first segment (no associations) or undefined for custom operations
    if (!_isCustomOperation(parsedUrl.segments[0])) {
      target = parsedUrl.segments[0]
    }

    /*
     * data
     */
    let data
    if (_isCustomOperation(parsedUrl.segments[parsedUrl.segments.length - 1])) {
      // data = parsedUrl.params || _validatedBodyValues(req.body, parsedUrl, this) || {}
      data = parsedUrl.params || req.body || {}
    } else {
      data = getData(parsedUrl, target, req)
    }

    /*
     * user
     */
    const user = _.req.user || new cds.User()

    /*
     * super
     */
    super({ event, target, data, user, method: req.method, params: req.params, _, _model: service.model })

    // REVISIT: overwrite user.locale getter in order to consider locale via query options, etc.
    Object.defineProperty(user, 'locale', {
      get () {
        return this._locale || (this._locale = negotiateLocale(_, service.options && service.options.defaultLocale))
      },
      configurable: true
    })

    // REVISIT: validate associations for deep insert
    flattenDeepToOneAssociations(this, this.model)

    /*
     * query
     */
    Object.defineProperty(this, 'query', {
      configurable: true,
      get: function () {
        const query = restToCqn(service, proxifyContext(this), parsedUrl)
        Object.defineProperty(this, 'query', { value: query, writable: true })
        return query
      },
      set: /* istanbul ignore next */ function (value) {
        Object.defineProperty(this, 'query', { value: value, writable: true })
      }
    })

    /*
     * req.run
     */
    Object.defineProperty(this, 'run', {
      configurable: true,
      get: () => (...args) => cds.tx(this).run(...args)
    })

    // REVISIT: streamline ref to model
    this[MODEL] = service.model

    // REVISIT: context.statements to be removed (cf. https://github.wdf.sap.corp/cap/matters/issues/837)
    this.statements = cds.ql

    if (this._.req.performanceMeasurement) {
      this.performanceMeasurement = this._.req.performanceMeasurement
    }
    if (this._.req.dynatrace) {
      this.dynatrace = this._.req.dynatrace
    }
  }
}

module.exports = RestRequest
