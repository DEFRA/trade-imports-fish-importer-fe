import { readFile } from 'node:fs/promises'

import { config } from '#/config/config.js'

const seededCommodityEnvironments = new Set([
  'local',
  'dev',
  'test',
  'perf-test',
  'ext-test'
])
// The shared config defaults to local, but fallback requires an explicit value.
const canUseSeededCommodities = seededCommodityEnvironments.has(
  process.env.ENVIRONMENT
)

let commoditiesPromise

function validateCommodities(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Invalid commodity reference data')
  }

  const seenCommodityCodes = new Set()
  for (const commodity of data) {
    validateCommodityFields(commodity)

    const code = normalizeForComparison(commodity.code)
    if (seenCommodityCodes.has(code)) {
      throw new Error('Duplicate commodity code in reference data')
    }
    seenCommodityCodes.add(code)
    validateCommoditySpecies(commodity.species)
  }
  return data
}

function validateCommodityFields(commodity) {
  if (
    !isNonBlankString(commodity?.code) ||
    !isNonBlankString(commodity.name) ||
    !Array.isArray(commodity.species)
  ) {
    throw new Error('Invalid commodity reference data')
  }
}

function validateCommoditySpecies(speciesList) {
  const seenFaoCodes = new Set()
  const seenCommonNames = new Set()
  for (const species of speciesList) {
    validateSpeciesFields(species)

    const faoCode = normalizeForComparison(species.faoCode)
    const commonName = normalizeSpeciesCommonName(species.commonName)
    if (seenFaoCodes.has(faoCode) || seenCommonNames.has(commonName)) {
      throw new Error('Ambiguous species reference data')
    }
    seenFaoCodes.add(faoCode)
    seenCommonNames.add(commonName)
  }
}

function validateSpeciesFields(species) {
  if (
    !isNonBlankString(species?.faoCode) ||
    !isNonBlankString(species.commonName) ||
    (species.scientificName != null &&
      typeof species.scientificName !== 'string')
  ) {
    throw new Error('Invalid species reference data')
  }
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeForComparison(value) {
  return value.trim().toLowerCase()
}

function normalizeSpeciesCommonName(commonName) {
  return normalizeForComparison(commonName).replace(/\s+/g, ' ')
}

async function loadCommodities(logger) {
  try {
    return validateCommodities(await fetchCommodities())
  } catch (error) {
    if (!canUseSeededCommodities) {
      throw error
    }
    logger.warn({ err: error }, 'Using seeded commodity reference data')
    return validateCommodities(await readSeededCommodities())
  }
}

async function fetchCommodities() {
  const apiUrl = config.get('referenceDataApiUrl')
  const commoditiesPath = config.get('commoditiesPath')
  if (!apiUrl || !commoditiesPath) {
    throw new Error('Reference data API URL or commodities path is not set')
  }

  const response = await fetch(new URL(commoditiesPath, apiUrl), {
    redirect: 'manual',
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) {
    throw new Error(`Reference data API returned ${response.status}`)
  }
  return response.json()
}

async function readSeededCommodities() {
  const fixtureUrl = new URL('./commodities.json', import.meta.url)
  return JSON.parse(await readFile(fixtureUrl, 'utf8'))
}

export async function getCommodities(logger) {
  if (!commoditiesPromise) {
    commoditiesPromise = loadCommodities(logger).catch((error) => {
      commoditiesPromise = undefined
      throw error
    })
  }
  return commoditiesPromise
}
