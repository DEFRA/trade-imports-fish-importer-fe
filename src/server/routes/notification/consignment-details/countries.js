import { readFileSync } from 'node:fs'

// Temporary country data until the MDM country source is available.
// Non-EU SPS classifications are provisional pending confirmation.
// Territories without an ISO country code use temporary identifiers.
export const countries = JSON.parse(
  readFileSync(new URL('./countries.json', import.meta.url), 'utf8')
)

export function findCountry(value) {
  return countries.find((country) => country.value === value)
}

// Rest of the world means outside the EU-27 / SPS agreement (IPR1-D11).
export function isRestOfWorld(country) {
  return !country.eu27 && !country.spsAgreement
}
