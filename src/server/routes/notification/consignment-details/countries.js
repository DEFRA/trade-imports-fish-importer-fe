import { readFileSync } from 'node:fs'

// Temporary country data until the MDM country source is available.
// Entries without two-letter codes cannot yet be saved by the backend.
export const countries = JSON.parse(
  readFileSync(new URL('./countries.json', import.meta.url), 'utf8')
).filter((country) => /^[A-Z]{2}$/.test(country.value))

export function findCountry(value) {
  return countries.find((country) => country.value === value)
}

// The SPS exemption is deferred until MDM provides country data.
export function isRestOfWorld(country) {
  return !country.eu27
}
