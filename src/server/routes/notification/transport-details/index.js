import {
  getTransportDetailsController,
  postTransportDetailsController
} from './controller.js'
import { transportDetailsModel, transportDetailsSchema } from './model.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

export const transportDetails = {
  plugin: {
    name: 'transport-details',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/notification/transport-details',
          ...getTransportDetailsController
        },
        {
          method: 'POST',
          path: '/notification/transport-details',
          options: {
            validate: {
              payload: transportDetailsSchema,
              failAction(request, h) {
                return h
                  .view(
                    'notification/transport-details/index',
                    transportDetailsModel(
                      request.payload?.transportMethod,
                      true
                    )
                  )
                  .code(statusCodes.badRequest)
                  .takeover()
              }
            }
          },
          ...postTransportDetailsController
        }
      ])
    }
  }
}
