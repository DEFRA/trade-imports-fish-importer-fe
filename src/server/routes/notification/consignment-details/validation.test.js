import { validateConsignmentDetails } from './validation.js'

const now = new Date('2026-11-19T14:30:45Z')
const validPayload = {
  port: 'DOVER',
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
      const { errors } = validate(
        {
          'arrival-day': '29',
          'arrival-month': month,
          'arrival-year': '2028'
        },
        new Date('2028-02-28T12:00:00Z')
      )
      expect(Object.values(errors).filter(Boolean)).toEqual([])
    }
  )

  test.each(['september', 'Sep', 'sept'])(
    'accepts September abbreviations: %s',
    (month) => {
      const { errors } = validate({
        'arrival-month': month,
        'arrival-year': '2027'
      })
      expect(Object.values(errors).filter(Boolean)).toEqual([])
    }
  )

  test('returns a valid arrival in the canonical API format', () => {
    const result = validateConsignmentDetails(
      {
        ...validPayload,
        port: 'FELIXSTOWE',
        'arrival-day': '5',
        'arrival-month': 'sept',
        'arrival-year': '2026',
        'arrival-hour': '9',
        'arrival-minute': '5'
      },
      new Date('2026-01-01T00:00:00Z')
    )

    expect(result.arrival).toEqual({
      portOfEntry: 'FELIXSTOWE',
      expectedArrivalDate: '2026-09-05',
      expectedArrivalTime: '09:05'
    })
  })

  test('reports one combined minimum-window error for past arrivals', () => {
    const { errors } = validate({
      'arrival-day': '18',
      'arrival-hour': '01',
      'arrival-minute': '00'
    })

    expect(errors.arrival.text).toBe(
      'The expected date and time of arrival must be at least 2 hours in the future'
    )
    expect(errors.date).toBeUndefined()
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
  ])(
    'requires at least two hours including submission seconds: 16:%s',
    (minute, valid) => {
      const { errors } = validate({
        'arrival-day': '19',
        'arrival-hour': '16',
        'arrival-minute': minute
      })

      expect(Object.values(errors).filter(Boolean)).toEqual(
        valid
          ? []
          : [
              {
                text: 'The expected date and time of arrival must be at least 2 hours in the future',
                fields: [
                  'arrival-day',
                  'arrival-month',
                  'arrival-year',
                  'arrival-hour',
                  'arrival-minute'
                ]
              }
            ]
      )
    }
  )

  test.each([
    [
      '2026-11-19T14:30:00Z',
      { 'arrival-day': '19', 'arrival-hour': '16', 'arrival-minute': '29' },
      false
    ],
    [
      '2026-11-19T14:30:00Z',
      { 'arrival-day': '19', 'arrival-hour': '16', 'arrival-minute': '30' },
      true
    ],
    [
      '2026-11-19T14:30:00.001Z',
      { 'arrival-day': '19', 'arrival-hour': '16', 'arrival-minute': '30' },
      false
    ],
    [
      '2026-11-19T23:00:00Z',
      { 'arrival-hour': '00', 'arrival-minute': '30' },
      false
    ],
    [
      '2026-11-19T23:00:00Z',
      { 'arrival-hour': '01', 'arrival-minute': '00' },
      true
    ],
    [
      '2026-03-29T00:30:00Z',
      {
        'arrival-day': '29',
        'arrival-month': '3',
        'arrival-hour': '03',
        'arrival-minute': '29'
      },
      false
    ],
    [
      '2026-03-29T00:30:00Z',
      {
        'arrival-day': '29',
        'arrival-month': '3',
        'arrival-hour': '03',
        'arrival-minute': '30'
      },
      true
    ],
    [
      '2026-10-25T00:30:00Z',
      {
        'arrival-day': '25',
        'arrival-month': '10',
        'arrival-hour': '02',
        'arrival-minute': '29'
      },
      false
    ],
    [
      '2026-10-25T00:30:00Z',
      {
        'arrival-day': '25',
        'arrival-month': '10',
        'arrival-hour': '02',
        'arrival-minute': '30'
      },
      true
    ]
  ])(
    'measures two elapsed hours across midnight and clock changes: %s %j',
    (clock, fields, valid) => {
      const { errors } = validate(fields, new Date(clock))
      expect(
        Object.values(errors)
          .filter(Boolean)
          .map(({ text }) => text)
      ).toEqual(
        valid
          ? []
          : [
              'The expected date and time of arrival must be at least 2 hours in the future'
            ]
      )
    }
  )

  test.each([
    ['2026-11-19T14:30:00Z', '2027', '11', '19', '14', '30', true],
    ['2026-11-19T14:30:45Z', '2027', '11', '19', '14', '30', true],
    ['2026-11-19T14:30:45Z', '2027', '11', '19', '14', '31', false],
    ['2026-11-19T14:30:45Z', '2027', '11', '20', '00', '00', false],
    ['2027-03-01T09:30:00Z', '2028', '3', '1', '09', '30', true],
    ['2027-03-01T09:30:00Z', '2028', '3', '1', '09', '31', false],
    ['2026-03-28T14:30:45Z', '2027', '3', '28', '14', '30', true],
    ['2026-03-28T14:30:45Z', '2027', '3', '28', '14', '31', false],
    ['2025-10-25T00:30:00Z', '2026', '10', '25', '01', '30', true],
    ['2025-10-25T00:30:00Z', '2026', '10', '25', '01', '31', false]
  ])(
    'enforces an inclusive calendar-year cutoff from %s at %s-%s-%s %s:%s',
    (clock, year, month, day, hour, minute, valid) => {
      const { errors } = validate(
        {
          'arrival-year': year,
          'arrival-month': month,
          'arrival-day': day,
          'arrival-hour': hour,
          'arrival-minute': minute
        },
        new Date(clock)
      )

      expect(Object.values(errors).filter(Boolean)).toEqual(
        valid
          ? []
          : [
              {
                text: 'The expected date and time of arrival must be no more than 1 year in the future',
                fields: [
                  'arrival-day',
                  'arrival-month',
                  'arrival-year',
                  'arrival-hour',
                  'arrival-minute'
                ]
              }
            ]
      )
    }
  )

  test.each([
    ['28', '2', '30', true],
    ['28', '2', '31', false],
    ['1', '3', '00', false]
  ])(
    'clamps a leap-day anniversary to 28 February: %s/%s 09:%s',
    (day, month, minute, valid) => {
      const { errors } = validate(
        {
          'arrival-day': day,
          'arrival-month': month,
          'arrival-year': '2029',
          'arrival-hour': '09',
          'arrival-minute': minute
        },
        new Date('2028-02-29T09:30:00Z')
      )

      expect(
        Object.values(errors)
          .filter(Boolean)
          .map(({ text }) => text)
      ).toEqual(
        valid
          ? []
          : [
              'The expected date and time of arrival must be no more than 1 year in the future'
            ]
      )
    }
  )

  test.each([
    ['28', '02', '30', true],
    ['28', '02', '31', false],
    ['29', '09', '00', false]
  ])(
    'moves a nonexistent anniversary forward by the spring-clock gap: %s March %s:%s',
    (day, hour, minute, valid) => {
      const { errors } = validate(
        {
          'arrival-day': day,
          'arrival-month': '3',
          'arrival-year': '2027',
          'arrival-hour': hour,
          'arrival-minute': minute
        },
        new Date('2026-03-28T01:30:00Z')
      )

      expect(
        Object.values(errors)
          .filter(Boolean)
          .map(({ text }) => text)
      ).toEqual(
        valid
          ? []
          : [
              'The expected date and time of arrival must be no more than 1 year in the future'
            ]
      )
    }
  )

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
    const belowMinimum = validate(
      {
        'arrival-day': '2',
        'arrival-month': '7',
        'arrival-hour': '2',
        'arrival-minute': '30'
      },
      clock
    )
    const afterMinimum = validate(
      {
        'arrival-day': '2',
        'arrival-month': '7',
        'arrival-hour': '2',
        'arrival-minute': '31'
      },
      clock
    )

    expect(past.errors.arrival).toBeDefined()
    expect(belowMinimum.errors.date).toBeUndefined()
    expect(belowMinimum.errors.arrival).toBeDefined()
    expect(Object.values(afterMinimum.errors).filter(Boolean)).toEqual([])
  })

  test.each([
    ['2026-03-29T01:30:45Z', '29', '3', '4', '31'],
    ['2026-10-25T01:30:45Z', '25', '10', '3', '31']
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

  test.each([
    ['2026-10-24T22:30:00Z', true],
    ['2026-10-24T23:00:00Z', false],
    ['2026-10-25T00:30:00Z', false]
  ])(
    'always uses the first occurrence of a repeated UK arrival time: %s',
    (clock, valid) => {
      const { errors } = validate(
        {
          'arrival-day': '25',
          'arrival-month': '10',
          'arrival-hour': '01',
          'arrival-minute': '30'
        },
        new Date(clock)
      )

      expect(
        Object.values(errors)
          .filter(Boolean)
          .map(({ text }) => text)
      ).toEqual(
        valid
          ? []
          : [
              'The expected date and time of arrival must be at least 2 hours in the future'
            ]
      )
    }
  )

  test.each([
    [
      { 'arrival-day': '18', 'arrival-hour': '' },
      'The expected time of arrival must include an hour',
      ['arrival-hour']
    ],
    [
      { 'arrival-year': '2028', 'arrival-minute': '60' },
      'Enter a time using an hour from 0 to 23 and a minute from 0 to 59',
      ['arrival-minute']
    ],
    [
      { 'arrival-day': '', 'arrival-hour': '01' },
      'The expected date of arrival must include a day',
      ['arrival-day']
    ],
    [
      { 'arrival-day': '32', 'arrival-hour': '01' },
      'The expected date of arrival must be a real date',
      ['arrival-day']
    ]
  ])(
    'skips the arrival window for incomplete or malformed date/time parts: %j',
    (fields, text, affected) => {
      expect(Object.values(validate(fields).errors).filter(Boolean)).toEqual([
        { text, fields: affected }
      ])
    }
  )

  test('preserves original strings while validating trimmed values', () => {
    const payload = {
      ...validPayload,
      port: ' DOVER ',
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
        text: 'Enter a CHED reference in the correct format, like CHEDP.GB.2026.1234567',
        fields: ['ched-reference']
      })
    })

    test.each([
      ['CHEDP.XI.2025.1234567', 'CHEDP.XI.2025.1234567'],
      ['CHEDP.GB.2026.1234567', 'CHEDP.GB.2026.1234567'],
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
