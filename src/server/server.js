import path from 'path'
import hapi from '@hapi/hapi'
import Scooter from '@hapi/scooter'

import { router } from './plugins/router.js'
import { config } from '#/config/config.js'
import { pulse } from './plugins/pulse.js'
import { catchAll } from './common/helpers/errors.js'
import { nunjucksConfig } from '#/config/nunjucks/nunjucks.js'
import { requestTracing } from './plugins/request-tracing.js'
import { requestLogger } from './plugins/request-logger.js'
import { sessionCache } from './plugins/session-cache.js'
import { getCacheEngine } from './common/helpers/session-cache/cache-engine.js'
import { secureContext } from '@defra/hapi-secure-context'
import { contentSecurityPolicy } from './plugins/content-security-policy.js'
import { metrics } from '@defra/cdp-metrics'
import { cookieConsent } from '#/server/plugins/cookie-consent.js'
import { csrf } from '#/server/plugins/csrf.js'
import { authentication } from '#/server/plugins/authentication.js'
import { createJourneyStore } from './services/notifications/journey-store.js'

export async function createServer() {
  const cacheType = config.get('session.cache.engine')
  const cacheEngine = getCacheEngine(cacheType)
  const server = hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        }
      },
      files: {
        relativeTo: path.resolve(config.get('root'), '.public')
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    },
    cache: [
      {
        name: config.get('session.cache.name'),
        engine: cacheEngine
      }
    ],
    state: {
      strictHeader: false
    }
  })
  await server.register([
    requestLogger,
    requestTracing,
    metrics,
    secureContext,
    pulse,
    contentSecurityPolicy,
    sessionCache,
    authentication,
    nunjucksConfig,
    Scooter,
    csrf,
    cookieConsent,
    router // Register all the controllers/routes defined in src/server/router.js
  ])

  server.app.savedNotificationDrafts = server.cache({
    cache: config.get('session.cache.name'),
    segment: 'saved-notification-drafts',
    expiresIn: config.get('session.cache.ttl')
  })
  server.app.notificationJourneyStore = createJourneyStore(
    config.get('session.cache.ttl'),
    // Catbox attaches the Redis client when Hapi initializes its caches.
    cacheType === 'redis' ? () => cacheEngine.client : undefined
  )

  server.ext('onPreResponse', catchAll)

  return server
}
