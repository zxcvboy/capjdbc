const { writeFile, readFile, appendFile, lstat, unlink, lstatSync, writeFileSync } = require('fs')
const { promisify } = require('util')
const _lstat = promisify(lstat)
const _appendFile = promisify(appendFile)
const _writeFile = promisify(writeFile)
const _readFile = promisify(readFile)
const _unlink = promisify(unlink)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// TODO: handle spaces in data's payload
const _splitLine = str => {
  const firstSpace = str.indexOf(' ')
  return [str.substring(0, firstSpace), str.substring(firstSpace + 1)]
}

const isLocked = lock => {
  try {
    lstatSync(lock)
  } catch (_) {
    return false
  }
  return true
}

const _useJSON = (msg, event, executeArray) => {
  try {
    const _msg = JSON.parse(msg)
    executeArray.push({ event, msg: _msg })
  } catch (e) {
    console.error(e)
  }
}

const _useLines = (lines, subscriptions, executeArray, writeArray) => {
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [event, _msg] = _splitLine(trimmed)
    if (subscriptions.has(event)) {
      _useJSON(_msg, event, executeArray)
    } else {
      writeArray.push(line)
    }
  }
}

const _getLines = async file => {
  const content = await _readFile(file, 'utf8')
  return content.split('\n')
}

const _rewriteAndUpdateStatus = async (executeArray, writeArray, file, status) => {
  const toWrite = writeArray.join('\n')
  try {
    if (executeArray.length) await _writeFile(file, toWrite)
    const lstatAfterChange = await _lstat(file)
    status.lastCtimeMs = lstatAfterChange.ctimeMs
  } catch (e) {}
}

const _callExecutables = async (executeArray, cb) => {
  for (const exe of executeArray) {
    await cb(exe.event, exe.msg)
  }
}

const watch = async (file, lock, subscriptions, status, cb) => {
  while (status.active) {
    try {
      const lstat = await _lstat(file)
      if (lstat.ctimeMs > status.lastCtimeMs) {
        if (!isLocked(lock)) {
          writeFileSync(lock, '')
          const executeArray = []
          const writeArray = []
          const lines = await _getLines(file)
          _useLines(lines, subscriptions, executeArray, writeArray)
          await _rewriteAndUpdateStatus(executeArray, writeArray, file, status)
          await _unlink(lock)
          await _callExecutables(executeArray, cb)
        }
      }
    } catch (e) {}
    await sleep(500)
  }
}

const _write = async (file, lock, line) => {
  try {
    lstatSync(lock)
    await sleep(400)
    return _write(file, lock, line)
  } catch (_) {
    writeFileSync(lock, '')
    try {
      await _appendFile(file, line)
    } catch (e) {}
    await _unlink(lock)
  }
}

const _safelyRemoveLock = async (lock, numberOfRetries) => {
  if (numberOfRetries <= 0) await _unlink(lock)
  try {
    await _lstat(lock)
    await sleep(20)
    await _safelyRemoveLock(lock, numberOfRetries - 1)
  } catch (e) {}
}

const init = async (file, lock) => {
  try {
    await _lstat(file)
  } catch (e) {
    await _writeFile(file, '')
  }
  await _safelyRemoveLock(lock, 5)
}

const emit = async (req, file, lock) => {
  const msg = { ...req.headers, data: req.data }
  let line = `\n${req.event} ${JSON.stringify(msg)}`
  const res = await _write(file, lock, line)
  return res
}

module.exports = {
  emit,
  init,
  watch
}
