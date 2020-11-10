const { ensureUnlocalized } = require('../../common/utils/draft')

// REVISIT: for subselects in @restrict.where
const adjustWhereOfUnion = union => {
  for (const arg of union.SET.args) {
    if (!arg.SELECT.where) continue
    for (const subselect of arg.SELECT.where) {
      if (!subselect.SELECT || !subselect.SELECT.__targetFrom) continue
      subselect.SELECT.where.forEach(w => {
        if (w.ref && w.ref[0] === subselect.SELECT.__targetFrom.name) {
          w.ref[0] = arg.SELECT.from.ref[0].replace(/\./g, '_')
        }
      })
    }
  }
}

// REVISIT: for subselects in @restrict.where
const _rewriteWhere = (query, name, alias) => {
  query.SELECT.where &&
    query.SELECT.where
      .filter(ele => ele.SELECT && ele.SELECT.where)
      .forEach(ele =>
        ele.SELECT.where.forEach(w => {
          if (w.ref && w.ref[0] === name) w.ref[0] = alias
        })
      )
}

const _redirectColumns = (query, target, localized) => {
  if (target['@odata.draft.enabled']) {
    // REVISIT: generalize
    query.SELECT.columns &&
      query.SELECT.columns.forEach(ele => {
        if (!ele.xpr) return
        ele.xpr.forEach(xpr => {
          if (!xpr.SELECT) return
          xpr.SELECT.where.forEach(w => {
            if (w.ref && w.ref[0] === target.name) {
              w.ref[0] = localized.name
            }
          })
        })
      })
  }
}

const redirect = (query, target, name, localized) => {
  let alias
  if (query.SELECT.from.ref) {
    query.SELECT.from.ref = [localized.name]
  } else if (query.SELECT.from.join) {
    const arg = query.SELECT.from.args.find(a => a.ref && ensureUnlocalized(a.ref[0]) === name)
    if (arg) {
      alias = arg.as
      arg.ref = [localized.name]
    }
  }

  // REVISIT: rewrite custom wheres (AFC)
  _rewriteWhere(query, name.replace(/\./g, '_'), alias || localized.name.replace(/\./g, '_'))

  _redirectColumns(query, target, localized)
}

module.exports = {
  adjustWhereOfUnion,
  redirect
}
