import { readFile } from 'node:fs/promises'

let cached

const identity = (value) => value.trim().toLowerCase()

function validateCommodities(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Invalid commodity reference data')
  }
  const codes = new Set()
  for (const commodity of data) {
    if (
      typeof commodity?.code !== 'string' ||
      !commodity.code.trim() ||
      typeof commodity.name !== 'string' ||
      !commodity.name.trim() ||
      !Array.isArray(commodity.species)
    ) {
      throw new Error('Invalid commodity reference data')
    }
    const code = identity(commodity.code)
    if (codes.has(code)) {
      throw new Error('Duplicate commodity code in reference data')
    }
    codes.add(code)
    const names = new Map()
    const speciesCodes = new Set()
    for (const species of commodity.species) {
      if (
        typeof species?.faoCode !== 'string' ||
        !species.faoCode.trim() ||
        typeof species.commonName !== 'string' ||
        !species.commonName.trim() ||
        (species.scientificName != null &&
          typeof species.scientificName !== 'string')
      ) {
        throw new Error('Invalid species reference data')
      }
      const speciesCode = identity(species.faoCode)
      const name = identity(species.commonName).replace(/\s+/g, ' ')
      if (speciesCodes.has(speciesCode) || names.has(name)) {
        throw new Error('Ambiguous species reference data')
      }
      speciesCodes.add(speciesCode)
      names.set(name, speciesCode)
    }
  }
  return data
}

async function loadCommodities() {
  const data = JSON.parse(
    await readFile(new URL('./commodities.json', import.meta.url), 'utf8')
  )
  return validateCommodities(data)
}

export async function getCommodities() {
  if (!cached) {
    cached = loadCommodities().catch((error) => {
      cached = undefined
      throw error
    })
  }
  return cached
}
