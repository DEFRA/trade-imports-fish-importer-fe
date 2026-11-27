import { ports } from './ports.js'
import { ukDate } from './uk-date.js'

const dateFields = ['arrival-day', 'arrival-month', 'arrival-year']
const [dayField, monthField, yearField] = dateFields
const timeFields = ['arrival-hour', 'arrival-minute']
const maxDayOfMonth = 31
const monthAbbreviationLength = 3
const maxHour = 23
const maxMinute = 59
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

function error(text, fields) {
  return { text, fields }
}

function missingParts(values, fields, label) {
  const missing = fields.filter((field) => !values[field].trim())
  if (missing.length === 0) {
    return undefined
  }
  if (missing.length === fields.length) {
    return error(`Enter the ${label}`, fields)
  }
  const names = missing.map((field) => field.split('-')[1]).join(' and ')
  const article = names.startsWith('hour') ? 'an' : 'a'
  return error(`The ${label} must include ${article} ${names}`, missing)
}

function monthNumber(value) {
  if (/^\d{1,2}$/.test(value)) {
    return Number(value)
  }
  const lower = value.toLowerCase()
  const name = lower === 'sept' ? 'sep' : lower
  return (
    months.findIndex(
      (month) =>
        name === month || name === month.slice(0, monthAbbreviationLength)
    ) + 1
  )
}

function parseDateParts(dayText, monthText, yearText) {
  const day = Number(dayText)
  const month = monthNumber(monthText)
  const year = Number(yearText)
  const invalidFields = []
  if (!/^\d{1,2}$/.test(dayText) || day < 1 || day > maxDayOfMonth) {
    invalidFields.push(dayField)
  }
  if (month < 1 || month > months.length) {
    invalidFields.push(monthField)
  }
  if (!/^\d{4}$/.test(yearText) || year < 1) {
    invalidFields.push(yearField)
  }
  return { day, month, year, invalidFields }
}

function validateDate(values) {
  const missing = missingParts(values, dateFields, 'expected date of arrival')
  if (missing) {
    return { error: missing }
  }

  const [dayText, monthText, yearText] = dateFields.map((field) =>
    values[field].trim()
  )
  if (/^\d+$/.test(yearText) && yearText.length !== 4) {
    return {
      error: error('Year must include 4 numbers', [yearField])
    }
  }

  const { day, month, year, invalidFields } = parseDateParts(
    dayText,
    monthText,
    yearText
  )
  if (invalidFields.length) {
    return {
      error: error(
        'The expected date of arrival must be a real date',
        invalidFields.length > 1 ? dateFields : invalidFields
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

  return { date: calendarDate }
}

function validateTime(values) {
  const missing = missingParts(values, timeFields, 'expected time of arrival')
  if (missing) {
    return missing
  }

  const hourText = values['arrival-hour'].trim()
  const minuteText = values['arrival-minute'].trim()
  const invalid = []
  if (!/^\d{1,2}$/.test(hourText) || Number(hourText) > maxHour) {
    invalid.push('arrival-hour')
  }
  if (!/^\d{1,2}$/.test(minuteText) || Number(minuteText) > maxMinute) {
    invalid.push('arrival-minute')
  }
  if (invalid.length === 0) {
    return undefined
  }
  return error(
    `Enter a time using an hour from 0 to ${maxHour} and a minute from 0 to ${maxMinute}`,
    invalid
  )
}

function ukInstants(date) {
  const offsets = new Set(
    [0, -1, 1].map((days) => {
      const instant = new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
      return ukDate(instant).getTime() - instant.getTime()
    })
  )
  return [...offsets]
    .map((offset) => date.getTime() - offset)
    .sort((first, second) => first - second)
}

function ukInstant(date) {
  return ukInstants(date).find(
    (instant) => ukDate(new Date(instant)).getTime() === date.getTime()
  )
}

function validateArrival(values, date, now) {
  date.setUTCHours(
    Number(values['arrival-hour']),
    Number(values['arrival-minute'])
  )
  const arrival = ukInstant(date)
  if (arrival === undefined) {
    return {
      time: error(
        'The expected time of arrival does not exist on this date because the UK clocks go forward',
        timeFields
      )
    }
  }
  if (arrival < now.getTime() + 2 * 60 * 60 * 1000) {
    return {
      arrival: error(
        'The expected date and time of arrival must be at least 2 hours in the future',
        [...dateFields, ...timeFields]
      )
    }
  }
  const latest = ukDate(now)
  const month = latest.getUTCMonth()
  latest.setUTCFullYear(latest.getUTCFullYear() + 1)
  if (latest.getUTCMonth() !== month) {
    latest.setUTCDate(0)
  }
  // Move a spring-gap anniversary forward, rather than rejecting the cutoff.
  const latestInstant = ukInstant(latest) ?? Math.max(...ukInstants(latest))
  if (arrival > latestInstant) {
    return {
      arrival: error(
        'The expected date and time of arrival must be no more than 1 year in the future',
        [...dateFields, ...timeFields]
      )
    }
  }
  return {}
}

export function validateConsignmentDetails(payload, now = new Date()) {
  const values = Object.fromEntries(
    ['port', ...dateFields, ...timeFields].map((field) => [
      field,
      typeof payload?.[field] === 'string' ? payload[field] : ''
    ])
  )
  const date = validateDate(values)
  const time = validateTime(values)
  const port = values.port.trim()
  const errors = {
    port: !ports.some((option) => option.value === port)
      ? error('Select a port of entry from the list', ['port'])
      : undefined,
    date: date.error,
    time
  }
  if (!date.error && !time) {
    Object.assign(errors, validateArrival(values, date.date, now))
  }

  const arrival = Object.values(errors).some(Boolean)
    ? undefined
    : {
        portOfEntry: port,
        expectedArrivalDate: date.date.toISOString().slice(0, 10),
        expectedArrivalTime: `${values['arrival-hour'].trim().padStart(2, '0')}:${values['arrival-minute'].trim().padStart(2, '0')}`
      }

  return { values, errors, arrival }
}
