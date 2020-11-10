const measurePerformance = require('../../utils/performance')

const request = (odataReq, odataRes, next) => {
  /*
   * .on('request') is the only possibility to set a shared object,
   * that can be used in ATOMICITY_GROUP_START and ATOMICITY_GROUP_END
   */
  if (odataReq.getUrlObject().path.includes('$batch')) {
    odataReq.setApplicationData({
      req: odataReq.getIncomingRequest()
    })
  }

  // in case of batch request with sap-statistics=true also measure performance of batched requests
  if (odataReq.getBatchApplicationData()) {
    measurePerformance(odataReq.getIncomingRequest(), odataRes._response)
  }

  next()
}

module.exports = request
