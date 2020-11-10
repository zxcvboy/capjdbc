const { resolve } = require('path')
const { emit, init, watch } = require('./file-based-utils/client')
const cds = global.cds || require('@sap/cds/lib')

const MessagingService = require('./service')
const _error = console.error

class FileBasedMessaging extends MessagingService {
  async init () {
    const creds = this.options.credentials || (this.options.credentials = {})
    const file = creds.file || (creds.file = '~/.cds-msg-box')
    this.file = resolve(file.replace(/^~/, () => require('os').userInfo().homedir))
    this.lock = `${this.file}.lock`
    this.status = { active: true, lastCtimeMs: 0 }
    this.subscriptions = new Set()
    cds.once('listening', () => {
      this.ready = true
      this.listen()
    })

    await init(this.file, this.lock)
    super.on('*', (req, next) => {
      if (req.inbound) return next()
      /* istanbul ignore next */
      if (process.env.DEBUG) console.log('[cds] - Emit', { topic: req.event, file: this.file })
      return emit(req, this.file, this.lock)
    })
    return super.init()
  }

  // inbound -> listen to channel (once)
  async on (topic, handler) {
    this.subscriptions.add(topic)
    if (this.subscriptions.size === 1) this.listen()
    return super.on(topic, handler)
  }

  listen () {
    if (!this.listening && this.ready && this.subscriptions.size > 0) {
      this.listening = true
      // console.log('[cds] - Watch', { file: this.file }) // no std trace output by non-CLI components please
      watch(this.file, this.lock, this.subscriptions, this.status, async (event, payload) => {
        const data = payload.data
        const headers = { ...payload }
        delete headers.data
        try {
          await this.emit({ event, data, headers, inbound: true })
        } catch (e) {
          _error(e)
        }
      })
    }
  }

  disconnect () {
    this.status.active = false
  }
}

module.exports = FileBasedMessaging
