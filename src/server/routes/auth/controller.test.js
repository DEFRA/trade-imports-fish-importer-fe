import { setTimeout } from 'node:timers/promises'
import * as cheerio from 'cheerio'

import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import * as testUsers from '#/server/common/helpers/test-users.js'

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
    handler(request) {
      const { userId, organisationId, identitySource } =
        request.auth.credentials
      return { userId, organisationId, identitySource }
    }
  })
}

describe('Test user sign-in', () => {
  let server
  const originalConfig = {
    enabled: config.get('auth.testUserSignInEnabled'),
    cdpEnvironment: config.get('cdpEnvironment'),
    isProduction: config.get('isProduction'),
    serviceVersion: config.get('serviceVersion'),
    cookieSecure: config.get('session.cookie.secure')
  }
  const authCookieName = `${config.get('serviceName')}_auth`

  function localConfig() {
    config.set('auth.testUserSignInEnabled', true)
    config.set('cdpEnvironment', 'local')
    config.set('isProduction', false)
    config.set('serviceVersion', null)
    config.set('session.cookie.secure', false)
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
    config.set('auth.testUserSignInEnabled', originalConfig.enabled)
    config.set('cdpEnvironment', originalConfig.cdpEnvironment)
    config.set('isProduction', originalConfig.isProduction)
    config.set('serviceVersion', originalConfig.serviceVersion)
    config.set('session.cookie.secure', originalConfig.cookieSecure)
  })

  async function signIn(
    {
      cookies = '',
      returnTo = '/',
      testUserId = 'test-user-001',
      payload = {}
    } = {},
    instance = server
  ) {
    const page = await instance.inject({
      method: 'GET',
      url: `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
      headers: { cookie: cookies }
    })
    const $ = cheerio.load(page.payload)
    const crumb = $('main input[name="crumb"]').val()
    const response = await instance.inject({
      method: 'POST',
      url: $('main form').attr('action'),
      headers: {
        cookie: [cookies, cookieHeader(page)].filter(Boolean).join('; ')
      },
      payload: { crumb, testUserId, ...payload }
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

  test.each(['/cookies', '/health'])(
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

  test.each(['/', '/about'])(
    'requires sign-in for %s and returns to the requested page afterwards',
    async (path) => {
      const url = `${path}?step=1`
      const response = await server.inject(url)

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe(
        `/auth/sign-in?returnTo=${encodeURIComponent(url)}`
      )

      const login = await signIn({ returnTo: url })
      expect(login.response.statusCode).toBe(303)
      expect(login.response.headers.location).toBe(url)

      const page = await server.inject({
        url: login.response.headers.location,
        headers: { cookie: login.cookies }
      })
      expect(page.statusCode).toBe(200)
    }
  )

  test('keeps favicon and asset requests public before sign-in', async () => {
    const favicon = await server.inject('/favicon.ico')
    expect(favicon.statusCode).toBe(204)

    const missingAsset = await server.inject(
      `${config.get('assetPath')}/missing-asset.css`
    )
    expect(missingAsset.statusCode).toBe(404)
    expect(missingAsset.headers.location).toBeUndefined()
  })

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
    expect($('main h1').text()).toBe('Test user sign-in')
    expect($('main form').attr('method')).toBe('post')
    expect($('main input[name="crumb"]').val()).toBeTruthy()
    expect($('main fieldset legend').text().trim()).toBe('Choose a test user')
    const radios = $('main input[type="radio"][name="testUserId"]')
    expect(radios.map((_, element) => $(element).val()).get()).toEqual([
      'test-user-001',
      'test-user-002',
      'test-user-003'
    ])
    expect(radios.filter('[checked]')).toHaveLength(0)
    expect(
      radios
        .map((_, element) => {
          const radio = $(element)
          const label = $(`label[for="${radio.attr('id')}"]`)
            .text()
            .trim()
          const hint = $(`#${radio.attr('aria-describedby')}`)
            .text()
            .trim()
          return [label, hint]
        })
        .get()
    ).toEqual([
      'Importer Oak',
      'Example Harbour Imports',
      'Importer Sycamore',
      'Example Harbour Imports',
      'Importer Elm',
      'Example Coastal Imports'
    ])
    expect($('main button').text().trim()).toBe('Continue')
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

  test.each([
    ['test-user-001', 'test-org-001'],
    ['test-user-002', 'test-org-001'],
    ['test-user-003', 'test-org-002']
  ])(
    'stores selected user %s server-side and only a reference in the cookie',
    async (testUserId, organisationId) => {
      const login = await signIn({ testUserId, returnTo: '/dev/identity' })

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
        userId: testUserId,
        organisationId,
        identitySource: 'test-user'
      })
    }
  )

  test('verification displays cached labels rather than current catalogue or query inputs', async () => {
    const login = await signIn()
    const id = await sessionId(login.cookies)
    const identity = await server.app.authCache.get(id)
    await server.app.authCache.set(id, {
      ...identity,
      name: 'Previous test user label',
      organisationName: 'Previous test organisation label'
    })

    const response = await server.inject({
      url: '/dev/identity?organisationId=browser-supplied-org',
      headers: { cookie: login.cookies }
    })
    const $ = cheerio.load(response.payload)
    const values = $('main dd')
      .map((_, element) => $(element).text().trim())
      .get()

    expect(response.statusCode).toBe(200)
    expect($('main h1').text()).toBe('Test user sign-in identity')
    expect(values).toEqual([
      'test-user-001',
      'Previous test user label',
      'Previous test organisation label',
      'test-org-001',
      'test-user'
    ])
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.payload).not.toContain(id)
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

  test.each([
    'userId',
    'name',
    'organisationId',
    'organisationName',
    'identitySource'
  ])(
    'rejects browser-supplied %s rather than overriding the selected identity',
    async (field) => {
      const login = await signIn({ payload: { [field]: 'browser-supplied' } })
      expect(login.response.statusCode).toBe(400)
      expect(cookieHeader(login.response)).not.toContain(`${authCookieName}=`)

      const response = await server.inject(
        '/auth/sign-in?organisationId=another-org'
      )
      expect(response.statusCode).toBe(400)
    }
  )

  test.each([undefined, '', 'test-user-999'])(
    'shows accessible validation without changing the current session for selection %j',
    async (testUserId) => {
      const current = await signIn()
      const id = await sessionId(current.cookies)
      const set = vi.spyOn(server.app.authCache, 'set')
      const drop = vi.spyOn(server.app.authCache, 'drop')
      const invalid = await signIn({
        cookies: current.cookies,
        returnTo: '/about?step=1',
        payload: { testUserId }
      })
      const response = invalid.response
      const $ = cheerio.load(response.payload)
      const summaryLink = $('main .govuk-error-summary a')
      const fieldset = $('main fieldset')

      expect(response.statusCode).toBe(400)
      expect(response.headers['cache-control']).toBe('no-store')
      expect($('title').text().trim()).toMatch(/^Error: Test user sign-in/)
      expect($('main h1').text()).toBe('Test user sign-in')
      expect(summaryLink.text()).toBe('Select a test user')
      expect(summaryLink.attr('href')).toBe('#testUserId')
      expect($(summaryLink.attr('href')).is('input[type="radio"]')).toBe(true)
      expect(fieldset.attr('aria-describedby')).toBe('testUserId-error')
      expect($('#testUserId-error').text()).toContain('Select a test user')
      expect($('main input[type="radio"]:checked')).toHaveLength(0)
      expect($('main input[name="crumb"]').val()).toBeTruthy()
      expect($('main form').attr('action')).toBe(
        '/auth/sign-in?returnTo=%2Fabout%3Fstep%3D1'
      )
      expect(set).not.toHaveBeenCalled()
      expect(drop).not.toHaveBeenCalled()
      expect(await server.app.authCache.get(id)).not.toBeNull()
      expect(cookieHeader(response)).not.toContain(`${authCookieName}=`)
    }
  )

  test('does not re-render an unsafe return destination when the selection is also invalid', async () => {
    const login = await signIn()
    const response = await server.inject({
      method: 'POST',
      url: '/auth/sign-in?returnTo=https%3A%2F%2Fexample.com',
      headers: { cookie: login.cookies },
      payload: { crumb: login.crumb, testUserId: 'unknown-user' }
    })

    expect(response.statusCode).toBe(400)
    expect(response.headers.location).toBeUndefined()
    expect(response.payload).not.toContain('example.com')
    expect(response.payload).not.toContain('govuk-radios')
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
        payload: { crumb, testUserId: 'test-user-001' }
      })

      expect(response.statusCode).toBe(403)
      expect(set).not.toHaveBeenCalled()
    }
  )

  test('re-sign-in renews the reference and invalidates the previous session', async () => {
    const first = await signIn()
    const second = await signIn({
      cookies: first.cookies,
      testUserId: 'test-user-003'
    })
    const firstId = await sessionId(first.cookies)
    const secondId = await sessionId(second.cookies)

    expect(second.response.statusCode).toBe(303)
    expect(secondId).not.toBe(firstId)
    expect(await server.app.authCache.get(firstId)).toBeNull()
    expect(await server.app.authCache.get(secondId)).toMatchObject({
      userId: 'test-user-003',
      organisationId: 'test-org-002'
    })
    const replay = await server.inject({
      url: '/dev/identity',
      headers: { cookie: first.cookies }
    })
    expect(replay.statusCode).toBe(302)
  })

  test('signing out one browser does not affect a different user in another browser', async () => {
    const first = await signIn()
    const second = await signIn({ testUserId: 'test-user-003' })
    expect(await sessionId(first.cookies)).not.toBe(
      await sessionId(second.cookies)
    )

    const logout = await server.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: { cookie: first.cookies },
      payload: { crumb: first.crumb }
    })
    expect(logout.statusCode).toBe(303)
    const active = await server.inject({
      url: '/test/protected',
      headers: { cookie: second.cookies }
    })
    expect(active.statusCode).toBe(200)
    expect(active.result).toMatchObject({
      userId: 'test-user-003',
      organisationId: 'test-org-002'
    })
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

    for (const url of ['/', '/about', '/dev/identity']) {
      const replay = await server.inject({
        url,
        headers: { cookie: login.cookies }
      })
      expect(replay.statusCode).toBe(302)
      expect(replay.headers.location).toBe(
        `/auth/sign-in?returnTo=${encodeURIComponent(url)}`
      )
    }
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

  test.each([
    [
      'legacy single-user identity',
      { userId: 'stub-user-1', organisationId: 'stub-org-1' }
    ],
    ['removed user', { userId: 'removed-user' }],
    ['missing organisation', { organisationId: '' }],
    ['changed organisation assignment', { organisationId: 'test-org-002' }]
  ])(
    'invalidates a cached %s without reassigning it',
    async (_description, changes) => {
      const login = await signIn()
      const id = await sessionId(login.cookies)
      const identity = await server.app.authCache.get(id)
      await server.app.authCache.set(id, { ...identity, ...changes })

      const response = await server.inject({
        url: '/dev/identity',
        headers: { cookie: login.cookies }
      })

      expect(response.statusCode).toBe(302)
      expect(await server.app.authCache.get(id)).toBeNull()
      expect(
        response.headers['set-cookie'].some((cookie) =>
          cookie.startsWith(`${authCookieName}=;`)
        )
      ).toBe(true)
      const post = await server.inject({
        method: 'POST',
        url: '/test/protected',
        headers: { cookie: login.cookies },
        payload: {}
      })
      expect(post.statusCode).toBe(401)
      expect(post.headers.location).toBeUndefined()
    }
  )

  test('disabling test user sign-in also rejects existing test user sessions', async () => {
    const login = await signIn()
    config.set('auth.testUserSignInEnabled', false)

    const response = await server.inject({
      url: '/test/protected',
      headers: { cookie: login.cookies }
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers.location).toBeUndefined()
  })

  test.each(['local', 'dev', 'test', 'prod', null])(
    'disabled mode keeps routes closed in environment %s',
    async (environment) => {
      config.set('auth.testUserSignInEnabled', false)
      config.set('cdpEnvironment', environment)
      config.set('isProduction', true)
      config.set('serviceVersion', '1.0.0')
      const disabled = await createServer()
      addProtectedRoute(disabled)
      await disabled.initialize()

      try {
        expect((await disabled.inject('/health')).statusCode).toBe(200)
        for (const url of [
          '/auth/sign-in',
          '/auth/sign-out',
          '/dev/identity'
        ]) {
          expect((await disabled.inject(url)).statusCode).toBe(404)
        }
        for (const url of ['/', '/about', '/test/protected']) {
          const response = await disabled.inject(url)
          expect(response.statusCode).toBe(401)
          expect(response.headers.location).toBeUndefined()
        }
      } finally {
        await disabled.stop({ timeout: 0 })
      }
    }
  )

  test.each(['dev', 'test'])(
    'allows sign-in and sign-out in %s with production runtime settings and a service version',
    async (environment) => {
      config.set('cdpEnvironment', environment)
      config.set('isProduction', true)
      config.set('serviceVersion', '1.0.0')
      config.set('session.cookie.secure', true)
      const deployed = await createServer()
      await deployed.initialize()

      try {
        const login = await signIn(
          {
            returnTo: '/dev/identity',
            testUserId: 'test-user-003'
          },
          deployed
        )
        expect(login.response.statusCode).toBe(303)
        expect(login.response.headers.location).toBe('/dev/identity')
        const cookie = login.response.headers['set-cookie'].find((value) =>
          value.startsWith(`${authCookieName}=`)
        )
        expect(cookie).toContain('; Secure')
        expect(cookie).toContain('; HttpOnly')
        expect(cookie).toContain('SameSite=Strict')

        const response = await deployed.inject({
          url: '/dev/identity',
          headers: { cookie: login.cookies }
        })
        expect(response.statusCode).toBe(200)
        const $ = cheerio.load(response.payload)
        expect(
          $('main dd')
            .map((_, element) => $(element).text().trim())
            .get()
        ).toEqual([
          'test-user-003',
          'Importer Elm',
          'Example Coastal Imports',
          'test-org-002',
          'test-user'
        ])

        const logout = await deployed.inject({
          method: 'POST',
          url: '/auth/sign-out',
          headers: { cookie: login.cookies },
          payload: { crumb: login.crumb }
        })
        expect(logout.statusCode).toBe(303)
        const replay = await deployed.inject({
          url: '/dev/identity',
          headers: { cookie: login.cookies }
        })
        expect(replay.statusCode).toBe(302)
      } finally {
        await deployed.stop({ timeout: 0 })
      }
    }
  )

  test.each(['prod', null, '', 'development', 'perf-test'])(
    'rejects enabled test user sign-in in environment %j even in local runtime mode',
    async (environment) => {
      config.set('cdpEnvironment', environment)
      await expect(createServer()).rejects.toThrow(
        'Test user sign-in requires ENVIRONMENT to be local, dev or test'
      )
    }
  )

  test('rejects startup when the enabled test user catalogue is invalid', async () => {
    vi.spyOn(testUsers, 'getTestUsers').mockImplementationOnce(() => {
      throw new Error('Invalid test user catalogue')
    })
    await expect(createServer()).rejects.toThrow('Invalid test user catalogue')
  })

  test('announces the test user identity-provider bypass during startup', async () => {
    const instance = await createServer()
    const warn = vi.spyOn(instance.logger, 'warn')

    try {
      await instance.initialize()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Test user sign-in is enabled: no identity provider is contacted.'
        )
      )
    } finally {
      await instance.stop({ timeout: 0 })
    }
  })
})
