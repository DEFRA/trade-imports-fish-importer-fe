import { load } from 'cheerio'
import { createServer } from '#/server/server.js'
import { config } from '#/config/config.js'

describe('server-side draft session storage', () => {
  test('session cookie contains only the opaque session ID, not draft data', async () => {
    const server = await createServer()
    try {
      await server.initialize()
      const auth = {
        strategy: 'session',
        credentials: {
          userId: 'test-user-importer-north-quay',
          role: 'importer',
          organisationId: 'test-org-north-quay-seafood'
        }
      }
      const guidance = await server.inject({
        url: '/notification/guidance',
        auth
      })
      const $ = load(guidance.payload)
      const response = await server.inject({
        method: 'POST',
        url: '/notification/guidance',
        auth,
        headers: {
          cookie: guidance.headers['set-cookie']
            .map((value) => value.split(';')[0])
            .join('; ')
        },
        payload: {
          crumb: $('form input[name="crumb"]').val(),
          journeyId: $('form input[name="journeyId"]').val()
        }
      })
      const name = config.get('session.cache.name')
      expect(response.statusCode).toBe(303)
      const cookie = guidance.headers['set-cookie']
        .find((value) => value.startsWith(`${name}=`))
        .split(';')[0]
      const { states } = await server.states.parse(cookie)
      expect(states[name]).toEqual({ id: expect.any(String) })
    } finally {
      await server.stop({ timeout: 0 })
    }
  })
})
