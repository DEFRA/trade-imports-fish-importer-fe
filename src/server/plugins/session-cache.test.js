import { load } from 'cheerio'
import { createServer } from '#/server/server.js'
import { config } from '#/config/config.js'
import * as redis from '#/server/common/helpers/redis-client.js'

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

describe('Redis notification journey storage', () => {
  const sessionId = 'browser-session'
  const key = `notification-journey:${sessionId}`
  const draft = {
    id: 'legacy-id',
    organisationId: 'importer-org',
    saved: false
  }
  let server
  let redisClient
  let cacheEngine

  beforeEach(async () => {
    cacheEngine = config.get('session.cache.engine')
    config.set('session.cache.engine', 'redis')
    redisClient = {
      status: 'ready',
      get: vi.fn(),
      set: vi.fn(),
      eval: vi.fn()
    }
    vi.spyOn(redis, 'buildRedisClient').mockReturnValue(redisClient)
    server = await createServer()
    await server.initialize()
  })

  afterEach(async () => {
    config.set('session.cache.engine', cacheEngine)
    vi.restoreAllMocks()
    await server?.stop({ timeout: 0 })
  })

  test('returns no draft for a Redis cache miss', async () => {
    redisClient.get.mockResolvedValue(null)

    expect(await server.app.notificationJourneyStore.get(sessionId)).toBeNull()
    expect(redisClient.get).toHaveBeenCalledExactlyOnceWith(key)
  })

  test('migrates legacy state with the session TTL and without overwriting existing state', async () => {
    const store = server.app.notificationJourneyStore
    const state = {
      current: draft,
      started: { 'previous-id': true, [draft.id]: true }
    }

    await store.initialize(sessionId, draft, ['previous-id', draft.id])

    expect(redisClient.set).toHaveBeenCalledExactlyOnceWith(
      key,
      JSON.stringify(state),
      'PX',
      config.get('session.cache.ttl'),
      'NX'
    )
    redisClient.get.mockResolvedValue(JSON.stringify(state))
    expect(await store.get(sessionId)).toEqual(draft)
    expect(redisClient.get).toHaveBeenCalledExactlyOnceWith(key)
  })

  test('passes the journey identity to Redis and reports when Redis rejects a replay', async () => {
    const store = server.app.notificationJourneyStore
    redisClient.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0)

    expect(await store.start(sessionId, draft.id, draft.organisationId)).toBe(
      true
    )
    expect(await store.start(sessionId, draft.id, draft.organisationId)).toBe(
      false
    )
    const args = [
      expect.any(String),
      1,
      key,
      draft.id,
      draft.organisationId,
      config.get('session.cache.ttl')
    ]
    expect(redisClient.eval.mock.calls).toEqual([args, args])
  })
})
