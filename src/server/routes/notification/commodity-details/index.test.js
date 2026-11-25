import { load } from 'cheerio'
import { readFile } from 'node:fs/promises'
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

describe('commodity details routes', () => {
  let server

  beforeAll(async () => {
    config.set('isDevelopment', false)
    vi.stubGlobal('fetch', vi.fn())
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.resetAllMocks()
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

  test('shows the seeded commodity form outside development without an API', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/notification/commodity-details',
      auth
    })
    const $ = load(response.payload)
    expect(response.statusCode).toBe(200)
    expect($('h1').text()).toContain('seafood')
    expect($('.govuk-back-link').attr('href')).toBe(
      '/notification/consignment-details'
    )
    expect($('.govuk-back-link').prevAll('.govuk-phase-banner')).toHaveLength(1)
    expect($('[data-commodity-form] input[name="crumb"]')).toHaveLength(1)
    const expected = JSON.parse(
      await readFile(
        new URL(
          '../../../services/reference-data/commodities.json',
          import.meta.url
        ),
        'utf8'
      )
    )
    expect(
      JSON.parse($('[data-commodity-form]').attr('data-reference'))
    ).toEqual(expected)
    expect(fetch).not.toHaveBeenCalled()
  })

  test('provides the commodity, species and weight controls', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/notification/commodity-details',
      auth
    })
    const $ = load(response.payload)
    expect($('label[for="commodityCode"]').text()).toContain('Commodity code')
    expect($('label[for="species"]').text()).toContain('Species')
    expect($('label[for="weight"]').text()).toContain('Weight')
    expect($('button').text()).toContain('Add commodity')
    expect($('button').text()).toContain('Save and continue')
  })

  test('provides labelled comboboxes and associated option lists', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/notification/commodity-details',
      auth
    })
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
    const response = await server.inject({
      method: 'GET',
      url: '/notification/commodity-details',
      auth
    })
    const $ = load(response.payload)
    expect($('[data-commodity-summary]').attr('hidden')).toBeDefined()
    expect($('[data-commodity-summary] [data-rows] tr')).toHaveLength(0)
  })

  test('patches committed commodities and returns success', async () => {
    const visit = await server.inject({
      method: 'GET',
      url: '/notification/commodity-details',
      auth
    })
    const cookie = (visit.headers['set-cookie'] ?? [])
      .map((item) => item.split(';')[0])
      .join('; ')
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
    const visit = await server.inject({
      method: 'GET',
      url: '/notification/commodity-details',
      auth
    })
    const cookie = (visit.headers['set-cookie'] ?? [])
      .map((item) => item.split(';')[0])
      .join('; ')
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
