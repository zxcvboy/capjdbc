const { ensureUnlocalized } = require('../common/utils/draft')
const { adjustWhereOfUnion, redirect } = require('../db/utils/localized')

const _handler = req => {
  // do simple checks upfront and exit early
  if (!req.query || typeof req.query === 'string') return
  if (!req.user || !req.user.locale) return
  if (!req._model) return

  // prevent localization in "select for update" n/a for sqlite

  const target = req.target || req.context.target
  if (!target || target['@cds.localized'] === false) return

  // if we get here via onReadDraft, target is already localized
  // because of subrequest using SELECT.from as new target
  // if union, target is the union object { SET: ....}
  const name = typeof target.name === 'string' ? ensureUnlocalized(target.name) : target.name
  if (typeof name === 'object') {
    // > union
    // REVISIT: rewrite custom wheres (AFC)
    adjustWhereOfUnion(target.name)
  } else if (!req._model.definitions['localized.' + name]) return

  // REVISIT: this is actually configurable
  // there is no localized.en.<name>
  const localized = req._model.definitions[`localized.${req.user.locale !== 'en' ? req.user.locale + '.' : ''}${name}`]
  if (!localized) return

  // REVISIT: .redirectTo() drops existing alias
  // if (l) req.query = req.query.redirectTo(l.name)

  redirect(req.query, target, name, localized)
}

_handler._initial = true

module.exports = _handler
