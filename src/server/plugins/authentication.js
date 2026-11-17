import Boom from '@hapi/boom'
import Cookie from '@hapi/cookie'

import { config } from '#/config/config.js'
import {
  findTestUser,
  getTestUsers
} from '#/server/common/helpers/test-users.js'

const testUserSignInEnvironments = new Set(['local', 'dev', 'test'])
const testUserSignInEnabledKey = 'auth.testUserSignInEnabled'
const noRedirectUrl = ''

function redirectToSignIn(request) {
  if (!config.get(testUserSignInEnabledKey) || request.method !== 'get') {
    return noRedirectUrl
  }

  const returnTo = `${request.path}${request.url.search}`
  return `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`
}

async function validateTestUserSession(request, session) {
  if (
    !config.get(testUserSignInEnabledKey) ||
    typeof session.sessionId !== 'string'
  ) {
    return { isValid: false }
  }

  const { credentials } = request.app.authSession
  if (!credentials) {
    return { isValid: false }
  }

  const user = findTestUser(credentials.userId)
  if (
    credentials.identitySource !== 'test-user' ||
    credentials.sessionId !== session.sessionId ||
    !user ||
    credentials.role !== user.role ||
    credentials.organisationId !== user.organisationId
  ) {
    request.logger.warn('Rejecting invalid test user authentication session')
    await request.server.app.authCache.drop(session.sessionId)
    return { isValid: false }
  }

  return { isValid: true, credentials }
}

async function loadAuthSession(request, h, authCookieName) {
  const auth = request.server.auth.lookup(request.route)
  const session = request.state[authCookieName]
  if (
    !config.get(testUserSignInEnabledKey) ||
    !auth?.strategies?.includes('session') ||
    request.auth.credentials ||
    typeof session?.sessionId !== 'string'
  ) {
    return h.continue
  }

  try {
    request.app.authSession = {
      credentials: await request.server.app.authCache.get(session.sessionId)
    }
  } catch (error) {
    request.logger.error(
      { err: error },
      'Unable to read the authentication session cache'
    )
    throw Boom.serverUnavailable('Unable to verify the authentication session')
  }

  return h.continue
}

export const authentication = {
  plugin: {
    name: 'authentication',
    async register(server) {
      const enabled = config.get(testUserSignInEnabledKey)

      if (
        enabled &&
        !testUserSignInEnvironments.has(config.get('cdpEnvironment'))
      ) {
        throw new Error(
          'Test user sign-in requires ENVIRONMENT to be local, dev or test. Production, missing and unrecognised environments are not permitted.'
        )
      }

      if (enabled) {
        getTestUsers()
      }

      await server.register(Cookie)

      server.app.authCache = server.cache({
        cache: config.get('session.cache.name'),
        segment: 'auth-sessions',
        expiresIn: config.get('session.cache.ttl')
      })

      const authCookieName = `${config.get('serviceName')}_auth`

      server.auth.strategy('session', 'cookie', {
        cookie: {
          name: authCookieName,
          password: config.get('session.cookie.password'),
          ttl: config.get('session.cookie.ttl'),
          path: '/',
          isSecure: config.get('session.cookie.secure'),
          isHttpOnly: true,
          isSameSite: 'Strict',
          clearInvalid: true
        },
        redirectTo: redirectToSignIn,
        validate: validateTestUserSession
      })

      server.auth.default('session')

      // Keep cache failures outside @hapi/cookie's invalid-session handling.
      server.ext('onPreAuth', (request, h) =>
        loadAuthSession(request, h, authCookieName)
      )

      if (enabled) {
        server.ext('onPreStart', () => {
          server.logger.warn(
            'Test user sign-in is enabled: no identity provider is contacted. Enabled by the development scripts in package.json or TEST_USER_SIGN_IN_ENABLED in deployment configuration. Synthetic test identities only; keep separate from the real SSO flow.'
          )
        })
      }
    }
  }
}
