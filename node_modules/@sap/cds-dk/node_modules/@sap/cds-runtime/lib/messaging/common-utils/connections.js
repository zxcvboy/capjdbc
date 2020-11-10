const MAX_NUMBER_RECONNECTS = 1000
const MAX_WAITING_TIME = 1480000

const _waitingTime = x => (x > 18 ? MAX_WAITING_TIME : (Math.pow(1.5, x) + Math.random()) * 1000)

const _periodicallyReconnect = (client, x, n) => {
  setTimeout(() => {
    connect(client).catch(e => {
      console.error(e)
      console.log(`[cds] - Connection to Enterprise Messaging Client lost: Unsuccessful attempt to reconnect (${n}).`)
      /* istanbul ignore else */
      if (n < MAX_NUMBER_RECONNECTS) _periodicallyReconnect(client, x + 1, n + 1)
    })
  }, _waitingTime(x))
}

const connect = client => {
  return new Promise((resolve, reject) => {
    client
      .on('connected', async function () {
        client.removeAllListeners('error')
        client.removeAllListeners('connected')
        resolve(this)
      })
      .on('error', err => {
        client.removeAllListeners('disconnected')
        client.removeAllListeners('error')
        client.removeAllListeners('connected')
        reject(err)
      })
      .on('disconnected', async () => {
        client.removeAllListeners('disconnected')
        client.removeAllListeners('error')
        client.removeAllListeners('connected')
        _periodicallyReconnect(client, 0, 0)
      })

    client.connect()
  })
}

const disconnect = client => {
  client.removeAllListeners('disconnected')
  client.removeAllListeners('connected')
  client.removeAllListeners('error')
  return client.disconnect()
}

const queued = (pending, fn, ...args) => {
  return (pending.operations = pending.operations.then(() => {
    return fn(...args)
  }))
}

module.exports = {
  connect,
  disconnect,
  queued
}
