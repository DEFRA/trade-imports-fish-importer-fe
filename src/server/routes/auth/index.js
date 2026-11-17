import Joi from 'joi'

import { authController } from './controller.js'
import { isSafeRedirect } from '#/server/common/helpers/is-safe-redirect.js'

const signInQuery = Joi.object({
  returnTo: Joi.string()
    .max(2000)
    .custom((value, helpers) =>
      isSafeRedirect(value) ? value : helpers.error('any.invalid')
    )
    .default('/')
})

const optionalSession = { strategy: 'session', mode: 'try' }

export const temporaryAuth = {
  plugin: {
    name: 'temporary-auth-routes',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/auth/sign-in',
          options: {
            auth: optionalSession,
            validate: { query: signInQuery }
          },
          handler: authController.signInPage
        },
        {
          method: 'POST',
          path: '/auth/sign-in',
          options: {
            auth: optionalSession,
            validate: {
              query: signInQuery,
              payload: Joi.object({})
            }
          },
          handler: authController.signIn
        },
        {
          method: 'POST',
          path: '/auth/sign-out',
          options: {
            auth: 'session',
            validate: { payload: Joi.object({}) }
          },
          handler: authController.signOut
        },
        {
          method: 'GET',
          path: '/dev/identity',
          options: { auth: 'session' },
          handler: authController.identity
        }
      ])
    }
  }
}
