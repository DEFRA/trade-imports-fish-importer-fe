const ukClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

// Store UK wall-clock fields as UTC fields for calendar arithmetic.
export function ukDate(instant) {
  const clock = Object.fromEntries(
    ukClock
      .formatToParts(instant)
      .map(({ type, value }) => [type, Number(value)])
  )
  const date = new Date(0)
  date.setUTCFullYear(clock.year, clock.month - 1, clock.day)
  date.setUTCHours(
    clock.hour,
    clock.minute,
    clock.second,
    instant.getUTCMilliseconds()
  )
  return date
}
