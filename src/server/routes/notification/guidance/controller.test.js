import * as cheerio from 'cheerio'
import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { config } from '#/config/config.js'

describe('#guidanceController', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected response and guidance content', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/notification/guidance'
    })
    const $ = cheerio.load(result)
    const content = $('main').text().replace(/\s+/g, ' ').trim()

    expect(statusCode).toBe(statusCodes.ok)
    expect($('title').text()).toContain(
      'Submit your seafood import notification |'
    )
    expect($('h1').text()).toBe('Submit your seafood import notification')
    expect(
      $('main h2')
        .map((_, element) => $(element).text())
        .get()
    ).toEqual([
      'Before you start',
      'Documents you need',
      'What happens when you upload your documents',
      'Check the information carefully',
      'Related content'
    ])
    expect(content).toContain(
      'Use this service to submit a seafood import notification for fish and fishery products entering Great Britain.'
    )
    expect(content).toContain(
      'You must submit your seafood import notification before your consignment arrives in Great Britain.'
    )
    expect(content).toContain(
      'The documents you need depend on the journey your seafood has taken through the supply chain.'
    )
    expect(content).toContain(
      'The service will identify and extract information from your documents to help complete your notification.'
    )
    expect(content).toContain(
      'You must check that all information is complete and correct before submitting your notification. If information is missing or incorrect, you can update it before submission.'
    )
  })

  test('Should provide expandable document guidance', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/notification/guidance'
    })
    const $ = cheerio.load(result)
    const details = $('main details.govuk-details')

    expect(details).toHaveLength(2)
    expect(details.eq(0).find('summary').text().trim()).toBe(
      'Help with required documents'
    )
    expect(details.eq(0).text()).toContain(
      'Your Catch Certificate shows that the fish were caught legally in line with fisheries regulations.'
    )
    expect(details.eq(0).text()).toContain(
      'It links the processed product back to the original catch documentation.'
    )
    expect(details.eq(0).text()).toContain(
      "You'll need this document if the fish has passed through one or more countries after processing and before import into Great Britain."
    )
    expect(details.eq(1).find('summary').text().trim()).toBe(
      'Help with additional documents'
    )
    expect(details.eq(1).text()).toContain(
      'Additional supporting documents are not analysed automatically and no information is collected from them, but they may be used as part of the review of your notification.'
    )
    expect(details.eq(1).text()).toContain(
      "a Movement Reference Number (MRN) if you're using the Common Transit Convention (CTC) to move goods between countries"
    )
    expect(details.eq(1).text()).toContain(
      'a specific catch document instead of a standard catch certificate, such as an ICCAT Bluefin Tuna Catch Document for bluefin tuna'
    )
  })

  test('Should provide a back link and related content', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/notification/guidance'
    })
    const $ = cheerio.load(result)
    const backLink = $('a.govuk-back-link')

    expect(backLink.text().trim()).toBe('Back')
    expect(backLink.attr('href')).toBe('/')
    expect(
      $('aside nav a')
        .map((_, element) => $(element).text().trim())
        .get()
    ).toEqual([
      'Importing or moving fish to the UK',
      'Preparing documents for processed seafood products',
      'Making sure your documents can be accepted',
      'What happens after the notification is submitted'
    ])
  })

  test('Should link Start now directly to transport details without creating a session', async () => {
    const { result, headers } = await server.inject({
      method: 'GET',
      url: '/notification/guidance'
    })
    const $ = cheerio.load(result)
    const startButton = $('main a.govuk-button--start')

    expect(startButton).toHaveLength(1)
    expect(startButton.text().trim()).toBe('Start now')
    expect(startButton.attr('href')).toBe('/notification/transport-details')
    expect(
      (headers['set-cookie'] ?? []).some((cookie) =>
        cookie.startsWith(`${config.get('session.cache.name')}=`)
      )
    ).toBe(false)
  })
})
