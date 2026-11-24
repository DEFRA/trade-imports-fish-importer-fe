// Working assumption: all FIS CHEDs are CHED-P, for example CHEDP.GB.2026.1234567
export const CHED_REFERENCE_PATTERN = /^CHEDP\.GB\.\d{4}\.\d{7}$/

// Provisional text (IPR1-D26)
export const messages = {
  countryMissing: 'Select a country of export from the list',
  chedMissing: 'Enter a CHED reference',
  chedFormat:
    'Enter a CHED reference in the correct format, like CHEDP.GB.2026.1234567'
}

export function normaliseChedReference(value) {
  return value.trim().toUpperCase()
}
