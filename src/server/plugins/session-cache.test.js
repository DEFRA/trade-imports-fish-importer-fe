import { createServer } from '#/server/server.js'
import { config } from '#/config/config.js'

describe('server-side draft session storage', () => {
  test('session cookie contains only the opaque session ID, not draft data', async () => {
    const server = await createServer()
    try {
      await server.initialize()
      const response = await server.inject('/notification/transport-details')
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
