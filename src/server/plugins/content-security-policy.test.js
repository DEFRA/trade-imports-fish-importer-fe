import { createServer } from '#/server/server.js'

describe('#contentSecurityPolicy', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should set the CSP policy header', async () => {
    // Use a public page to test the CSP header without requiring authentication.
    const resp = await server.inject({
      method: 'GET',
      url: '/cookies'
    })

    expect(resp.headers['content-security-policy']).toBeDefined()
  })
})
