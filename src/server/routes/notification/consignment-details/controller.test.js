import * as cheerio from 'cheerio'
import { createServer } from '#/server/server.js'
import { config } from '#/config/config.js'

const url = '/notification/consignment-details'
const auth = {
  strategy: 'session',
  credentials: {
    userId: 'test-user-importer-north-quay',
    role: 'importer',
    organisationId: 'test-org-north-quay-seafood'
  }
}
const validPayload = {
  port: 'dover',
  'arrival-day': '20',
  'arrival-month': '11',
  'arrival-year': '2026',
  'arrival-hour': '09',
  'arrival-minute': '30'
}
const minimumMessage =
  'The expected date and time of arrival must be at least 2 hours in the future'
const maximumMessage =
  'The expected date and time of arrival must be no more than 1 year in the future'

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
    const response = await server.inject({ method: 'GET', url, auth })
    const $ = cheerio.load(response.payload)
    const cookie = (response.headers['set-cookie'] ?? [])
      .map((value) => value.split(';')[0])
      .join('; ')

    return server.inject({
      method: 'POST',
      url,
      auth,
      headers: { cookie },
      payload: {
        ...validPayload,
        ...overrides,
        crumb: $('form input[name="crumb"]').val()
      }
    })
  }

  test('renders only the arrival form with the agreed content and seeded ports', async () => {
    const response = await server.inject({ method: 'GET', url, auth })
    const $ = cheerio.load(response.payload)
    const form = $('main form')
    const fields = form.find('input:not([type="hidden"])')

    expect(response.statusCode).toBe(200)
    expect($('head > title').text().trim()).toBe(
      `Consignment details | ${config.get('serviceName')}`
    )
    expect($('header').length).toBeGreaterThan(0)
    expect($('footer').length).toBeGreaterThan(0)
    expect($('main h1')).toHaveLength(1)
    expect($('main h1').text()).toBe('Consignment details')
    expect($('.govuk-caption-l').text()).toBe('Import notification')
    expect($('main h2').text()).toBe('Arrival details')
    expect($('main').text()).toContain(
      'Provide your port of entry and expected date of arrival.'
    )
    expect($('main').text()).toContain('For example, 27 3 2026')
    expect($('#arrival-time-hint').text()).toBe('For example, 09:30 or 14:30')
    expect($('a.govuk-back-link').attr('href')).toBe(
      '/notification/transport-details'
    )
    expect(form.attr('method')).toBe('post')
    expect(form.attr('action')).toBe(url)
    expect(form.attr('novalidate')).toBeDefined()
    expect(form.find('input[name="crumb"]').val()).toBeTruthy()
    expect(form.find('button[type="submit"]').text().trim()).toBe(
      'Save and continue'
    )
    expect(form.find('select').val()).toBe('')
    expect(
      form
        .find('select option')
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
    expect($('main hr')).toHaveLength(0)
    expect($('main').text()).not.toMatch(
      /Additional details|Country of export|CHED/
    )
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
    expect($('a.govuk-back-link').attr('href')).toBe(
      '/notification/transport-details'
    )
    expect($('head > title').text().trim()).toBe(
      `Error: Consignment details | ${config.get('serviceName')}`
    )
    expect($('.govuk-error-summary').attr('data-module')).toBe(
      'govuk-error-summary'
    )
    expect(links.map((_, link) => $(link).attr('href')).get()).toEqual([
      '#port',
      '#arrival-day',
      '#arrival-hour'
    ])
    links.each((_, link) => {
      const field = $($(link).attr('href'))
      expect(field).toHaveLength(1)
      const group = field.parents('.govuk-form-group--error').last()
      expect(group.find('.govuk-error-message').text()).toContain(
        $(link).text()
      )
    })
    expect($('.govuk-error-message')).toHaveLength(3)
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
    ['2026', '16', '29', 400, minimumMessage],
    ['2026', '16', '30', 400, minimumMessage],
    ['2026', '16', '31', 303],
    ['2027', '14', '29', 303],
    ['2027', '14', '30', 303],
    ['2027', '14', '31', 400, maximumMessage],
    ['2126', '14', '30', 400, maximumMessage]
  ])(
    'renders combined arrival-window errors and preserves inputs: %s 19 November %s:%s',
    async (year, hour, minute, status, message) => {
      const fields = {
        'arrival-day': ' 19 ',
        'arrival-month': ' November ',
        'arrival-year': year,
        'arrival-hour': hour,
        'arrival-minute': minute
      }
      const response = await submit(fields)

      expect(response.statusCode).toBe(status)
      if (status === 400) {
        const $ = cheerio.load(response.payload)
        const links = $('.govuk-error-summary__list a')
        expect(links).toHaveLength(1)
        expect(links.attr('href')).toBe('#arrival-day')
        expect(links.text()).toBe(message)
        for (const id of ['arrival-date', 'arrival-time']) {
          expect(
            $(`#${id}-error`)
              .clone()
              .find('.govuk-visually-hidden')
              .remove()
              .end()
              .text()
              .trim()
          ).toBe(message)
        }
        expect(
          $('main input.govuk-input--error')
            .map((_, input) => $(input).attr('id'))
            .get()
        ).toEqual([
          'arrival-day',
          'arrival-month',
          'arrival-year',
          'arrival-hour',
          'arrival-minute'
        ])
        for (const [field, value] of Object.entries({
          ...validPayload,
          ...fields
        })) {
          expect($(`[name="${field}"]`).val()).toBe(value)
        }
        expect(
          $('#arrival-day').closest('fieldset').attr('aria-describedby')
        ).toBe('arrival-date-hint arrival-date-error')
        expect(
          $('#arrival-hour').closest('fieldset').attr('aria-describedby')
        ).toBe('arrival-time-hint arrival-time-error')
        expect(response.headers.location).toBeUndefined()
        expect($('head > title').text().trim()).toBe(
          `Error: Consignment details | ${config.get('serviceName')}`
        )
        expectNoSession(response)
      } else {
        expect(response.headers.location).toBe('/notification/next-step')
      }
    }
  )

  test.each([
    ['2026-03-28T09:30:00Z', '29', '2026'],
    ['2026-03-29T00:30:00Z', '29', '2026'],
    ['2026-11-19T14:30:45Z', '26', '2028']
  ])(
    'rejects nonexistent spring-clock arrivals with a time-only error: %s',
    async (clock, day, year) => {
      vi.setSystemTime(new Date(clock))
      const fields = {
        'arrival-day': day,
        'arrival-month': ' March ',
        'arrival-year': year,
        'arrival-hour': '01',
        'arrival-minute': '30'
      }
      const response = await submit(fields)
      const $ = cheerio.load(response.payload)
      const message =
        'The expected time of arrival does not exist on this date because the UK clocks go forward'

      expect(response.statusCode).toBe(400)
      const links = $('.govuk-error-summary__list a')
      expect(links).toHaveLength(1)
      expect(links.attr('href')).toBe('#arrival-hour')
      expect(links.text()).toBe(message)
      expect($('#arrival-date-error')).toHaveLength(0)
      expect(
        $('#arrival-time-error')
          .clone()
          .find('.govuk-visually-hidden')
          .remove()
          .end()
          .text()
          .trim()
      ).toBe(message)
      expect(
        $('main input.govuk-input--error')
          .map((_, input) => $(input).attr('id'))
          .get()
      ).toEqual(['arrival-hour', 'arrival-minute'])
      expect(
        $('#arrival-hour').closest('fieldset').attr('aria-describedby')
      ).toBe('arrival-time-hint arrival-time-error')
      expect(
        $('#arrival-day').closest('fieldset').attr('aria-describedby')
      ).toBe('arrival-date-hint')
      for (const [field, value] of Object.entries({
        ...validPayload,
        ...fields
      })) {
        expect($(`[name="${field}"]`).val()).toBe(value)
      }
      expect(response.headers.location).toBeUndefined()
      expectNoSession(response)
    }
  )

  test('accepts a month name and redirects to a page not found without retaining a draft', async () => {
    const response = await submit({ 'arrival-month': 'November' })

    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('/notification/next-step')
    expectNoSession(response)

    const destination = await server.inject({
      method: 'GET',
      url: response.headers.location,
      auth
    })
    const $ = cheerio.load(destination.payload)

    expect(destination.statusCode).toBe(404)
    expect($('head > title').text().trim()).toBe(
      `Page not found | ${config.get('serviceName')}`
    )
    expect($('header').length).toBeGreaterThan(0)
    expect($('footer').length).toBeGreaterThan(0)
    expect($('main h1')).toHaveLength(1)
    expect($('main h1').text().trim()).toBe('404')
    expect($('main').text()).toContain('Page not found')
    expectNoSession(destination)

    const back = await server.inject({
      method: 'GET',
      url,
      auth
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
    const response = await server.inject({ method: 'GET', url, auth })
    const $ = cheerio.load(response.payload)

    expect($('#port').val()).toBe('')
    expect($('#arrival-minute').attr('value') ?? '').toBe('')
    expect($('.govuk-error-summary')).toHaveLength(0)
  })

  test('rejects submissions without a CSRF token', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      auth,
      payload: validPayload
    })

    expect(response.statusCode).toBe(403)
    expect(response.headers.location).toBeUndefined()
  })

  test.each([
    ['GET', url],
    ['POST', url]
  ])('requires authentication for %s %s', async (method, path) => {
    const response = await server.inject({ method, url: path })

    expect(response.statusCode).toBe(401)
  })
})
