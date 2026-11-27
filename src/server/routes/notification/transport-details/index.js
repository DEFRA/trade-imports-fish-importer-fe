import {
  getTransportDetailsController,
  postTransportDetailsController
} from './controller.js'
import { transportDetailsModel, transportDetailsSchema } from './model.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { notificationJourneyGuard } from '../guard.js'

const path = '/notification/transport-details'

export const transportDetails = {
  plugin: {
    name: 'transport-details',
    register(server) {
      server.route([
        {
          method: 'GET',
          path,
          options: {
            ext: { onPostAuth: notificationJourneyGuard() }
          },
          ...getTransportDetailsController
        },
        {
          method: 'POST',
          path,
          options: {
            ext: {
              onPostAuth: notificationJourneyGuard({
                validateWithoutDraft: true
              })
            },
            validate: {
              payload: transportDetailsSchema,
              failAction(request, h) {
                const draft = request.app.notificationDraft
                if (!draft) {
                  return h
                    .redirect('/notification/guidance')
                    .code(statusCodes.seeOther)
                    .takeover()
                }
                return h
                  .view(
                    'notification/transport-details/index',
                    transportDetailsModel(
                      request.payload?.transportMethod,
                      true,
                      draft.id
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
