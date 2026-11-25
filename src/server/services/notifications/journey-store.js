const startScript = `
local raw = redis.call('GET', KEYS[1])
local state = raw and cjson.decode(raw) or {started = {}, current = cjson.null}
if state.started[ARGV[1]] then
  return 0
end
state.started[ARGV[1]] = true
state.current = {id = ARGV[1], organisationId = ARGV[2], saved = false}
redis.call('PSETEX', KEYS[1], ARGV[3], cjson.encode(state))
return 1
`

export function createJourneyStore(ttl, redisClient) {
  const memory = new Map()
  const keyOf = (sessionId) => `notification-journey:${sessionId}`

  function memoryState(sessionId) {
    const entry = memory.get(sessionId)
    if (entry && entry.expiresAt > Date.now()) {
      return entry.state
    }
    clearTimeout(entry?.timer)
    memory.delete(sessionId)
    return null
  }

  function setMemoryState(sessionId, state) {
    clearTimeout(memory.get(sessionId)?.timer)
    const timer = setTimeout(() => memory.delete(sessionId), ttl).unref()
    memory.set(sessionId, { state, expiresAt: Date.now() + ttl, timer })
  }

  return {
    async get(sessionId) {
      const state = redisClient
        ? JSON.parse((await redisClient().get(keyOf(sessionId))) ?? 'null')
        : memoryState(sessionId)
      return state?.current ?? null
    },
    async initialize(sessionId, current, startedIds) {
      const state = {
        current,
        started: Object.fromEntries(startedIds.map((id) => [id, true]))
      }
      if (redisClient) {
        await redisClient().set(
          keyOf(sessionId),
          JSON.stringify(state),
          'PX',
          ttl,
          'NX'
        )
      } else if (!memoryState(sessionId)) {
        setMemoryState(sessionId, state)
      }
    },
    async start(sessionId, id, organisationId) {
      if (redisClient) {
        const started = await redisClient().eval(
          startScript,
          1,
          keyOf(sessionId),
          id,
          organisationId,
          ttl
        )
        return started === 1
      }
      const state = memoryState(sessionId) ?? {
        current: null,
        started: {}
      }
      if (state.started[id]) {
        return false
      }
      state.started[id] = true
      state.current = { id, organisationId, saved: false }
      setMemoryState(sessionId, state)
      return true
    }
  }
}
