async function loadConfig(env) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value)
  }
  const { config } = await import('./config.js')
  return config
}

describe('config notificationApiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('uses localhost when ENVIRONMENT is not set', async () => {
    const config = await loadConfig({
      ENVIRONMENT: undefined,
      NOTIFICATION_API_URL: undefined
    })

    expect(config.get('cdpEnvironment')).toBe('local')
    expect(config.get('notificationApiUrl')).toBe('http://localhost:8085')
  })

  test('derives the backend URL from the CDP environment', async () => {
    const config = await loadConfig({
      ENVIRONMENT: 'dev',
      NOTIFICATION_API_URL: undefined
    })

    expect(config.get('notificationApiUrl')).toBe(
      'https://trade-imports-fish-be.dev.cdp-int.defra.cloud'
    )
  })

  test('prefers an explicit NOTIFICATION_API_URL', async () => {
    const config = await loadConfig({
      ENVIRONMENT: 'dev',
      NOTIFICATION_API_URL: 'http://backend.example:9000'
    })

    expect(config.get('notificationApiUrl')).toBe('http://backend.example:9000')
  })

  test('rejects an unknown ENVIRONMENT', async () => {
    await expect(loadConfig({ ENVIRONMENT: 'staging' })).rejects.toThrow(
      /cdpEnvironment/
    )
  })
})
