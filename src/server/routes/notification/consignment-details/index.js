import {
  consignmentDetailsController,
  submitConsignmentDetailsController
} from './controller.js'
import { notificationJourneyGuard } from '../guard.js'

export const consignmentDetails = {
  plugin: {
    name: 'notification-consignment-details',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/notification/consignment-details',
          options: {
            ext: {
              onPostAuth: notificationJourneyGuard({ requiresTransport: true })
            }
          },
          ...consignmentDetailsController
        },
        {
          method: 'POST',
          path: '/notification/consignment-details',
          options: {
            ext: {
              onPostAuth: notificationJourneyGuard({ requiresTransport: true })
            }
          },
          ...submitConsignmentDetailsController
        }
      ])
    }
  }
}
