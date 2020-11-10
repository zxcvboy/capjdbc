const topic = (event, eventCsn, service, msgService) => {
  const _prefix = service.options.prefix
  const _topic = eventCsn['@topic']
  if (_topic) {
    if (_prefix) return `${_prefix}${_topic}`
    return _topic
  }
  if (msgService.topic) return msgService.topic(event, service)
  return eventCsn.name
}

module.exports = { topic }
