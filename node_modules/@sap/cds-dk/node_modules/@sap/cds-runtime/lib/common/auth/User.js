// REVISIT: This is a fully redundant implementation of cds.User

/* istanbul ignore file */

function getLocale (req) {
  return (
    (req.query && req.query['sap-language']) ||
    (req.headers && (req.headers['x-sap-request-language'] || req.headers['accept-language']))
  )
}

class User {
  constructor (_) {
    if (!_) {
      // > anonymous
      return new User({ _is_anonymous: true, id: 'anonymous', _roles: { any: true } })
    }

    // id
    if (typeof _ === 'string') {
      _ = { id: _ }
    }

    // copy all properties
    Object.assign(this, _)

    // tenant
    if (!_.tenant) {
      this.tenant = null
    }

    // roles
    if (!_._roles) {
      // REVISIT: _.authLevel
      this._roles = {
        any: true,
        'identified-user': !!_.id,
        'authenticated-user': !!_.id && _.authLevel !== 'weak'
      }
    }

    // attributes
    if (!_.attr) {
      this.attr = {}
    }
  }

  get locale () {
    return this._locale || (this._locale = (this._req && getLocale(this._req)) || null)
  }

  is (role) {
    return this._roles[role] || false
  }

  valueOf () {
    return this.id
  }
}

module.exports = User
