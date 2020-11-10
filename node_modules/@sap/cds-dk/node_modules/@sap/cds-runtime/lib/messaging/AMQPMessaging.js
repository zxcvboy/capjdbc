const cds = global.cds || require('@sap/cds/lib')
const MessagingService = require('./service')
const ClientAmqp = require('@sap/xb-msg-amqp-v100').Client
const { topic, queueName } = require('./common-utils/naming-conventions')
const { connect, disconnect, queued } = require('./common-utils/connections')
const { sender } = require('./common-utils/client')
const _error = console.error

const _depcrecated = options => {
  const cred = options && options.credentials
  const moved = 'property moved from credentials section to top-level options.'
  if (cred) {
    if (cred.prefix) throw new Error(`'prefix' ${moved}`)
    if (cred.queue) throw new Error(`'queue' ${moved}`)
    if (cred.queueConfig) throw new Error(`'queueConfig' ${moved}`)
  }
}

class AMQPMessaging extends MessagingService {
  async init () {
    _depcrecated(this.options)
    const { optionsClient, optionsApp } = this._options(this.options)
    this.optionsClient = optionsClient
    this.optionsApp = optionsApp
    this.subscriptions = {
      queue: null,
      topics: new Set()
    }
    this.sender = null
    this.listening = false
    this.ready = false
    this.token = null
    this.client = new ClientAmqp(optionsClient.amqp)
    this.pending = { operations: Promise.resolve() }
    await connect(this.client)

    cds.once('listening', () => {
      this.ready = true
      this.listen()
    })

    super.on('*', (req, next) => {
      if (req.inbound) return next()
      this.sender || (this.sender = sender(this.client, this.optionsApp))
      /* istanbul ignore next  */
      if (process.env.DEBUG) console.log('[cds] - Emit', { topic: req.event })
      return this._emit(req, this.sender)
    })
    return super.init()
  }

  // inbound -> listen to channel (once)
  async on (topic, handler) {
    if (!this.subscriptions.queue) {
      const queue = queueName(this.options, this.optionsClient, this.optionsApp)
      const token = await queued(this.pending, this._putQueue, queue, this.optionsClient, this.options)
      this.token = token
      this.subscriptions.queue = queue
    }
    if (!this.subscriptions.topics.has(topic)) {
      await queued(this.pending, this._addSubscription, this.subscriptions.queue, topic, this.optionsClient, this.token)
      this.subscriptions.topics.add(topic)
    }
    await this.listen()
    return super.on(topic, handler)
  }

  async listen () {
    const queue = this.subscriptions.queue
    if (queue && !this.listening && this.ready) {
      this.listening = true
      this._addDataListener(this.client, queue, async (_event, _payload, { done, failed }) => {
        const data = _payload.data
        const headers = { ..._payload }
        delete headers.data
        try {
          await this.emit({ event: _event, data, headers, inbound: true })
          done()
        } catch (e) {
          failed()
          _error(e)
        }
      })
    }
  }

  disconnect () {
    return disconnect(this.client)
  }

  topic (event, service) {
    return topic(event, service, this.optionsClient)
  }
}

module.exports = AMQPMessaging
