const fs = require('fs')
const path = require('path')

const cds = global.cds || require('@sap/cds/lib')
const dir = (cds.localize && cds.localize.folder4 && cds.localize.folder4(process.cwd())) || null

const i18ns = {}

function init (locale, file) {
  if (!i18ns[locale]) {
    i18ns[locale] = {}
  }

  file = file || (dir && path.join(dir, locale ? `messages_${locale}.properties` : 'messages.properties'))
  if (!file) {
    return
  }

  let raw
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (e) {
    // console.warn(`[i18n] unable to load file "${file}" for locale "${locale}"`)
    return
  }

  try {
    const pairs = raw
      .replace(/\r/g, '')
      .split(/\n/)
      .map(ele => ele.trim())
      .filter(ele => ele && !ele.startsWith('#'))
      .map(ele => {
        const del = ele.indexOf('=')
        return [ele.slice(0, del), ele.slice(del + 1)].map(ele => ele.trim())
      })
    for (const [key, value] of pairs) {
      i18ns[locale][key] = value
    }
  } catch (e) {
    console.warn(`[i18n] unable to process file "${file}" for locale "${locale}"`)
  }
}

init('default', path.join(__dirname, 'messages.properties'))
init('')

module.exports = (key, locale = '', args = {}) => {
  if (typeof locale !== 'string') {
    args = locale
    locale = ''
  }

  // initialize locale if not yet done
  if (!i18ns[locale]) {
    init(locale)
  }

  // for locale OR app default OR cds default
  let text = i18ns[locale][key] || i18ns[''][key] || i18ns.default[key]

  // best effort replacement
  try {
    const matches = text.match(/\{[\w][\w]*\}/g) || []
    for (const match of matches) {
      text = text.replace(match, args[match.slice(1, -1)] || 'NULL')
    }
  } catch (e) {
    // nothing to do
  }

  return text
}
