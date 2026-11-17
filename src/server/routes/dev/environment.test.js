import * as cheerio from 'cheerio'

import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'

describe('Environment diagnostics', () => {
  let server
  const originalEnabled = config.get('auth.temporarySignInEnabled')

  beforeAll(async () => {
    config.set('auth.temporarySignInEnabled', false)
    server = await createServer()
    await server.initialize()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    await server?.stop({ timeout: 0 })
    config.set('auth.temporarySignInEnabled', originalEnabled)
  })

  test.each(['dev', 'test', 'prod'])(
    'displays the actual %s environment without requiring temporary sign-in',
    async (value) => {
      vi.stubEnv('ENVIRONMENT', value)
      const response = await server.inject('/dev/environment')
      const $ = cheerio.load(response.payload)

      expect(response.statusCode).toBe(200)
      expect($('main dt').text().trim()).toBe('ENVIRONMENT')
      expect($('main dd').text().trim()).toBe(value)
      expect(response.headers['cache-control']).toBe('no-store')
    }
  )

  test.each([undefined, ''])(
    'reports a missing or empty variable instead of assuming local: %s',
    async (value) => {
      vi.stubEnv('ENVIRONMENT', value)
      const response = await server.inject('/dev/environment')
      const $ = cheerio.load(response.payload)

      expect(response.statusCode).toBe(200)
      expect($('main dd').text().trim()).toBe('Not set')
    }
  )

  test('does not use browser inputs or display unrelated environment variables', async () => {
    vi.stubEnv('ENVIRONMENT', 'dev')
    vi.stubEnv('DIAGNOSTIC_TEST_VALUE', 'must-not-be-displayed')
    const response = await server.inject('/dev/environment?ENVIRONMENT=prod')
    const $ = cheerio.load(response.payload)

    expect($('main dd')).toHaveLength(1)
    expect($('main dd').text().trim()).toBe('dev')
    expect(response.payload).not.toContain('must-not-be-displayed')
  })
})
