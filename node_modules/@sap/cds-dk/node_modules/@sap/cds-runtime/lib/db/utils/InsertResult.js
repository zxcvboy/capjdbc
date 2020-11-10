const iterator = Symbol.iterator

module.exports = class InsertResult {

  constructor (req, results) {
    this.results = results
    this.req = req
  }

  get [iterator]() { // NOSONAR

    const { target } = this.req; if (!target || !target.keys) return (super[iterator] = this.results[iterator])
    const { entries, columns, rows, values } = this.req.query.INSERT
    const keys = Object.keys(target.keys), [k1] = keys

    if (entries && k1 in entries[0]) return super[iterator] = function*(){
      for (let each of entries) {
        const kees = {}
        for (let k of keys) kees[k] = each[k]
        yield kees
      }
    }

    if (columns) {
      const indices = {}
      for (let k of keys) {
        let i = columns.indexOf(k)
        if (i>=0) indices[k] = i
      }

      if (rows && k1 in indices) return super[iterator] = function*(){
        for (let each of rows) {
          const kees = {}
          for (let k of keys) kees[k] = each[indices[k]]
          yield kees
        }
      }

      if (values && k1 in indices) return super[iterator] = function*(){
        for (let each of [values]) {
          const kees = {}
          for (let k of keys) kees[k] = each[indices[k]]
          yield kees
        }
      }
    }

    return super[iterator] = function*(){
      // REVISIT: sqlite only returns a single lastID per row -> how is that with others?
      for (let each of this.results) yield { [k1]: each }
    }
  }

  get length() {
    return (super.length = this.results.length || 1)
  }

  get keys() {
    if (this.length === 1) for (let first of this) return (super.keys = first)
    else return (super.keys = [ ...this ])
  }

  valueOf() {
    return this.length
  }
}
