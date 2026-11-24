import * as cheerio from 'cheerio'
import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

describe('#homeController', () => {
  let server
  const auth = {
    strategy: 'session',
    credentials: {
      userId: 'test-user-importer-north-quay',
      role: 'importer',
      organisationId: 'test-org-north-quay-seafood'
    }
  }

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected response', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/',
      auth
    })

    expect(result).toEqual(
      expect.stringContaining('Import fish and fishery products |')
    )
    expect(statusCode).toBe(statusCodes.ok)
  })

  test('Should link Create a new import notification to guidance', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/',
      auth
    })
    const $ = cheerio.load(result)
    const createButton = $('main a.govuk-button--start')

    expect(createButton.text().trim()).toBe('Create a new import notification')
    expect(createButton.attr('href')).toBe('/notification/guidance')
  })

  test('shows the service name without links in the service navigation', async () => {
    const { result } = await server.inject({ method: 'GET', url: '/', auth })
    const $ = cheerio.load(result)
    const serviceNavigation = $('.govuk-service-navigation')

    expect(serviceNavigation.text().trim()).toBe('Import notification service')
    expect(serviceNavigation.find('a')).toHaveLength(0)
  })

  test('shows the alpha phase banner with the feedback link', async () => {
    const { result } = await server.inject({ method: 'GET', url: '/', auth })
    const $ = cheerio.load(result)
    const banner = $('.govuk-phase-banner')

    expect(banner.find('.govuk-tag').text().trim()).toBe('Alpha')
    expect(banner.find('.govuk-phase-banner__text').text().trim()).toBe(
      'This is a new service – your feedback will help us improve it.'
    )
    expect(banner.find('a').text().trim()).toBe('feedback')
    expect(banner.find('a').attr('href')).toBe('/')
  })

  test('uses the configured service name in the service navigation', async () => {
    const originalName = config.get('insServiceName')
    config.set('insServiceName', 'Alternative service name')
    try {
      const { result } = await server.inject({ method: 'GET', url: '/', auth })
      const $ = cheerio.load(result)
      expect($('.govuk-service-navigation').text().trim()).toBe(
        'Alternative service name'
      )
    } finally {
      config.set('insServiceName', originalName)
    }
  })
})
