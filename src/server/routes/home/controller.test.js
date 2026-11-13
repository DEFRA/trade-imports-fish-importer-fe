import * as cheerio from 'cheerio'
import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

describe('#homeController', () => {
  let server

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
      url: '/'
    })

    expect(result).toEqual(
      expect.stringContaining('Import fish and fishery products |')
    )
    expect(statusCode).toBe(statusCodes.ok)
  })

  test('Should link Create a new import notification to guidance', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/'
    })
    const $ = cheerio.load(result)
    const createButton = $('main a.govuk-button--start')

    expect(createButton.text().trim()).toBe('Create a new import notification')
    expect(createButton.attr('href')).toBe('/notification/guidance')
  })
})
