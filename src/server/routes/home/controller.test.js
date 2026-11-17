import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

describe('#homeController', () => {
  let server
  const auth = {
    strategy: 'session',
    credentials: { userId: 'test-user-001', organisationId: 'test-org-001' }
  }

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected response', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/',
      auth
    })

    expect(result).toEqual(
      expect.stringContaining('Import fish and fishery products |')
    )
    expect(statusCode).toBe(statusCodes.ok)
  })
})
