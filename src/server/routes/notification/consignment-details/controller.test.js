import * as cheerio from 'cheerio'
import { createServer } from '#/server/server.js'
import { config } from '#/config/config.js'

const url = '/notification/consignment-details'
const validPayload = {
  port: 'dover',
  'arrival-day': '20',
  'arrival-month': '11',
  'arrival-year': '2026',
  'arrival-hour': '09',
  'arrival-minute': '30',
  'country-of-export': 'FR',
  'ched-reference': ''
}

describe('Consignment details journey', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-19T14:30:45Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  function expectNoSession(response) {
    expect(
      (response.headers['set-cookie'] ?? []).some((cookie) =>
        cookie.startsWith(`${config.get('session.cache.name')}=`)
      )
    ).toBe(false)
  }

  async function submit(overrides = {}) {
    const response = await server.inject({ method: 'GET', url })
    const $ = cheerio.load(response.payload)
    const cookie = (response.headers['set-cookie'] ?? [])
      .map((value) => value.split(';')[0])
      .join('; ')

    return server.inject({
      method: 'POST',
      url,
      headers: { cookie },
      payload: {
        ...validPayload,
        ...overrides,
        crumb: $('form input[name="crumb"]').val()
      }
    })
  }

  test('renders only the arrival form with the agreed content and seeded ports', async () => {
    const response = await server.inject({ method: 'GET', url })
    const $ = cheerio.load(response.payload)
    const form = $('main form')
    const fields = form.find('input[id^="arrival-"]')

    expect(response.statusCode).toBe(200)
    expect($('head > title').text().trim()).toBe(
      `Consignment details | ${config.get('serviceName')}`
    )
    expect($('header').length).toBeGreaterThan(0)
    expect($('footer').length).toBeGreaterThan(0)
    expect($('main h1')).toHaveLength(1)
    expect($('main h1').text()).toBe('Consignment details')
    expect($('.govuk-caption-l').text()).toBe('Import notification')
    expect(
      $('main h2')
        .map((_, heading) => $(heading).text())
        .get()
    ).toEqual(['Arrival details', 'Additional details'])
    expect($('main').text()).toContain(
      'Provide your port of entry and expected date of arrival.'
    )
    expect($('main').text()).toContain('For example, 27 3 2026')
    expect($('#arrival-time-hint').text()).toBe('For example, 09:30 or 14:30')
    expect($('a.govuk-back-link').attr('href')).toBe('/notification/guidance')
    expect(form.attr('method')).toBe('post')
    expect(form.attr('action')).toBe(url)
    expect(form.attr('novalidate')).toBeDefined()
    expect(form.find('input[name="crumb"]').val()).toBeTruthy()
    expect(form.find('button[type="submit"]').text().trim()).toBe(
      'Save and continue'
    )
    expect($('#port').val()).toBe('')
    expect(
      $('#port option')
        .map((_, option) => $(option).text().trim())
        .get()
    ).toEqual([
      'Select a destination port',
      'Dover',
      'Felixstowe',
      'Grimsby',
      'Hull',
      'Immingham',
      'Liverpool',
      'Portsmouth',
      'Tilbury'
    ])
    expect(fields).toHaveLength(5)
    fields.each((_, field) => {
      expect($(field).attr('type')).toBe('text')
      expect($(field).attr('inputmode')).toBe('numeric')
      expect($(field).attr('value') ?? '').toBe('')
      expect($(`label[for="${$(field).attr('id')}"]`)).toHaveLength(1)
    })
    expect($('#arrival-year').hasClass('govuk-input--width-4')).toBe(true)
    expect($('#arrival-hour').hasClass('govuk-input--width-2')).toBe(true)
    expect($('#arrival-minute').hasClass('govuk-input--width-2')).toBe(true)
    expect(
      form
        .find('fieldset')
        .map((_, fieldset) => $(fieldset).find('legend').text().trim())
        .get()
    ).toEqual([
      'What is the expected date of arrival?',
      'What time is the expected arrival?'
    ])
    for (const fieldset of form.find('fieldset')) {
      expect($(fieldset).attr('role')).toBe('group')
      const descriptions = $(fieldset).attr('aria-describedby').split(' ')
      expect(descriptions.every((id) => $(`[id="${id}"]`).length === 1)).toBe(
        true
      )
    }
    expect(form.find('.govuk-error-summary')).toHaveLength(0)
    expect($('main hr.govuk-section-break--visible')).toHaveLength(1)
    expectNoSession(response)
  })

  test('shows linked, matching errors for empty fields without redirecting', async () => {
    const response = await submit(
      Object.fromEntries(Object.keys(validPayload).map((field) => [field, '']))
    )
    const $ = cheerio.load(response.payload)
    const links = $('.govuk-error-summary__list a')

    expect(response.statusCode).toBe(400)
    expect(response.headers.location).toBeUndefined()
    expect($('head > title').text().trim()).toBe(
      `Error: Consignment details | ${config.get('serviceName')}`
    )
    expect($('.govuk-error-summary').attr('data-module')).toBe(
      'govuk-error-summary'
    )
    expect(links.map((_, link) => $(link).attr('href')).get()).toEqual([
      '#port',
      '#arrival-day',
      '#arrival-hour',
      '#country-of-export'
    ])
    links.each((_, link) => {
      const field = $($(link).attr('href'))
      expect(field).toHaveLength(1)
      const group = field.parents('.govuk-form-group--error').last()
      expect(group.find('.govuk-error-message').text()).toContain(
        $(link).text()
      )
    })
    expect($('.govuk-error-message')).toHaveLength(4)
    expect($('#arrival-date input.govuk-input--error')).toHaveLength(3)
    expect($('#arrival-hour').hasClass('govuk-input--error')).toBe(true)
    expect($('#arrival-minute').hasClass('govuk-input--error')).toBe(true)
    expectNoSession(response)
  })

  test('preserves values and highlights only a missing date component', async () => {
    const fields = { 'arrival-day': ' 20 ', 'arrival-month': '' }
    const response = await submit(fields)
    const $ = cheerio.load(response.payload)

    expect(response.statusCode).toBe(400)
    expect($('#port').val()).toBe('dover')
    for (const [field, value] of Object.entries({
      ...validPayload,
      ...fields
    })) {
      expect($(`[name="${field}"]`).val()).toBe(value)
    }
    expect($('.govuk-error-summary__list a').attr('href')).toBe(
      '#arrival-month'
    )
    expect(
      $('#arrival-date input.govuk-input--error')
        .map((_, input) => $(input).attr('id'))
        .get()
    ).toEqual(['arrival-month'])
    expect($('#arrival-date-error').text()).toContain(
      'The expected date of arrival must include a month'
    )
    expect(
      $('#arrival-date').closest('fieldset').attr('aria-describedby')
    ).toBe('arrival-date-hint arrival-date-error')
  })

  test('safely redisplays invalid user input as text, not markup', async () => {
    const value = '"><script>alert(1)</script>'
    const response = await submit({ 'arrival-day': value })
    const $ = cheerio.load(response.payload)

    expect(response.statusCode).toBe(400)
    expect($('#arrival-day').val()).toBe(value)
    expect($('main script')).toHaveLength(0)
  })

  test('keeps errors linked to the invalid time component and associates the group error', async () => {
    const response = await submit({ 'arrival-minute': '60' })
    const $ = cheerio.load(response.payload)

    expect(response.statusCode).toBe(400)
    expect($('.govuk-error-summary__list a').attr('href')).toBe(
      '#arrival-minute'
    )
    expect($('#arrival-hour').hasClass('govuk-input--error')).toBe(false)
    expect($('#arrival-minute').hasClass('govuk-input--error')).toBe(true)
    expect(
      $('#arrival-minute').closest('fieldset').attr('aria-describedby')
    ).toBe('arrival-time-hint arrival-time-error')
  })

  test.each([
    [{ port: 'unknown' }, '#port'],
    [{ 'arrival-day': '31', 'arrival-month': '11' }, '#arrival-day'],
    [{ 'arrival-year': '26' }, '#arrival-year'],
    [{ 'arrival-day': '18' }, '#arrival-day'],
    [{ 'arrival-hour': '' }, '#arrival-hour'],
    [{ 'arrival-hour': '24' }, '#arrival-hour'],
    [{ port: ['dover'], 'arrival-day': {} }, '#port']
  ])(
    'rejects invalid submissions with field errors: %j',
    async (fields, firstError) => {
      const response = await submit(fields)
      const $ = cheerio.load(response.payload)

      expect(response.statusCode).toBe(400)
      expect($('.govuk-error-summary__list a').first().attr('href')).toBe(
        firstError
      )
    }
  )

  test.each([
    ['29', 400],
    ['30', 400],
    ['31', 303]
  ])(
    'validates today against the current UK minute: 14:%s',
    async (minute, status) => {
      const response = await submit({
        'arrival-day': '19',
        'arrival-hour': '14',
        'arrival-minute': minute
      })

      expect(response.statusCode).toBe(status)
      if (status === 400) {
        const $ = cheerio.load(response.payload)
        expect($('#arrival-time-error').text()).toContain(
          'The expected time of arrival must be later than the current UK time'
        )
        expect($('#arrival-date-error')).toHaveLength(0)
      }
    }
  )

  test('accepts a month name and redirects without retaining a draft', async () => {
    const response = await submit({ 'arrival-month': 'November' })

    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('/notification/next-step')
    expectNoSession(response)

    const destination = await server.inject({
      method: 'GET',
      url: response.headers.location
    })
    const $ = cheerio.load(destination.payload)

    expect(destination.statusCode).toBe(200)
    expect($('head > title').text().trim()).toBe(
      `Next step | ${config.get('serviceName')}`
    )
    expect($('header').length).toBeGreaterThan(0)
    expect($('footer').length).toBeGreaterThan(0)
    expect($('main').text().trim()).toBe('')
    expect($('main').children()).toHaveLength(0)
    expect($('a.govuk-back-link').attr('href')).toBe(url)
    expectNoSession(destination)

    const back = await server.inject({
      method: 'GET',
      url: $('a.govuk-back-link').attr('href')
    })
    const form = cheerio.load(back.payload)

    expect(form('#port').val()).toBe('')
    expect(
      form('main input:not([type="hidden"])')
        .toArray()
        .every((field) => (form(field).attr('value') ?? '') === '')
    ).toBe(true)
    expectNoSession(back)
  })

  test('does not retain an invalid draft on a later GET', async () => {
    await submit({ 'arrival-minute': '60' })
    const response = await server.inject({ method: 'GET', url })
    const $ = cheerio.load(response.payload)

    expect($('#port').val()).toBe('')
    expect($('#arrival-minute').attr('value') ?? '').toBe('')
    expect($('.govuk-error-summary')).toHaveLength(0)
  })

  test('renders the country of export and a CHED reference field with guidance', async () => {
    const response = await server.inject({ method: 'GET', url })
    const $ = cheerio.load(response.payload)
    const options = $('#country-of-export option')
    const chedInput = $('#ched-reference')
    const describedBy = chedInput.attr('aria-describedby').split(' ')

    expect($('label[for="country-of-export"]').text().trim()).toBe(
      'Country of export'
    )
    expect($('#country-of-export-hint').text().trim()).toBe(
      'If the country is outside the EU, you will need to give a CHED reference.'
    )
    expect($('#country-of-export').val()).toBe('')
    expect(options.first().text().trim()).toBe('Select a country')
    expect(
      $('#country-of-export option[value="FR"]').attr('data-rest-of-world')
    ).toBe('false')
    expect(
      $('#country-of-export option[value="AO"]').attr('data-rest-of-world')
    ).toBe('true')
    expect($('label[for="ched-reference"]').text().trim()).toBe(
      'CHED reference'
    )
    expect(describedBy).toContain('ched-reference-guidance')
    expect(describedBy).toContain('ched-reference-hint')
    expect($('#ched-reference-hint').text().trim()).toBe(
      'For example, CHEDP.XI.2025.1234567'
    )
    const guidance = $('#ched-reference-container #ched-reference-guidance')
    expect(guidance).toHaveLength(1)
    expect(guidance.closest('details')).toHaveLength(0)
    expect(guidance.text()).toContain(
      'Get a CHED reference by submitting an import notification in IPAFFS'
    )
    expect(chedInput.attr('spellcheck')).toBe('false')
    expect(
      chedInput.closest('[data-module="app-ched-reference"]')
    ).toHaveLength(1)
    expect($('#ched-reference-container').attr('hidden')).toBeUndefined()
  })

  test('includes the prototype country and territory choices with unique values', async () => {
    const response = await server.inject({ method: 'GET', url })
    const $ = cheerio.load(response.payload)
    const options = $('#country-of-export option').slice(1)
    const values = options.map((_, option) => $(option).val()).get()

    expect(values).not.toContain('')
    expect(new Set(values).size).toBe(values.length)
    for (const [value, name] of [
      ['AU', 'Australia'],
      ['BR', 'Brazil'],
      ['JP', 'Japan'],
      ['NZ', 'New Zealand'],
      ['NR', 'Naoero'],
      ['british-antarctic-territory', 'British Antarctic Territory'],
      [
        'akrotiri-and-dhekelia',
        'The Sovereign Base Areas of Akrotiri and Dhekelia'
      ]
    ]) {
      const option = $(`#country-of-export option[value="${value}"]`)
      expect(option).toHaveLength(1)
      expect(option.text().trim()).toBe(name)
      expect(option.attr('data-rest-of-world')).toBe('true')
    }
  })

  test('does not require or keep a CHED reference for an EU country', async () => {
    const response = await submit({
      'country-of-export': 'FR',
      'ched-reference': 'not a reference'
    })

    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('/notification/next-step')
  })

  test('requires a CHED reference for Australia', async () => {
    const response = await submit({ 'country-of-export': 'AU' })
    const $ = cheerio.load(response.payload)

    expect(response.statusCode).toBe(400)
    expect($('#country-of-export').val()).toBe('AU')
    expect($('#ched-reference-error').text()).toContain(
      'Enter a CHED reference'
    )
    expect($('.govuk-error-summary__list a').attr('href')).toBe(
      '#ched-reference'
    )
  })

  test.each([
    ['', 'Enter a CHED reference'],
    [
      'CHEDA.XI.2025.1234567',
      'Enter a CHED reference in the correct format, like CHEDP.XI.2025.1234567'
    ]
  ])(
    'blocks a rest-of-the-world country with a missing or badly formatted CHED reference: %j',
    async (reference, message) => {
      const response = await submit({
        'country-of-export': 'AO',
        'ched-reference': reference
      })
      const $ = cheerio.load(response.payload)
      const links = $('.govuk-error-summary__list a')

      expect(response.statusCode).toBe(400)
      expect(response.headers.location).toBeUndefined()
      expect($('head > title').text().trim()).toBe(
        `Error: Consignment details | ${config.get('serviceName')}`
      )
      expect(links).toHaveLength(1)
      expect(links.attr('href')).toBe('#ched-reference')
      expect(links.text().trim()).toBe(message)
      expect($('#ched-reference-error').text()).toContain(message)
      expect($('#ched-reference').hasClass('govuk-input--error')).toBe(true)
      expect($('#ched-reference').val()).toBe(reference)
      expect($('#country-of-export').val()).toBe('AO')
      expect($('#port').val()).toBe('dover')
    }
  )

  test.each(['AO', 'AU'])(
    'accepts a valid CHED reference for rest-of-the-world country %s',
    async (country) => {
      const response = await submit({
        'country-of-export': country,
        'ched-reference': '  chedp.xi.2025.1234567 '
      })

      expect(response.statusCode).toBe(303)
      expect(response.headers.location).toBe('/notification/next-step')
    }
  )

  test('rejects submissions without a CSRF token', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: validPayload
    })

    expect(response.statusCode).toBe(403)
    expect(response.headers.location).toBeUndefined()
  })
})
