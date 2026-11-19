import { ports } from './ports.js'

const dateFields = ['arrival-day', 'arrival-month', 'arrival-year']
const timeFields = ['arrival-hour', 'arrival-minute']
const months = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
]
const ukClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

function error(text, fields) {
  return { text, fields }
}

function missingParts(values, fields, label) {
  const missing = fields.filter((field) => !values[field].trim())
  if (missing.length === fields.length) {
    return error(`Enter the ${label}`, fields)
  }
  if (missing.length) {
    const names = missing.map((field) => field.split('-')[1]).join(' and ')
    const article = names.startsWith('hour') ? 'an' : 'a'
    return error(`The ${label} must include ${article} ${names}`, missing)
  }
}

function monthNumber(value) {
  if (/^\d{1,2}$/.test(value)) {
    return Number(value)
  }
  const name = value.toLowerCase()
  if (name === 'sept') {
    return 9
  }
  return (
    months.findIndex((month) => name === month || name === month.slice(0, 3)) +
    1
  )
}

function validateDate(values, today) {
  const missing = missingParts(values, dateFields, 'expected date of arrival')
  if (missing) {
    return { error: missing }
  }

  const [dayText, monthText, yearText] = dateFields.map((field) =>
    values[field].trim()
  )
  if (/^\d+$/.test(yearText) && yearText.length !== 4) {
    return {
      error: error('Year must include 4 numbers', ['arrival-year'])
    }
  }

  const day = Number(dayText)
  const month = monthNumber(monthText)
  const year = Number(yearText)
  const invalid = []
  if (!/^\d{1,2}$/.test(dayText) || day < 1 || day > 31) {
    invalid.push('arrival-day')
  }
  if (month < 1 || month > 12) {
    invalid.push('arrival-month')
  }
  if (!/^\d{4}$/.test(yearText) || year < 1) {
    invalid.push('arrival-year')
  }
  if (invalid.length) {
    return {
      error: error(
        'The expected date of arrival must be a real date',
        invalid.length > 1 ? dateFields : invalid
      )
    }
  }

  const calendarDate = new Date(0)
  calendarDate.setUTCFullYear(year, month - 1, day)
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return {
      error: error(
        'The expected date of arrival must be a real date',
        dateFields
      )
    }
  }

  const date = year * 10000 + month * 100 + day
  if (date < today) {
    return {
      error: error(
        'The expected date of arrival must be today or in the future',
        dateFields
      )
    }
  }
  return { date }
}

function validateTime(values, date, today, currentMinute) {
  const missing = missingParts(values, timeFields, 'expected time of arrival')
  if (missing) {
    return missing
  }

  const hourText = values['arrival-hour'].trim()
  const minuteText = values['arrival-minute'].trim()
  const invalid = []
  if (!/^\d{1,2}$/.test(hourText) || Number(hourText) > 23) {
    invalid.push('arrival-hour')
  }
  if (!/^\d{1,2}$/.test(minuteText) || Number(minuteText) > 59) {
    invalid.push('arrival-minute')
  }
  if (invalid.length) {
    return error(
      'Enter a time using an hour from 0 to 23 and a minute from 0 to 59',
      invalid
    )
  }

  const minute = Number(hourText) * 60 + Number(minuteText)
  if (date === today && minute <= currentMinute) {
    return error(
      'The expected time of arrival must be later than the current UK time',
      timeFields
    )
  }
}

export function validateConsignmentDetails(payload, now = new Date()) {
  const values = Object.fromEntries(
    ['port', ...dateFields, ...timeFields].map((field) => [
      field,
      typeof payload?.[field] === 'string' ? payload[field] : ''
    ])
  )
  const clock = Object.fromEntries(
    ukClock.formatToParts(now).map(({ type, value }) => [type, Number(value)])
  )
  const today = clock.year * 10000 + clock.month * 100 + clock.day
  const date = validateDate(values, today)
  const port = values.port.trim()
  const errors = {
    port: !ports.some((option) => option.value === port)
      ? error('Select a port of entry from the list', ['port'])
      : undefined,
    date: date.error,
    time: validateTime(values, date.date, today, clock.hour * 60 + clock.minute)
  }

  return { values, errors }
}
