import { nextStepController } from './controller.js'

export const nextStep = {
  plugin: {
    name: 'notification-next-step',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/notification/next-step',
          ...nextStepController
        }
      ])
    }
  }
}
