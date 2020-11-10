const getEvent = ({ customOperation, method, segments }, service) => {
  switch (method) {
    case 'UPDATE':
    case 'DELETE':
      return method
    case 'CREATE':
    case 'READ':
      if (customOperation) {
        return segments[segments.length - 1].name
      }
      return method
  }
}

module.exports = {
  getEvent
}
