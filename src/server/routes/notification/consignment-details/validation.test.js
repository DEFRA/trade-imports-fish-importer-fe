import { validateConsignmentDetails } from './validation.js'

const now = new Date('2026-11-19T14:30:45Z')
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

function validate(overrides, clock = now) {
  return validateConsignmentDetails({ ...validPayload, ...overrides }, clock)
}

describe('Consignment details validation', () => {
  test.each(['', 'unknown', ['dover'], { value: 'dover' }])(
    'rejects a missing, unknown or malformed port: %j',
    (port) => {
      expect(validate({ port }).errors.port).toEqual({
        text: 'Select a port of entry from the list',
        fields: ['port']
      })
    }
  )

  test.each([
    [{ 'arrival-day': '' }, 'a day', ['arrival-day']],
    [{ 'arrival-month': ' ' }, 'a month', ['arrival-month']],
    [{ 'arrival-year': '' }, 'a year', ['arrival-year']],
    [
      { 'arrival-day': '', 'arrival-month': '' },
      'a day and month',
      ['arrival-day', 'arrival-month']
    ],
    [
      { 'arrival-day': '', 'arrival-year': '' },
      'a day and year',
      ['arrival-day', 'arrival-year']
    ],
    [
      { 'arrival-month': '', 'arrival-year': '' },
      'a month and year',
      ['arrival-month', 'arrival-year']
    ]
  ])('identifies incomplete dates: %j', (fields, missing, affected) => {
    expect(validate(fields).errors.date).toEqual({
      text: `The expected date of arrival must include ${missing}`,
      fields: affected
    })
  })

  test('prioritises missing parts over invalid parts and past dates', () => {
    expect(
      validate({
        'arrival-day': '',
        'arrival-month': '13',
        'arrival-year': '2020'
      }).errors.date
    ).toEqual({
      text: 'The expected date of arrival must include a day',
      fields: ['arrival-day']
    })
  })

  test.each(['26', '026', '20260'])(
    'requires a four-digit year: %s',
    (year) => {
      expect(validate({ 'arrival-year': year }).errors.date).toEqual({
        text: 'Year must include 4 numbers',
        fields: ['arrival-year']
      })
    }
  )

  test.each([
    [{ 'arrival-day': '0' }, ['arrival-day']],
    [{ 'arrival-day': '32' }, ['arrival-day']],
    [{ 'arrival-day': '1e1' }, ['arrival-day']],
    [{ 'arrival-month': '13' }, ['arrival-month']],
    [{ 'arrival-month': '0' }, ['arrival-month']],
    [{ 'arrival-month': 'not a month' }, ['arrival-month']],
    [{ 'arrival-year': 'year' }, ['arrival-year']],
    [{ 'arrival-year': '0000' }, ['arrival-year']],
    [
      { 'arrival-day': '0', 'arrival-month': '13' },
      ['arrival-day', 'arrival-month', 'arrival-year']
    ],
    [
      { 'arrival-day': '31', 'arrival-month': '4' },
      ['arrival-day', 'arrival-month', 'arrival-year']
    ],
    [
      { 'arrival-day': '29', 'arrival-month': '2', 'arrival-year': '2027' },
      ['arrival-day', 'arrival-month', 'arrival-year']
    ]
  ])('rejects impossible dates without rollover: %j', (fields, affected) => {
    expect(validate(fields).errors.date).toEqual({
      text: 'The expected date of arrival must be a real date',
      fields: affected
    })
  })

  test.each(['2', '02', 'February', 'feb', ' FEB '])(
    'accepts leap day and numeric or named months: %s',
    (month) => {
      expect(
        validate({
          'arrival-day': '29',
          'arrival-month': month,
          'arrival-year': '2028'
        }).errors.date
      ).toBeUndefined()
    }
  )

  test.each(['september', 'Sep', 'sept'])(
    'accepts September abbreviations: %s',
    (month) => {
      expect(
        validate({ 'arrival-month': month, 'arrival-year': '2027' }).errors.date
      ).toBeUndefined()
    }
  )

  test('rejects past dates without also reporting a past-time error', () => {
    const { errors } = validate({
      'arrival-day': '18',
      'arrival-hour': '01',
      'arrival-minute': '00'
    })

    expect(errors.date.text).toBe(
      'The expected date of arrival must be today or in the future'
    )
    expect(errors.time).toBeUndefined()
  })

  test.each([
    [
      { 'arrival-hour': '', 'arrival-minute': '' },
      'Enter the expected time of arrival',
      ['arrival-hour', 'arrival-minute']
    ],
    [
      { 'arrival-hour': '' },
      'The expected time of arrival must include an hour',
      ['arrival-hour']
    ],
    [
      { 'arrival-minute': '' },
      'The expected time of arrival must include a minute',
      ['arrival-minute']
    ]
  ])('identifies missing time parts: %j', (fields, text, affected) => {
    expect(validate(fields).errors.time).toEqual({ text, fields: affected })
  })

  test.each([
    [{ 'arrival-hour': '24' }, ['arrival-hour']],
    [{ 'arrival-hour': '-1' }, ['arrival-hour']],
    [{ 'arrival-hour': '009' }, ['arrival-hour']],
    [{ 'arrival-hour': '9am' }, ['arrival-hour']],
    [{ 'arrival-minute': '60' }, ['arrival-minute']],
    [{ 'arrival-minute': '-1' }, ['arrival-minute']],
    [{ 'arrival-minute': '030' }, ['arrival-minute']],
    [
      { 'arrival-hour': 'x', 'arrival-minute': 'y' },
      ['arrival-hour', 'arrival-minute']
    ]
  ])('rejects invalid time parts: %j', (fields, affected) => {
    expect(validate(fields).errors.time).toEqual({
      text: 'Enter a time using an hour from 0 to 23 and a minute from 0 to 59',
      fields: affected
    })
  })

  test.each([
    ['0', '0'],
    ['00', '00'],
    ['9', '5'],
    ['09', '05'],
    ['23', '59']
  ])('accepts valid future-day times %s:%s', (hour, minute) => {
    expect(
      Object.values(
        validate({ 'arrival-hour': hour, 'arrival-minute': minute }).errors
      ).filter(Boolean)
    ).toEqual([])
  })

  test.each([
    ['29', false],
    ['30', false],
    ['31', true]
  ])('compares today at minute precision: 14:%s', (minute, valid) => {
    const { errors } = validate({
      'arrival-day': '19',
      'arrival-hour': '14',
      'arrival-minute': minute
    })

    expect(errors.date).toBeUndefined()
    expect(!errors.time).toBe(valid)
  })

  test('uses the UK calendar date when BST has passed UTC midnight', () => {
    const clock = new Date('2026-07-01T23:30:45Z')
    const past = validate(
      {
        'arrival-day': '1',
        'arrival-month': '7',
        'arrival-hour': '23',
        'arrival-minute': '59'
      },
      clock
    )
    const currentMinute = validate(
      {
        'arrival-day': '2',
        'arrival-month': '7',
        'arrival-hour': '0',
        'arrival-minute': '30'
      },
      clock
    )
    const nextMinute = validate(
      {
        'arrival-day': '2',
        'arrival-month': '7',
        'arrival-hour': '0',
        'arrival-minute': '31'
      },
      clock
    )

    expect(past.errors.date).toBeDefined()
    expect(currentMinute.errors.date).toBeUndefined()
    expect(currentMinute.errors.time).toBeDefined()
    expect(Object.values(nextMinute.errors).filter(Boolean)).toEqual([])
  })

  test.each([
    ['2026-03-29T01:30:45Z', '29', '3', '2', '31'],
    ['2026-10-25T01:30:45Z', '25', '10', '1', '31']
  ])(
    'uses the UK clock after a daylight-saving transition: %s',
    (clock, day, month, hour, minute) => {
      expect(
        Object.values(
          validate(
            {
              'arrival-day': day,
              'arrival-month': month,
              'arrival-hour': hour,
              'arrival-minute': minute
            },
            new Date(clock)
          ).errors
        ).filter(Boolean)
      ).toEqual([])
    }
  )

  test('preserves original strings while validating trimmed values', () => {
    const payload = {
      ...validPayload,
      port: ' dover ',
      'arrival-month': ' November ',
      'arrival-hour': ' 9 ',
      'arrival-minute': ' 5 '
    }
    const { errors, values } = validateConsignmentDetails(payload, now)

    expect(values).toEqual(payload)
    expect(Object.values(errors).filter(Boolean)).toEqual([])
  })

  test.each([undefined, null, [], { port: ['dover'], 'arrival-day': {} }])(
    'rejects malformed or empty payloads without throwing: %j',
    (payload) => {
      const { errors } = validateConsignmentDetails(payload, now)

      expect(errors.port).toBeDefined()
      expect(errors.date.text).toBe('Enter the expected date of arrival')
      expect(errors.time.text).toBe('Enter the expected time of arrival')
    }
  )

  describe('country of export and CHED reference', () => {
    test.each(['', 'XX', ['FR'], { value: 'FR' }])(
      'rejects a missing, unknown or malformed country: %j',
      (country) => {
        const { errors } = validate({ 'country-of-export': country })

        expect(errors.country).toEqual({
          text: 'Select a country of export from the list',
          fields: ['country-of-export']
        })
        expect(errors.ched).toBeUndefined()
      }
    )

    test.each(['FR', 'IE', 'DE'])(
      'does not ask for or keep a CHED reference for EU country %s',
      (country) => {
        const { errors, values } = validate({
          'country-of-export': country,
          'ched-reference': 'CHEDA.XI.2025.1234567'
        })

        expect(errors.ched).toBeUndefined()
        expect(values['ched-reference']).toBe('')
      }
    )

    test.each([
      'AO',
      'US',
      'NO',
      'CH',
      'AU',
      'british-antarctic-territory',
      'akrotiri-and-dhekelia'
    ])(
      'requires a CHED reference for rest-of-the-world country %s',
      (country) => {
        expect(
          validate({ 'country-of-export': country, 'ched-reference': '  ' })
            .errors.ched
        ).toEqual({
          text: 'Enter a CHED reference',
          fields: ['ched-reference']
        })
      }
    )

    test.each([
      'CHEDA.XI.2025.1234567',
      'CHEDD.XI.2025.1234567',
      'CHEDPP.XI.2025.1234567',
      'CHEDP.XI.2025.123456',
      'CHEDP.XI.2025.12345678',
      'CHEDPXI20251234567',
      'CHEDP.XI2025.1234567',
      'CHEDP.X.2025.1234567',
      'CHEDP.XI.25.1234567',
      'CHEDP.XI.2025.1234567X',
      'REF CHEDP.XI.2025.1234567',
      'CHEDP.XI.2025.1234 567'
    ])('rejects a badly formatted CHED reference: %s', (reference) => {
      expect(
        validate({ 'country-of-export': 'AO', 'ched-reference': reference })
          .errors.ched
      ).toEqual({
        text: 'Enter a CHED reference in the correct format, like CHEDP.XI.2025.1234567',
        fields: ['ched-reference']
      })
    })

    test.each([
      ['CHEDP.XI.2025.1234567', 'CHEDP.XI.2025.1234567'],
      ['  chedp.xi.2025.1234567 ', 'CHEDP.XI.2025.1234567'],
      ['ChedP.Gb.2026.0000001', 'CHEDP.GB.2026.0000001']
    ])(
      'accepts and normalises a valid CHED reference: %j',
      (reference, normalised) => {
        const { errors, values } = validate({
          'country-of-export': 'AO',
          'ched-reference': reference
        })

        expect(Object.values(errors).filter(Boolean)).toEqual([])
        expect(values['ched-reference']).toBe(normalised)
      }
    )
  })
})
