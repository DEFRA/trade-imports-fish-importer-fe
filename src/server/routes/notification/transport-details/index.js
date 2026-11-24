import {
  getTransportDetailsController,
  postTransportDetailsController
} from './controller.js'
import { transportDetailsModel, transportDetailsSchema } from './model.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { currentDraft } from '#/server/services/notifications/draft-session.js'

const path = '/notification/transport-details'

export const transportDetails = {
  plugin: {
    name: 'transport-details',
    register(server) {
      server.route([
        {
          method: 'GET',
          path,
          ...getTransportDetailsController
        },
        {
          method: 'POST',
          path,
          options: {
            validate: {
              payload: transportDetailsSchema,
              failAction(request, h) {
                const draft = currentDraft(request)
                if (draft && draft.id !== request.payload?.journeyId) {
                  return h.redirect(path).code(statusCodes.seeOther).takeover()
                }
                return h
                  .view(
                    'notification/transport-details/index',
                    transportDetailsModel(
                      request.payload?.transportMethod,
                      true,
                      draft?.id
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
