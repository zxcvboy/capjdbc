const RestRequest = require('../RestRequest')

const { parseDeleteUrl } = require('../utils/parse-url')
const handleError = require('../utils/handle-error')

const del = service => {
  return (restReq, restRes) => {
    let parsedUrl
    try {
      parsedUrl = parseDeleteUrl(service.entities, restReq)
    } catch (err) {
      return handleError(err, service, restReq, restRes)
    }

    const req = new RestRequest(parsedUrl, service, restReq, restRes)

    return service
      .dispatch(req)
      .then(() => {
        // assumed, that status will be set to something, that is not the default
        if (restRes.statusCode === 200) {
          restRes.status(204)
        }
        restRes.send()
      })
      .catch(err => {
        // Hide errors in generic message but log detailed error
        handleError(err, service, restReq, restRes)
      })
  }
}

module.exports = del
