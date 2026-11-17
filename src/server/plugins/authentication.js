import Cookie from '@hapi/cookie'

import { config } from '#/config/config.js'

const temporarySignInEnvironments = ['local', 'dev', 'test']

export const authentication = {
  plugin: {
    name: 'authentication',
    async register(server) {
      const enabled = config.get('auth.temporarySignInEnabled')
      const organisationId = config.get('auth.testOrganisationId')

      if (
        enabled &&
        !temporarySignInEnvironments.includes(config.get('cdpEnvironment'))
      ) {
        throw new Error(
          'Temporary sign-in requires ENVIRONMENT to be local, dev or test. Production, missing and unrecognised environments are not permitted.'
        )
      }

      if (
        enabled &&
        (!organisationId || organisationId.trim() !== organisationId)
      ) {
        throw new Error(
          'TEST_ORGANISATION_ID must be a non-empty ID without surrounding whitespace'
        )
      }

      await server.register(Cookie)

      server.app.authCache = server.cache({
        cache: config.get('session.cache.name'),
        segment: 'auth-sessions',
        expiresIn: config.get('session.cache.ttl')
      })

      server.auth.strategy('session', 'cookie', {
        cookie: {
          name: `${config.get('serviceName')}_auth`,
          password: config.get('session.cookie.password'),
          ttl: config.get('session.cookie.ttl'),
          path: '/',
          isSecure: config.get('session.cookie.secure'),
          isHttpOnly: true,
          isSameSite: 'Strict',
          clearInvalid: true
        },
        redirectTo(request) {
          if (
            !config.get('auth.temporarySignInEnabled') ||
            request.method !== 'get'
          ) {
            return false
          }

          const returnTo = `${request.path}${request.url.search}`
          return `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`
        },
        async validate(request, session) {
          if (
            !config.get('auth.temporarySignInEnabled') ||
            typeof session.sessionId !== 'string'
          ) {
            return { isValid: false }
          }

          let credentials
          try {
            credentials = await server.app.authCache.get(session.sessionId)
          } catch (error) {
            request.logger.error(
              { err: error },
              'Unable to read the authentication session cache'
            )
            throw error
          }
          if (!credentials) {
            return { isValid: false }
          }

          if (
            credentials.identitySource !== 'temporary' ||
            credentials.sessionId !== session.sessionId ||
            typeof credentials.userId !== 'string' ||
            !credentials.userId ||
            typeof credentials.organisationId !== 'string' ||
            !credentials.organisationId.trim()
          ) {
            request.logger.warn(
              'Rejecting invalid temporary authentication session'
            )
            await server.app.authCache.drop(session.sessionId)
            return { isValid: false }
          }

          return { isValid: true, credentials }
        }
      })

      if (enabled) {
        server.ext('onPreStart', () => {
          server.logger.warn(
            'Temporary sign-in is enabled: no identity provider is contacted. Enabled by the development scripts in package.json or TEMPORARY_SIGN_IN_ENABLED in deployment configuration. Synthetic test identities only; remove temporary sign-in settings when implementing SSO.'
          )
        })
      }
    }
  }
}
