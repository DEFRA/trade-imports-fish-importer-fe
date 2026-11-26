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

function notification(id, mode = 'AIR_FREIGHT') {
  const transportMethodMap = {
    VESSEL: 'ship-or-vessel',
    AIR_FREIGHT: 'air-freight',
    ROAD_VEHICLE: 'road-vehicle'
  }
  return {
    id,
    reference: 'GBN-FIS-26-AXN04',
    organisationId,
    notification: { transport: { mode } },
    transportMethod: transportMethodMap[mode],
    commodities: null
  }
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
  let drafts

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  beforeEach(() => {
    vi.resetAllMocks()
    drafts = new Map()
    notificationsClient.find.mockImplementation(
      async (_request, id) => drafts.get(id) ?? null
    )
    notificationsClient.create.mockImplementation(
      async (_request, id, payload) => {
        const saved = notification(id, payload.notification.transport.mode)
        drafts.set(id, saved)
        return saved
      }
    )
    notificationsClient.update.mockImplementation(
      async (_request, id, payload) => {
        const existing = drafts.get(id) ?? notification(id)
        const saved = {
          ...existing,
          notification: {
            ...existing.notification,
            ...payload.notification
          }
        }
        drafts.set(id, saved)
        return saved
      }
    )
  })

  async function visit() {
    const response = await server.inject({ method: 'GET', url: path, auth })
    const jar = {}
    receiveCookies(jar, response)
    return {
      response,
      jar,
      crumb: load(response.payload)('form input[name="crumb"]').val()
    }
  }

  async function submit(journey, transportMethod) {
    const response = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: { transportMethod, crumb: journey.crumb }
    })
    receiveCookies(journey.jar, response)
    return response
  }

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
    expect(notificationsClient.find).not.toHaveBeenCalled()
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test.each([
    ['ship-or-vessel', 'VESSEL'],
    ['air-freight', 'AIR_FREIGHT'],
    ['road-vehicle', 'ROAD_VEHICLE']
  ])(
    'saves %s, then redirects to consignment details',
    async (transportMethod, mode) => {
      const journey = await visit()
      const response = await submit(journey, transportMethod)
      expect(response.statusCode).toBe(303)
      expect(response.headers.location).toBe(
        '/notification/consignment-details'
      )
      expect(notificationsClient.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^[a-f0-9-]{36}$/),
        { organisationId, notification: { transport: { mode } } }
      )
      const destination = await server.inject({
        url: response.headers.location,
        auth,
        headers: { cookie: cookieHeader(journey.jar) }
      })
      expect(destination.statusCode).toBe(200)
      expect(load(destination.payload)('h1').text()).toBe('Consignment details')
    }
  )

  test.each([
    undefined,
    '',
    'train',
    'AIR_FREIGHT',
    ['air-freight', 'road-vehicle']
  ])(
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

  test.each([
    ['VESSEL', 'ship-or-vessel'],
    ['AIR_FREIGHT', 'air-freight'],
    ['ROAD_VEHICLE', 'road-vehicle']
  ])(
    'preselects the current canonical %s mode using the existing radio value',
    async (mode, transportMethod) => {
      const journey = await visit()
      await submit(journey, 'air-freight')
      const id = notificationsClient.create.mock.calls[0][1]
      notificationsClient.find.mockResolvedValue(notification(id, mode))
      const response = await server.inject({
        method: 'GET',
        url: path,
        auth,
        headers: { cookie: cookieHeader(journey.jar) }
      })
      const $ = load(response.payload)
      expect(response.statusCode).toBe(200)
      expect($('input[type="radio"]:checked')).toHaveLength(1)
      expect($('input[type="radio"]:checked').val()).toBe(transportMethod)
      expect(
        $('input[type="radio"]')
          .map((_i, input) => $(input).val())
          .get()
      ).toEqual(['ship-or-vessel', 'air-freight', 'road-vehicle'])
    }
  )

  test('retains a valid presentation selection when another submitted field is invalid', async () => {
    const journey = await visit()
    const response = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        transportMethod: 'road-vehicle',
        unsupported: 'value',
        crumb: journey.crumb
      }
    })
    const $ = load(response.payload)
    expect(response.statusCode).toBe(400)
    expect($('input:checked').val()).toBe('road-vehicle')
    expect($('title').text().trim()).toMatch(/^Error: Transport details/)
    expect($('.govuk-error-summary a').attr('href')).toBe('#transportMethod')
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('guidance leads through transport to consignment, and returning and resaving use the same draft', async () => {
    const guidance = await server.inject({
      url: '/notification/guidance',
      auth
    })
    expect(guidance.statusCode).toBe(200)
    const jar = {}
    receiveCookies(jar, guidance)
    const start = load(guidance.payload)('a.govuk-button--start').attr('href')
    expect(start).toBe(path)
    const transport = await server.inject({
      url: start,
      auth,
      headers: { cookie: cookieHeader(jar) }
    })
    expect(transport.statusCode).toBe(200)
    receiveCookies(jar, transport)
    const journey = {
      jar,
      crumb: load(transport.payload)('form input[name="crumb"]').val()
    }
    const saved = await submit(journey, 'air-freight')
    expect(saved.statusCode).toBe(303)
    const consignment = await server.inject({
      url: saved.headers.location,
      auth,
      headers: { cookie: cookieHeader(jar) }
    })
    expect(consignment.statusCode).toBe(200)
    receiveCookies(jar, consignment)
    const back = load(consignment.payload)('.govuk-back-link').attr('href')
    expect(back).toBe(path)
    const id = notificationsClient.create.mock.calls[0][1]
    notificationsClient.find.mockResolvedValue(notification(id))
    const returned = await server.inject({
      method: 'GET',
      url: back,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(returned.statusCode).toBe(200)
    expect(load(returned.payload)('input:checked').val()).toBe('air-freight')
    expect(load(returned.payload)('.govuk-back-link').attr('href')).toBe(
      '/notification/guidance'
    )
    receiveCookies(jar, returned)
    journey.crumb = load(returned.payload)('form input[name="crumb"]').val()
    await submit(journey, 'road-vehicle')
    notificationsClient.find.mockResolvedValue(notification(id, 'ROAD_VEHICLE'))
    await submit(journey, 'road-vehicle')
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
    expect(notificationsClient.update).toHaveBeenCalledTimes(1)
    expect(
      notificationsClient.update.mock.calls.map((call) => call[1])
    ).toEqual([id])
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
      {
        organisationId,
        notification: { transport: { mode: 'ROAD_VEHICLE' } }
      }
    )
    notificationsClient.update.mockRejectedValueOnce(
      new Error('Backend unavailable')
    )
    const failedUpdate = await submit(journey, 'road-vehicle')
    expect(failedUpdate.statusCode).toBe(500)
    expect(failedUpdate.headers.location).toBeUndefined()
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
  })

  test('shows an explicit error and retains the selection when a save cannot be verified', async () => {
    const journey = await visit()
    notificationsClient.create.mockRejectedValueOnce(
      new Error('Notification API response does not match the saved details')
    )

    const response = await submit(journey, 'air-freight')
    const $ = load(response.payload)
    expect(response.statusCode).toBe(500)
    expect(response.headers.location).toBeUndefined()
    expect($('.govuk-error-summary').text()).toContain(
      'We could not confirm that your transport details were saved'
    )
    expect($('input:checked').val()).toBe('air-freight')
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
      payload: { crumb: journey.crumb, transportMethod: 'air-freight' }
    })
    expect(response.statusCode).toBe(400)
    expect(response.payload).toContain('Your session has expired')
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })
})
