import { guidanceController } from './controller.js'

export const guidance = {
  plugin: {
    name: 'notification-guidance',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/notification/guidance',
          ...guidanceController
        }
      ])
    }
  }
}
