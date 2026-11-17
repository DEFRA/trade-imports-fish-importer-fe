import { createServer } from '#/server/server.js'
import { config } from '#/config/config.js'

describe('server-side draft session storage', () => {
  test('session cookie contains only the opaque session ID, not draft data', async () => {
    const server = await createServer()
    try {
      await server.initialize()
      const response = await server.inject({
        url: '/notification/transport-details',
        auth: {
          strategy: 'session',
          credentials: {
            userId: 'test-user-importer-north-quay',
            role: 'importer',
            organisationId: 'test-org-north-quay-seafood'
          }
        }
      })
      const name = config.get('session.cache.name')
      const cookie = response.headers['set-cookie']
        .find((value) => value.startsWith(`${name}=`))
        .split(';')[0]
      const { states } = await server.states.parse(cookie)
      expect(states[name]).toEqual({ id: expect.any(String) })
    } finally {
      await server.stop({ timeout: 0 })
    }
  })
})
