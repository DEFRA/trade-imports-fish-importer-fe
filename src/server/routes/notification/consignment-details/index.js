import {
  consignmentDetailsController,
  submitConsignmentDetailsController
} from './controller.js'

export const consignmentDetails = {
  plugin: {
    name: 'notification-consignment-details',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/notification/consignment-details',
          ...consignmentDetailsController
        },
        {
          method: 'POST',
          path: '/notification/consignment-details',
          ...submitConsignmentDetailsController
        }
      ])
    }
  }
}
