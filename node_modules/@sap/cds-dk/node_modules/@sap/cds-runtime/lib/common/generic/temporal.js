// REVISIT: no Hana specific logic here (replacing T with space)
const _convertToDateString = date => date.toISOString().replace('T', ' ')

const _getDateFromQueryOptions = (str, toValue) => {
  const match = str.match(/^date'(.+)'$/)

  // REVISIT: What happens with invalid date values in query parameter?
  return new Date(match[1])
}
/**
 * Generic handler for entities using temporal aspect
 */
const _handler = req => {
  const queryOptions = req._.req && req._.req.query
  const _ = req._

  if (
    !queryOptions ||
    (!queryOptions['sap-valid-at'] && !queryOptions['sap-valid-to'] && !queryOptions['sap-valid-from'])
  ) {
    const date = new Date()
    _['VALID-FROM'] = _convertToDateString(date)
    // REVISIT: Why do we add a second?
    date.setTime(date.getTime() + 1000)
    _['VALID-TO'] = _convertToDateString(date)
  } else if (queryOptions['sap-valid-at']) {
    const date = _getDateFromQueryOptions(queryOptions['sap-valid-at'])
    _['VALID-FROM'] = _convertToDateString(date)
    date.setTime(date.getTime() + 1000)
    _['VALID-TO'] = _convertToDateString(date)
  } else if (queryOptions['sap-valid-from']) {
    _['VALID-FROM'] = _convertToDateString(_getDateFromQueryOptions(queryOptions['sap-valid-from']))

    let toDate
    if (queryOptions['sap-valid-to']) {
      toDate = _getDateFromQueryOptions(queryOptions['sap-valid-to'])
    }

    _['VALID-TO'] = _convertToDateString(toDate || new Date('9999-01-01T00:00:00.000Z'))
  }
}

/*
 * handler registration
 */
/* istanbul ignore next */
module.exports = function () {
  _handler._initial = true

  for (const k in this.entities) {
    const entity = this.entities[k]

    if (!Object.values(entity.elements).some(ele => ele['@cds.valid.from'] || ele['@cds.valid.to'])) {
      // entity not temporal
      this.before('READ', entity, _handler) // > only for READ (for expand)
      continue
    }

    this.before('*', entity, _handler) // > for any event
  }
}

/*
 * export handler for use in old stack
 */
module.exports.handler = _handler
