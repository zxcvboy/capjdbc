const cds = global.cds || require('@sap/cds/lib')

/*
 * Start of an atomicity group of $batch
 */
const start = (odataContext, done) => {
  if (!odataContext.applicationData.roots) {
    odataContext.applicationData.roots = {}
  }

  odataContext.applicationData.roots[odataContext.id] = new cds.Request({
    user: odataContext.applicationData.req.user
  })

  done()
}

/*
 * End of an atomicity group of $batch
 */
const end = async (odataErr, odataContext, done) => {
  const root = odataContext.applicationData.roots[odataContext.id]
  const errors = odataErr || odataContext.failedRequests.length > 0

  try {
    if (errors) {
      root._rollback && (await root._rollback())
    } else {
      root._commit && (await root._commit())
    }
  } catch (e) {
    if (!errors) {
      try {
        root._rollback && (await root._rollback())
      } catch (e1) {
        // > rollback failed... REVISIT: what to do?
      }
    }
    // here, some transactions may have been committed
    return done(e)
  }

  done()
}

module.exports = {
  start,
  end
}
