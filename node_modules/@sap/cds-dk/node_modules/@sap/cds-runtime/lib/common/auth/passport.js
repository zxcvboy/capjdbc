const cds = global.cds || require('@sap/cds/lib')

// REVISIT: use cds.User once ready
const User = require('./User')

let passport

const { getIpFromRequest, getUserFromRequest } = require('../../cds-services/services/utils/clientFromRequest')

/*
 * map for initialized authenticators
 */
const authenticators = {}

const _require = require('../utils/require')

const initializers = {
  // REVISIT: support basic authentication?
  basic: ({ credentials }) => {
    const { BasicStrategy } = _require('passport-http')
    passport.use(
      new BasicStrategy(function (user, password, done) {
        credentials[user] === password ? done(null, { id: user }) : this.fail()
      })
    )
  },
  JWT: ({ uaa }) => {
    uaa = uaa || cds.env.requires.uaa || {}
    if (!uaa.credentials) {
      try {
        const vcap = cds.env.requires.uaa && cds.env.requires.uaa.vcap
        uaa.credentials = _require('@sap/xsenv').serviceCredentials(vcap || { label: 'xsuaa' })
      } catch (e) {
        const msg =
          'Unable to get xsuaa credentials. Please make sure your app is bound to a single xsuaa service instance or that you provide vcap information in the requires.uaa section.'
        throw Object.assign(new Error(msg), { original: e })
      }
    }
    const JWTStrategy = _require('@sap/xssec').JWTStrategy
    passport.use(new JWTStrategy(uaa.credentials))
  },
  mock: ({ users }, srvName) => {
    const MockStrategy = require('./MockStrategy')
    passport.use(new MockStrategy(users, `mock_${srvName}`))
  },
  dummy: () => {
    const DummyStrategy = require('./DummyStrategy')
    passport.use(new DummyStrategy())
  }
}

const _isUser = user => {
  return (
    user.id &&
    'locale' in user &&
    'tenant' in user &&
    user.attr &&
    typeof user.attr === 'object' &&
    user.is &&
    typeof user.is === 'function'
  )
}

const _userId = (user, info) => {
  // fallback for grant_type=client_credentials (xssec v2 || v3)
  return user.id || (info && (info.clientId || (info.getClientId && info.getClientId())))
}

const _addRolesFromGrantType = (roles, info) => {
  const grantType = info && (info.grantType || (info.getGrantType && info.getGrantType()))
  if (grantType) {
    // > not "weak"
    roles.push('authenticated-user')
    if (['client_credentials', 'client_x509'].includes(grantType)) {
      roles.push('system-user')
    }
  }
}

const _roles = (roles, info) => {
  _addRolesFromGrantType(roles, info)

  // convert to object
  roles = Object.assign(...roles.map(ele => ({ [ele]: true })))

  // from scopes or info's checkLocalScope
  if (info && info.scopes) {
    // > xssec v2
    info.scopes.forEach(role => {
      // cut off xsappname
      role = info.xsappname ? role.split(`${info.xsappname}.`).pop() : role
      roles[role] = true
    })
  }

  if (info && info.checkLocalScope && typeof info.checkLocalScope === 'function') {
    // > xssec v3
    const _roles = roles
    roles = new Proxy(_roles, {
      get: function (_, role) {
        return role in _roles ? _roles[role] : info.checkLocalScope(role)
      }
    })
  }

  return roles
}

const _attr = info => {
  if (!info) {
    return {}
  }

  if (info.userInfo || info.userAttributes) {
    // > xssec v2
    return Object.assign({}, info.userInfo, info.userAttributes)
  }

  if (info.getAttribute && typeof info.getAttribute === 'function') {
    // > xssec v3
    return new Proxy(
      {},
      {
        get: function (_, attr) {
          return info.getAttribute(attr)
        }
      }
    )
  }

  return {}
}

const _tenant = info => {
  // xssec v2 || v3
  return info && (info.identityZone || (info.getZoneId && info.getZoneId()))
}

