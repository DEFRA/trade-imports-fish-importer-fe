import { setTimeout } from 'node:timers/promises'
import * as cheerio from 'cheerio'

import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'

function cookieHeader(...responses) {
  const cookies = new Map()
  for (const response of responses) {
    for (const cookie of response.headers['set-cookie'] ?? []) {
      const pair = cookie.split(';')[0]
      cookies.set(pair.slice(0, pair.indexOf('=')), pair)
    }
  }
  return [...cookies.values()].join('; ')
}

function addProtectedRoute(server) {
  server.route({
    method: ['GET', 'POST'],
    path: '/test/protected',
    options: { auth: 'session' },
    handler(request) {
      const { userId, organisationId, identitySource } =
        request.auth.credentials
      return { userId, organisationId, identitySource }
    }
  })
}

describe('Temporary authentication', () => {
  let server
  const originalConfig = {
    enabled: config.get('auth.temporarySignInEnabled'),
    organisationId: config.get('auth.testOrganisationId'),
    isProduction: config.get('isProduction'),
    serviceVersion: config.get('serviceVersion')
  }
  const authCookieName = `${config.get('serviceName')}_auth`

  function localConfig() {
    config.set('auth.temporarySignInEnabled', true)
    config.set('auth.testOrganisationId', 'stub-org-1')
    config.set('isProduction', false)
    config.set('serviceVersion', null)
  }

  beforeAll(async () => {
    localConfig()
    server = await createServer()
    addProtectedRoute(server)
    await server.initialize()
  })

  beforeEach(localConfig)

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await server?.stop({ timeout: 0 })
    config.set('auth.temporarySignInEnabled', originalConfig.enabled)
    config.set('auth.testOrganisationId', originalConfig.organisationId)
    config.set('isProduction', originalConfig.isProduction)
    config.set('serviceVersion', originalConfig.serviceVersion)
  })

  async function signIn({ cookies = '', returnTo = '/', payload = {} } = {}) {
    const page = await server.inject({
      method: 'GET',
      url: `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
      headers: { cookie: cookies }
    })
    const $ = cheerio.load(page.payload)
    const crumb = $('main input[name="crumb"]').val()
    const response = await server.inject({
      method: 'POST',
      url: $('main form').attr('action'),
      headers: {
        cookie: [cookies, cookieHeader(page)].filter(Boolean).join('; ')
      },
      payload: { crumb, ...payload }
    })

    return {
      page,
      response,
      crumb,
      cookies: cookieHeader(page, response)
    }
  }

  async function sessionId(cookies) {
    const { states } = await server.states.parse(cookies)
    return states[authCookieName].sessionId
  }

  test.each(['/', '/notification/guidance', '/cookies', '/health'])(
    'keeps %s public without creating a login or Yar session',
    async (url) => {
      const response = await server.inject(url)

      expect(response.statusCode).toBe(200)
      const cookies = response.headers['set-cookie'] ?? []
      expect(
        cookies.some((cookie) => cookie.startsWith(`${authCookieName}=`))
      ).toBe(false)
      expect(
        cookies.some((cookie) =>
          cookie.startsWith(`${config.get('session.cache.name')}=`)
        )
      ).toBe(false)
    }
  )

  test('redirects protected GETs to sign-in while preserving the internal destination', async () => {
    const response = await server.inject('/test/protected?step=1')

    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe(
      '/auth/sign-in?returnTo=%2Ftest%2Fprotected%3Fstep%3D1'
    )
  })

  test('denies protected POSTs without redirecting or running the handler', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/test/protected',
      payload: {}
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers.location).toBeUndefined()
  })

  test('GET sign-in displays a form but does not establish an identity', async () => {
    const response = await server.inject('/auth/sign-in')
    const $ = cheerio.load(response.payload)
    const cacheSet = vi.spyOn(server.app.authCache, 'set')

    expect(response.statusCode).toBe(200)
    expect($('main form').attr('method')).toBe('post')
    expect($('main input[name="crumb"]').val()).toBeTruthy()
    expect($('main').text()).toContain('does not verify your identity')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(cookieHeader(response)).not.toContain(`${authCookieName}=`)

    const identity = await server.inject({
      url: '/dev/identity',
      headers: { cookie: cookieHeader(response) }
    })
    expect(identity.statusCode).toBe(302)
    expect(cacheSet).not.toHaveBeenCalled()
  })

  test('stores identity server-side and puts only a reference in the protected cookie', async () => {
    config.set('auth.testOrganisationId', 'configured-test-org')
    const login = await signIn({ returnTo: '/dev/identity' })

    expect(login.response.statusCode).toBe(303)
    expect(login.response.headers.location).toBe('/dev/identity')

    const { states } = await server.states.parse(login.cookies)
    expect(states[authCookieName]).toEqual({ sessionId: expect.any(String) })
    const authCookie = login.response.headers['set-cookie'].find((cookie) =>
      cookie.startsWith(`${authCookieName}=`)
    )
    expect(authCookie).toContain('HttpOnly')
    expect(authCookie).toContain('SameSite=Strict')

    const identity = await server.inject({
      url: '/test/protected',
      headers: { cookie: login.cookies }
    })
    expect(identity.statusCode).toBe(200)
    expect(identity.result).toEqual({
      userId: 'stub-user-1',
      organisationId: 'configured-test-org',
      identitySource: 'temporary'
    })
  })

  test('verification displays the actual session rather than current configuration or query inputs', async () => {
    const login = await signIn()
    const id = await sessionId(login.cookies)
    config.set('auth.testOrganisationId', 'a-different-configured-org')

    const response = await server.inject({
      url: '/dev/identity?organisationId=browser-supplied-org',
      headers: { cookie: login.cookies }
    })
    const $ = cheerio.load(response.payload)
    const values = $('main dd')
      .map((_, element) => $(element).text().trim())
      .get()

    expect(response.statusCode).toBe(200)
    expect(values).toEqual([
      'stub-user-1',
      'Stub User',
      'stub-org-1',
      'temporary'
    ])
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.payload).not.toContain(id)
    expect(response.payload).not.toContain('a-different-configured-org')
    expect($('main').text()).not.toContain('browser-supplied-org')
    expect($('main form').attr('action')).toBe('/auth/sign-out')
    expect($('main form').attr('method')).toBe('post')
  })

  test.each([
    'https://example.com',
    '//example.com',
    '/\\example.com',
    '/\t/example.com'
  ])('rejects unsafe return destinations: %j', async (returnTo) => {
    const response = await server.inject(
      `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    )
    expect(response.statusCode).toBe(400)
    expect(response.headers.location).toBeUndefined()
  })

  test('rejects browser-supplied identity fields', async () => {
    const login = await signIn({ payload: { organisationId: 'another-org' } })
    expect(login.response.statusCode).toBe(400)
    expect(cookieHeader(login.response)).not.toContain(`${authCookieName}=`)

    const response = await server.inject(
      '/auth/sign-in?organisationId=another-org'
    )
    expect(response.statusCode).toBe(400)
  })

  test.each([undefined, 'invalid-token'])(
    'requires a valid CSRF token for sign-in: %s',
    async (crumb) => {
      const page = await server.inject('/auth/sign-in')
      const set = vi.spyOn(server.app.authCache, 'set')
      const response = await server.inject({
        method: 'POST',
        url: '/auth/sign-in',
        headers: { cookie: cookieHeader(page) },
        payload: crumb === undefined ? {} : { crumb }
      })

      expect(response.statusCode).toBe(403)
      expect(set).not.toHaveBeenCalled()
    }
  )

  test('re-sign-in renews the reference and invalidates the previous session', async () => {
    const first = await signIn()
    const second = await signIn({ cookies: first.cookies })
    const firstId = await sessionId(first.cookies)
    const secondId = await sessionId(second.cookies)

    expect(second.response.statusCode).toBe(303)
    expect(secondId).not.toBe(firstId)
    expect(await server.app.authCache.get(firstId)).toBeNull()
    expect(await server.app.authCache.get(secondId)).toMatchObject({
      organisationId: 'stub-org-1'
    })
    const replay = await server.inject({
      url: '/dev/identity',
      headers: { cookie: first.cookies }
    })
    expect(replay.statusCode).toBe(302)
  })

  test.each([undefined, 'invalid-token'])(
    'requires a valid CSRF token for sign-out: %s',
    async (crumb) => {
      const login = await signIn()
      const id = await sessionId(login.cookies)
      const response = await server.inject({
        method: 'POST',
        url: '/auth/sign-out',
        headers: { cookie: login.cookies },
        payload: crumb === undefined ? {} : { crumb }
      })

      expect(response.statusCode).toBe(403)
      expect(await server.app.authCache.get(id)).not.toBeNull()
    }
  )

  test('sign-out removes the cached identity, clears the cookie and prevents replay', async () => {
    const login = await signIn()
    const id = await sessionId(login.cookies)
    const response = await server.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: { cookie: login.cookies },
      payload: { crumb: login.crumb }
    })

    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('/')
    expect(await server.app.authCache.get(id)).toBeNull()
    expect(
      response.headers['set-cookie'].some((cookie) =>
        cookie.startsWith(`${authCookieName}=;`)
      )
    ).toBe(true)

    const replay = await server.inject({
      url: '/dev/identity',
      headers: { cookie: login.cookies }
    })
    expect(replay.statusCode).toBe(302)
  })

  test('opening a sign-out URL does not end a session', async () => {
    const login = await signIn()
    const response = await server.inject({
      url: '/auth/sign-out',
      headers: { cookie: login.cookies }
    })

    expect(response.statusCode).toBe(404)
    expect(
      await server.app.authCache.get(await sessionId(login.cookies))
    ).not.toBeNull()
  })

  test('expired cache entries cannot authenticate a browser', async () => {
    const login = await signIn()
    const id = await sessionId(login.cookies)
    const identity = await server.app.authCache.get(id)
    await server.app.authCache.set(id, identity, 1)
    await setTimeout(10)

    const response = await server.inject({
      url: '/dev/identity',
      headers: { cookie: login.cookies }
    })
    expect(response.statusCode).toBe(302)
    expect(await server.app.authCache.get(id)).toBeNull()
  })

  test('rejects cached identities without an organisation', async () => {
    const login = await signIn()
    const id = await sessionId(login.cookies)
    const identity = await server.app.authCache.get(id)
    await server.app.authCache.set(id, { ...identity, organisationId: '' })

    const response = await server.inject({
      url: '/dev/identity',
      headers: { cookie: login.cookies }
    })

    expect(response.statusCode).toBe(302)
    expect(await server.app.authCache.get(id)).toBeNull()
  })

  test('disabling temporary authentication also rejects existing temporary sessions', async () => {
    const login = await signIn()
    config.set('auth.temporarySignInEnabled', false)

    const response = await server.inject({
      url: '/test/protected',
      headers: { cookie: login.cookies }
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers.location).toBeUndefined()
  })

  test('disabled mode registers no temporary routes and keeps protected routes closed', async () => {
    config.set('auth.temporarySignInEnabled', false)
    const disabled = await createServer()
    addProtectedRoute(disabled)
    await disabled.initialize()

    try {
      for (const url of ['/auth/sign-in', '/auth/sign-out', '/dev/identity']) {
        expect((await disabled.inject(url)).statusCode).toBe(404)
      }
      const response = await disabled.inject('/test/protected')
      expect(response.statusCode).toBe(401)
      expect(response.headers.location).toBeUndefined()
    } finally {
      await disabled.stop({ timeout: 0 })
    }
  })

  test.each([
    ['isProduction', true],
    ['serviceVersion', '1.0.0']
  ])('blocks deployed enablement when %s is %s', async (key, value) => {
    config.set(key, value)
    await expect(createServer()).rejects.toThrow(
      'Temporary sign-in is local-only'
    )
  })

  test.each(['', '   ', ' padded-id '])(
    'rejects invalid configured organisation IDs: %j',
    async (id) => {
      config.set('auth.testOrganisationId', id)
      await expect(createServer()).rejects.toThrow('TEST_ORGANISATION_ID')
    }
  )

  test('announces the temporary identity-provider bypass during startup', async () => {
    const instance = await createServer()
    const warn = vi.spyOn(instance.logger, 'warn')

    try {
      await instance.initialize()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Temporary sign-in is enabled: no identity provider is contacted.'
        )
      )
    } finally {
      await instance.stop({ timeout: 0 })
    }
  })
})
