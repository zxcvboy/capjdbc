function processNestedCQNs (cqns, processFn, model, dbc, user, locale, txTimestamp) {
  return cqns.reduce((promise, cqns) => {
    return promise.then(changes => {
      return Promise.all(
        cqns.map(cqn => {
          return Promise.resolve(processFn(model, dbc, cqn, user, locale, txTimestamp)).then(result => {
            changes += isNaN(parseInt(result, 10)) ? 0 : result
          })
        })
      ).then(() => {
        return changes
      })
    })
  }, Promise.resolve(0))
}

function timestampToISO (ts) {
  if (typeof ts === 'number') {
    return new Date(ts).toISOString()
  }

  // REVISIT: instanceof or object
  if (ts instanceof Date) {
    return ts.toISOString()
  }

  return ts
}

module.exports = {
  processNestedCQNs,
  timestampToISO
}