const _cb = (req, res, next, err, user, info) => {
  if (err) {
    // REVISIT: log error for app developer once new logging concept is in place
    req._auditLogger.unauthorized()
    return res.status(401).json({ error: { code: '401', message: 'Unauthorized' } }) // > no details to client
  }

  let challenges
  if (info && Array.isArray(info)) {
    // > info === challenges
    challenges = info.filter(ele => ele)
    info = null
  }

  // compat req._.req.authInfo
  if (info) {
    req.authInfo = info
  }

  if (!user) {
    // in case of $batch we need to challenge here, as the header is not processed if in $batch response body
    if (req.url.endsWith('/$batch') && challenges && challenges.length > 0) {
      res.set('WWW-Authenticate', challenges.join(';'))
      return res.status(401).end()
    }

    // > anonymous user for services with mixed auth
    req.user = Object.assign(new User(), { _challenges: challenges })
    return next()
  }

  // req.user
  if (_isUser(user)) {
    req.user = user
  } else {
    req.user = new User(
      Object.assign(
        { id: _userId(user, info) },
        {
          _roles: _roles(['any', 'identified-user'], info),
          attr: _attr(info),
          tenant: _tenant(info) || null
        }
      )
    )
    Object.defineProperty(req.user, '_req', { enumerable: false, value: req })
  }

  next()
}

const _getRestricted = srv => {
  return !!(
    srv.definition['@requires'] ||
    Object.keys(srv.entities).some(k => srv.entities[k]['@requires'] || srv.entities[k]['@restrict']) ||
    Object.keys(srv.entities).some(
      k =>
        srv.entities[k].actions &&
        Object.keys(srv.entities[k].actions).some(
          l => srv.entities[k].actions[l]['@requires'] || srv.entities[k].actions[l]['@restrict']
        )
    )
  )
}

const _initializeStrategy = (strategy, config, srv) => {
  if (!initializers[strategy]) {
    // REVISIT: why?
    process.exitCode = 1
    throw new Error(`Authentication strategy "${strategy}" is not supported`)
  }

  if (!authenticators[strategy] || strategy === 'mock' || process.env.NODE_ENV === 'test') {
    initializers[strategy](config, srv.name)
    authenticators[strategy] = true
  }
}

const _getAuditLoggingHelperMiddleware = auditLogger => {
  return (req, res, next) => {
    req._auditLogger = auditLogger

    req._auditLogger.unauthorized = function () {
      const ip = getIpFromRequest(req)
      auditLogger.logUnauthorized({ user: getUserFromRequest(req) || ip, ip })
    }

    req._auditLogger.forbidden = function () {
      const ip = getIpFromRequest(req)
      auditLogger.logMissingPermissions({
        user: getUserFromRequest(req) || ip,
        ip,
        tenant: req.user.tenant || 'unknown'
      })
    }

    next()
  }
}

const _getAuthenticateMiddleware = (config, srv) => {
  return (req, res, next) => {
    passport.authenticate(
      config.strategy.map(s => (s === 'mock' ? `mock_${srv.name}` : s)),
      { session: false, failWithError: true },
      _cb.bind(undefined, req, res, next)
    )(req, res, next)
  }
}

const _getConfigFromOptions = options => {
  if (process.env.NODE_ENV === 'test') {
    return options.auth || options.passport
  }
  return options.passport || options.auth
}

const _getConfigFromEnv = () => {
  if (process.env.NODE_ENV === 'test') {
    return (cds.env.requires && cds.env.requires.auth) || (cds.env.auth && cds.env.auth.passport)
  }
  return (cds.env.auth && cds.env.auth.passport) || (cds.env.requires && cds.env.requires.auth)
}

module.exports = (srv, app, auditLogger, options) => {
  // REVISIT: use new cds env compat (should be there with ^4.0.2)

  // REVISIT: remove options.passport once possible
  let config = _getConfigFromOptions(options)

  const restricted = _getRestricted(srv)
  const multiTenant = !!(cds.env.requires && cds.env.requires.db && cds.env.requires.db.multiTenant)

  if (!config && !restricted && (!multiTenant || process.env.NODE_ENV !== 'production')) {
    if (multiTenant) {
      // REVISIT: no warn
      console.warn(`[${srv.name}] - Authentication needed for multi tenancy in production.`)
    }

    return
  }

  // REVISIT: remove with event-based audit logging
  // add audit logger to req and augment with .unauthorized and .forbidden
  app.use(srv.path, _getAuditLoggingHelperMiddleware(auditLogger))

  // REVISIT: remove cds.env.auth.passport once possible
  config = config || _getConfigFromEnv()

  if (config.impl) {
    // > custom middleware
    app.use(srv.path, _require(cds.resolve(config.impl)))

    return
  }

  // here, we need passport
  passport = passport || _require('passport')

  // initialize strategies
  config.strategy = Array.isArray(config.strategy) ? config.strategy : [config.strategy]
  for (let strategy of config.strategy) {
    _initializeStrategy(strategy, config, srv)
  }

  // authenticate
  app.use(srv.path, passport.initialize())
  app.use(srv.path, _getAuthenticateMiddleware(config, srv))
}
