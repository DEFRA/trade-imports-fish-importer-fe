import { load } from 'cheerio'
import { createServer } from '#/server/server.js'
import { notificationsClient } from '#/server/services/notifications/client.js'

vi.mock('#/server/services/notifications/client.js', () => ({
  notificationsClient: {
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  }
}))

const path = '/notification/transport-details'
const organisationId = 'test-org-north-quay-seafood'
const auth = {
  strategy: 'session',
  credentials: {
    userId: 'test-user-importer-north-quay',
    role: 'importer',
    organisationId
  }
}

function notification(id, transportMethod = 'air-freight') {
  return { id, reference: 'GBN-FIS-26-AXN04', organisationId, transportMethod }
}

function receiveCookies(jar, response) {
  for (const cookie of response.headers['set-cookie'] ?? []) {
    const pair = cookie.split(';')[0]
    const separator = pair.indexOf('=')
    jar[pair.slice(0, separator)] = pair.slice(separator + 1)
  }
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

describe('transport details routes', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  beforeEach(() => {
    vi.resetAllMocks()
    notificationsClient.find.mockResolvedValue(null)
    notificationsClient.create.mockImplementation(
      async (_request, id, payload) => notification(id, payload.transportMethod)
    )
    notificationsClient.update.mockImplementation(
      async (_request, id, payload) => notification(id, payload.transportMethod)
    )
  })

  async function visit() {
    const jar = {}
    const guidance = await server.inject({
      url: '/notification/guidance',
      auth
    })
    receiveCookies(jar, guidance)
    const $ = load(guidance.payload)
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(jar) },
      payload: {
        crumb: $('form input[name="crumb"]').val(),
        journeyId: $('form input[name="journeyId"]').val()
      }
    })
    receiveCookies(jar, started)
    const response = await server.inject({
      url: started.headers.location,
      auth,
      headers: { cookie: cookieHeader(jar) }
    })
    receiveCookies(jar, response)
    return {
      response,
      jar,
      crumb: load(response.payload)('form input[name="crumb"]').val(),
      journeyId: load(response.payload)('form input[name="journeyId"]').val()
    }
  }

  async function submit(journey, transportMethod) {
    const response = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        transportMethod,
        crumb: journey.crumb,
        journeyId: journey.journeyId
      }
    })
    receiveCookies(journey.jar, response)
    return response
  }

  test('visiting Transport details without starting returns to guidance', async () => {
    const response = await server.inject({ url: path, auth })
    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('/notification/guidance')
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('renders screenshot main content with no initial selection or backend draft', async () => {
    const { response } = await visit()
    const $ = load(response.payload)
    expect(response.statusCode).toBe(200)
    expect($('.govuk-caption-l').text()).toBe('Import notification')
    expect($('h1').text()).toBe('Transport details')
    expect($('legend').text().trim()).toBe(
      'How is the consignment being transported?'
    )
    expect($('form input[type="radio"]')).toHaveLength(3)
    expect($('form input:checked')).toHaveLength(0)
    expect(
      $('.govuk-radios__label')
        .map((_i, element) => $(element).text().trim())
        .get()
    ).toEqual(['Ship or vessel', 'Air freight', 'Road vehicle'])
    expect($('.govuk-form-group').next('p').text().trim()).toBe(
      "We'll use the documents you upload to get your transport details."
    )
    expect($('main form button').text().trim()).toBe('Save and continue')
    expect($('.govuk-back-link').attr('href')).toBe('/notification/guidance')
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test.each(['ship-or-vessel', 'air-freight', 'road-vehicle'])(
    'saves %s, then redirects to the intentionally missing next page',
    async (transportMethod) => {
      const response = await submit(await visit(), transportMethod)
      expect(response.statusCode).toBe(303)
      expect(response.headers.location).toBe(
        '/notification/consignment-arrival-details'
      )
      expect(notificationsClient.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^[a-f0-9-]{36}$/),
        { organisationId, transportMethod }
      )
      expect(
        (await server.inject({ url: response.headers.location, auth }))
          .statusCode
      ).toBe(404)
    }
  )

  test.each([undefined, '', 'train', ['air-freight', 'road-vehicle']])(
    'invalid selection %j renders accessible errors without persistence',
    async (transportMethod) => {
      const response = await submit(await visit(), transportMethod)
      const $ = load(response.payload)
      expect(response.statusCode).toBe(400)
      expect($('title').text().trim()).toMatch(/^Error: Transport details/)
      expect($('.govuk-error-summary a').attr('href')).toBe('#transportMethod')
      expect($('.govuk-error-message').text()).toContain(
        'Select how the consignment is being transported'
      )
      expect(
        $('#transportMethod').attr('aria-describedby') ??
          $('fieldset').attr('aria-describedby')
      ).toContain('transportMethod-error')
      expect(notificationsClient.create).not.toHaveBeenCalled()
      expect(notificationsClient.update).not.toHaveBeenCalled()
    }
  )

  test('returning selects saved choice, changing and repeating saves update the same draft', async () => {
    const journey = await visit()
    await submit(journey, 'air-freight')
    const id = notificationsClient.create.mock.calls[0][1]
    notificationsClient.find.mockResolvedValue(notification(id))
    const returned = await server.inject({
      method: 'GET',
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(load(returned.payload)('input:checked').val()).toBe('air-freight')
    await submit(journey, 'road-vehicle')
    notificationsClient.find.mockResolvedValue(notification(id, 'road-vehicle'))
    await submit(journey, 'road-vehicle')
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
    expect(notificationsClient.update).toHaveBeenCalledTimes(2)
    expect(
      notificationsClient.update.mock.calls.map((call) => call[1])
    ).toEqual([id, id])
  })

  test('Start now begins a distinct notification after saving transport details', async () => {
    const journey = await visit()
    await submit(journey, 'air-freight')
    const firstId = notificationsClient.create.mock.calls[0][1]
    notificationsClient.find.mockImplementation(async (_request, id) =>
      id === firstId ? notification(firstId) : null
    )

    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const startForm = $('main form:has(button.govuk-button--start)')
    expect(startForm.attr('method')).toBe('post')

    const started = await server.inject({
      method: 'POST',
      url: startForm.attr('action'),
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: startForm.find('input[name="crumb"]').val(),
        journeyId: startForm.find('input[name="journeyId"]').val()
      }
    })
    receiveCookies(journey.jar, started)
    expect(started.statusCode).toBe(303)
    const transport = await server.inject({
      url: started.headers.location,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(load(transport.payload)('input:checked')).toHaveLength(0)
    journey.crumb = load(transport.payload)('form input[name="crumb"]').val()
    journey.journeyId = load(transport.payload)(
      'form input[name="journeyId"]'
    ).val()
    await submit(journey, 'road-vehicle')
    expect(notificationsClient.create).toHaveBeenCalledTimes(2)
    expect(notificationsClient.create.mock.calls[1][1]).not.toBe(firstId)
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('saving a superseded tab redirects without writing its selection', async () => {
    const journey = await visit()
    const firstId = load(journey.response.payload)(
      'form input[name="journeyId"]'
    ).val()
    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: $('form input[name="crumb"]').val(),
        journeyId: $('form input[name="journeyId"]').val()
      }
    })
    receiveCookies(journey.jar, started)

    const stale = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: journey.crumb,
        journeyId: firstId,
        transportMethod: 'air-freight'
      }
    })
    expect(stale.statusCode).toBe(303)
    expect(stale.headers.location).toBe(path)
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('an invalid form from a superseded tab cannot rebind to the current journey', async () => {
    const journey = await visit()
    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: $('form input[name="crumb"]').val(),
        journeyId: $('form input[name="journeyId"]').val()
      }
    })
    receiveCookies(journey.jar, started)

    const stale = await submit(journey, '')
    expect(stale.statusCode).toBe(303)
    expect(stale.headers.location).toBe(path)
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('a delayed retry of an old Start cannot revive a superseded journey', async () => {
    const journey = await visit()
    const previousId = journey.journeyId
    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const currentId = $('form input[name="journeyId"]').val()
    const startPayload = {
      crumb: $('form input[name="crumb"]').val(),
      journeyId: currentId
    }
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: startPayload
    })
    receiveCookies(journey.jar, started)
    const retried = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: { ...startPayload, journeyId: previousId }
    })
    receiveCookies(journey.jar, retried)
    const transport = await server.inject({
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(load(transport.payload)('form input[name="journeyId"]').val()).toBe(
      currentId
    )
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('a slow load cannot restore a journey superseded by Start now', async () => {
    const journey = await visit()
    let beginFind
    let releaseFind
    const findStarted = new Promise((resolve) => {
      beginFind = resolve
    })
    const findCanFinish = new Promise((resolve) => {
      releaseFind = resolve
    })
    notificationsClient.find.mockImplementation(async (_request, id) => {
      if (id !== journey.journeyId) {
        return null
      }
      beginFind()
      await findCanFinish
      return notification(id)
    })
    const loading = server.inject({
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    await findStarted

    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const nextId = $('form input[name="journeyId"]').val()
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: $('form input[name="crumb"]').val(),
        journeyId: nextId
      }
    })
    receiveCookies(journey.jar, started)
    releaseFind()
    await loading

    const current = await server.inject({
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(load(current.payload)('form input[name="journeyId"]').val()).toBe(
      nextId
    )
  })

  test('a slow save cannot restore a journey superseded by Start now', async () => {
    const journey = await visit()
    let beginCreate
    let releaseCreate
    const createStarted = new Promise((resolve) => {
      beginCreate = resolve
    })
    const createCanFinish = new Promise((resolve) => {
      releaseCreate = resolve
    })
    notificationsClient.create.mockImplementationOnce(
      async (_request, id, payload) => {
        beginCreate()
        await createCanFinish
        return notification(id, payload.transportMethod)
      }
    )
    const saving = submit(journey, 'air-freight')
    await createStarted

    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const nextId = $('form input[name="journeyId"]').val()
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: $('form input[name="crumb"]').val(),
        journeyId: nextId
      }
    })
    receiveCookies(journey.jar, started)
    releaseCreate()
    await saving

    const current = await server.inject({
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(load(current.payload)('form input[name="journeyId"]').val()).toBe(
      nextId
    )
    expect(load(current.payload)('input:checked')).toHaveLength(0)
  })

  test('backend failures do not redirect, and retry recovers an already committed draft', async () => {
    const journey = await visit()
    notificationsClient.create.mockRejectedValueOnce(
      new Error('Lost backend response')
    )
    const failed = await submit(journey, 'air-freight')
    expect(failed.statusCode).toBe(500)
    expect(failed.headers.location).toBeUndefined()
    const id = notificationsClient.create.mock.calls[0][1]
    notificationsClient.find.mockResolvedValue(notification(id))
    expect((await submit(journey, 'road-vehicle')).statusCode).toBe(303)
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
    expect(notificationsClient.update).toHaveBeenCalledWith(
      expect.anything(),
      id,
      { organisationId, transportMethod: 'road-vehicle' }
    )
  })

  test('separate browser sessions do not share draft identities', async () => {
    await submit(await visit(), 'air-freight')
    await submit(await visit(), 'air-freight')
    expect(notificationsClient.create.mock.calls[0][1]).not.toBe(
      notificationsClient.create.mock.calls[1][1]
    )
  })

  test('rejects missing CSRF tokens before persistence', async () => {
    const journey = await visit()
    const response = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: { transportMethod: 'air-freight' }
    })
    expect(response.statusCode).toBe(403)
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('valid CSRF without the journey session asks the user to start again', async () => {
    const journey = await visit()
    const response = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: `crumb=${journey.jar.crumb}` },
      payload: {
        crumb: journey.crumb,
        journeyId: journey.journeyId,
        transportMethod: 'air-freight'
      }
    })
    expect(response.statusCode).toBe(400)
    expect(response.payload).toContain('Your session has expired')
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })
})
