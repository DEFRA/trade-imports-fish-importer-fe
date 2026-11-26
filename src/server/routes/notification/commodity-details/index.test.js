import { load } from 'cheerio'
import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { notificationsClient } from '#/server/services/notifications/client.js'

vi.mock('#/server/services/notifications/client.js', () => ({
  notificationsClient: {
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  }
}))

const auth = {
  strategy: 'session',
  credentials: {
    userId: 'test-user-importer-north-quay',
    role: 'importer',
    organisationId: 'test-org-north-quay-seafood'
  }
}

function cookieHeader(...responses) {
  const cookies = new Map()
  for (const response of responses) {
    for (const item of response.headers['set-cookie'] ?? []) {
      const cookie = item.split(';')[0]
      cookies.set(cookie.split('=')[0], cookie)
    }
  }
  return [...cookies.values()].join('; ')
}

describe('commodity details routes', () => {
  let server

  async function visitCommodityDetailsWithJourney() {
    const journey = await server.inject({
      method: 'GET',
      url: '/notification/transport-details',
      auth
    })
    const response = await server.inject({
      method: 'GET',
      url: '/notification/commodity-details',
      auth,
      headers: { cookie: cookieHeader(journey) }
    })
    return { response, cookie: cookieHeader(journey, response) }
  }

  beforeAll(async () => {
    config.set('referenceDataApiUrl', 'https://reference.example')
    config.set('commoditiesPath', '/commodities')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json([
          {
            code: '03021400',
            name: 'Fresh salmon',
            species: [{ faoCode: 'SAL', commonName: 'Atlantic salmon' }]
          }
        ])
      )
    )
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json([
          {
            code: '03021400',
            name: 'Fresh salmon',
            species: [{ faoCode: 'SAL', commonName: 'Atlantic salmon' }]
          }
        ])
      )
    )
    notificationsClient.find.mockImplementation(async (_request, id) => ({
      id,
      reference: 'GBN-FIS-26-AXN04',
      status: 'DRAFT',
      organisationId: auth.credentials.organisationId,
      transportMethod: 'road-vehicle'
    }))
    notificationsClient.update.mockImplementation(
      async (_request, id, payload) => ({
        id,
        reference: 'GBN-FIS-26-AXN04',
        status: 'DRAFT',
        organisationId: auth.credentials.organisationId,
        transportMethod: 'road-vehicle',
        ...payload
      })
    )
  })

  test('registers GET and POST routes for commodity details', () => {
    const routes = server
      .table()
      .filter((route) => route.path === '/notification/commodity-details')
    expect(routes.map((route) => route.method).sort()).toEqual(['get', 'post'])
  })

  test('redirects a fresh journey to transport details without rendering the form', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/notification/commodity-details',
      auth
    })

    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('/notification/transport-details')
    expect(load(response.payload)('[data-commodity-form]')).toHaveLength(0)
  })

  test('redirects to transport details when the journey ID has no saved draft', async () => {
    notificationsClient.find.mockResolvedValueOnce(null)

    const { response } = await visitCommodityDetailsWithJourney()

    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('/notification/transport-details')
    expect(notificationsClient.find).toHaveBeenCalledOnce()
  })

  test('shows the commodity form with the transport back link', async () => {
    const { response } = await visitCommodityDetailsWithJourney()
    const $ = load(response.payload)
    expect(response.statusCode).toBe(200)
    expect($('h1').text()).toContain('seafood')
    expect($('.govuk-back-link').attr('href')).toBe(
      '/notification/consignment-details'
    )
    expect($('.govuk-back-link').prevAll('.govuk-phase-banner')).toHaveLength(1)
    expect($('[data-commodity-form] input[name="crumb"]')).toHaveLength(1)
  })

  test('provides the commodity, species and weight controls', async () => {
    const { response } = await visitCommodityDetailsWithJourney()
    const $ = load(response.payload)
    expect($('label[for="commodityCode"]').text()).toContain('Commodity code')
    expect($('label[for="species"]').text()).toContain('Species')
    const weightLabel = $('label[for="weight"]')
    expect(weightLabel.text()).toBe('Weight in kilograms')
    expect(weightLabel.find('.govuk-visually-hidden').text()).toBe(
      ' in kilograms'
    )
    expect($('#weight + .govuk-input__suffix[aria-hidden="true"]').text()).toBe(
      'kg'
    )
    expect($('button').text()).toContain('Add commodity')
    expect($('button').text()).toContain('Save and continue')
  })

  test('provides labelled comboboxes and associated option lists', async () => {
    const { response } = await visitCommodityDetailsWithJourney()
    const $ = load(response.payload)
    for (const id of ['commodityCode', 'species']) {
      const control = $(`#${id}`)
      const list = $(`#${control.attr('aria-controls')}`)
      expect(control.attr('role')).toBe('combobox')
      expect(control.attr('aria-expanded')).toBe('false')
      expect(list.attr('role')).toBe('listbox')
      expect(list.attr('hidden')).toBeDefined()
    }
    expect($('#species').attr('type')).toBe('button')
    const toggle = $('button[aria-label="Show or hide commodity options"]')
    expect(toggle.attr('type')).toBe('button')
    expect(toggle.attr('aria-controls')).toBe('commodity-options')
  })

  test('hides the empty commodity summary until client-side rows are rendered', async () => {
    const { response } = await visitCommodityDetailsWithJourney()
    const $ = load(response.payload)
    expect($('[data-commodity-summary]').attr('hidden')).toBeDefined()
    expect($('[data-commodity-summary] [data-rows] tr')).toHaveLength(0)
  })

  test('patches committed commodities and returns success', async () => {
    const { response: visit, cookie } = await visitCommodityDetailsWithJourney()
    const crumb = load(visit.payload)(
      '[data-commodity-form] input[name="crumb"]'
    ).val()
    const commodities = [
      {
        commodityCode: '03021400',
        description: 'Fresh salmon',
        species: [
          {
            speciesCode: 'SAL',
            commonName: 'Atlantic salmon',
            netWeightKg: 500
          }
        ],
        totalNetWeightKg: 500
      }
    ]
    const response = await server.inject({
      method: 'POST',
      url: '/notification/commodity-details',
      auth,
      headers: { cookie, accept: 'application/json' },
      payload: { crumb, commodities: JSON.stringify(commodities) }
    })
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({ success: true })
    expect(notificationsClient.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^[a-f0-9-]{36}$/),
      {
        organisationId: auth.credentials.organisationId,
        notification: { commodities }
      }
    )
  })

  test('returns a conflict response without redirecting when the draft changed', async () => {
    const { response: visit, cookie } = await visitCommodityDetailsWithJourney()
    const crumb = load(visit.payload)(
      '[data-commodity-form] input[name="crumb"]'
    ).val()
    notificationsClient.update.mockRejectedValue(
      Object.assign(
        new Error('The notification was changed by another user.'),
        {
          statusCode: 409
        }
      )
    )

    const response = await server.inject({
      method: 'POST',
      url: '/notification/commodity-details',
      auth,
      headers: { cookie, accept: 'application/json' },
      payload: {
        crumb,
        commodities: JSON.stringify([
          {
            commodityCode: '03021400',
            species: [
              {
                speciesCode: 'SAL',
                commonName: 'Atlantic salmon',
                netWeightKg: 500
              }
            ],
            totalNetWeightKg: 500
          }
        ])
      }
    })
    expect(response.statusCode).toBe(409)
    expect(response.headers.location).toBeUndefined()
    expect(response.result.message).toContain('changed by another user')
  })
})
