import Joi from 'joi'

import { guidanceController, startGuidanceController } from './controller.js'

export const guidance = {
  plugin: {
    name: 'notification-guidance',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/notification/guidance',
          ...guidanceController
        },
        {
          method: 'POST',
          path: '/notification/guidance',
          options: {
            validate: {
              payload: Joi.object({
                journeyId: Joi.string().uuid().required()
              })
            }
          },
          ...startGuidanceController
        }
      ])
    }
  }
}
