import Joi from 'joi'

import { getCommodities } from '#/server/services/reference-data/commodities.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import {
  loadDraft,
  saveCommodities
} from '#/server/services/notifications/draft-session.js'

const speciesSchema = Joi.object({
  speciesCode: Joi.string().trim().min(1).required(),
  commonName: Joi.string().trim().min(1).required(),
  scientificName: Joi.string().optional(),
  netWeightKg: Joi.number().greater(0).max(Number.MAX_VALUE).required()
}).unknown(false)

const commodityListSchema = Joi.array()
  .items(
    Joi.object({
      commodityCode: Joi.string().trim().min(1).required(),
      description: Joi.string().optional(),
      species: Joi.array().items(speciesSchema).min(1).required(),
      totalNetWeightKg: Joi.number().greater(0).max(Number.MAX_VALUE).required()
    }).unknown(false)
  )
  .min(1)
  .required()

function normalizeCode(code) {
  return code.trim().toLowerCase()
}

function invalidCommodityDetails(message = 'Invalid commodity details') {
  return Object.assign(new Error(message), {
    statusCode: statusCodes.badRequest
  })
}

function parseCommodityList(field) {
  if (typeof field !== 'string') {
    return field
  }
  try {
    return JSON.parse(field)
  } catch {
    throw invalidCommodityDetails()
  }
}

function validateCommodityListShape(commodities) {
  const { error, value } = commodityListSchema.validate(commodities)
  if (error) {
    throw invalidCommodityDetails()
  }
  return value
}

function assertUniqueCodes(entries, codeField) {
  const codes = entries.map((entry) => normalizeCode(entry[codeField]))
  if (new Set(codes).size !== codes.length) {
    throw invalidCommodityDetails()
  }
}

function assertTotalMatchesSpeciesWeights(commodity) {
  const total = commodity.species.reduce(
    (sum, species) => sum + species.netWeightKg,
    0
  )
  if (!Number.isFinite(total) || total !== commodity.totalNetWeightKg) {
    throw invalidCommodityDetails()
  }
}

function validateSubmittedCommodities(payload) {
  const commodities = validateCommodityListShape(
    parseCommodityList(payload?.commodities)
  )
  assertUniqueCodes(commodities, 'commodityCode')
  for (const commodity of commodities) {
    assertUniqueCodes(commodity.species, 'speciesCode')
    assertTotalMatchesSpeciesWeights(commodity)
  }
  return commodities
}

function resolveSpeciesSelection(species, speciesReferences) {
  const code = normalizeCode(species.speciesCode)
  const reference = speciesReferences.find(
    (entry) => normalizeCode(entry.faoCode) === code
  )
  if (!reference) {
    throw invalidCommodityDetails('Species is not listed for commodity')
  }

  return {
    speciesCode: reference.faoCode,
    commonName: reference.commonName,
    ...(reference.scientificName
      ? { scientificName: reference.scientificName }
      : {}),
    netWeightKg: species.netWeightKg
  }
}

function resolveCommoditySelection(commodity, referenceData) {
  const code = normalizeCode(commodity.commodityCode)
  const reference = referenceData.find(
    (entry) => normalizeCode(entry.code) === code
  )
  if (!reference) {
    throw invalidCommodityDetails('Unknown commodity code')
  }

  return {
    commodityCode: reference.code,
    description: reference.name,
    totalNetWeightKg: commodity.totalNetWeightKg,
    species: commodity.species.map((species) =>
      resolveSpeciesSelection(species, reference.species)
    )
  }
}

function resolveCommoditySelections(commodities, referenceData) {
  return commodities.map((commodity) =>
    resolveCommoditySelection(commodity, referenceData)
  )
}

function renderReferenceDataUnavailable(h, logger, error) {
  logger.error({ err: error }, 'Reference data unavailable')
  return h
    .view('error/index', {
      pageTitle: 'Commodity service unavailable',
      heading: 'Commodity service unavailable',
      message: 'Try again later.'
    })
    .code(statusCodes.serviceUnavailable)
}

function renderCommodityDetailsForm(h, referenceData, savedCommodities) {
  return h.view('notification/commodity-details/index', {
    pageTitle: 'Tell us about the seafood you are importing',
    referenceData: JSON.stringify(referenceData),
    savedCommodities: JSON.stringify(savedCommodities ?? [])
  })
}

async function saveSubmittedCommodities(request) {
  const submitted = validateSubmittedCommodities(request.payload)
  const referenceData = await getCommodities(request.logger)
  const commodities = resolveCommoditySelections(submitted, referenceData)
  await saveCommodities(request, commodities)
}

function describeCommoditySaveError(error) {
  if (error.statusCode === statusCodes.badRequest) {
    return {
      statusCode: statusCodes.badRequest,
      message: 'Check the commodity details and try again.'
    }
  }
  if (error.statusCode === statusCodes.conflict) {
    return { statusCode: statusCodes.conflict, message: error.message }
  }
  return {
    statusCode: statusCodes.internalServerError,
    message:
      'We could not confirm that your commodity details were saved. Try again later.'
  }
}

function respondWithCommoditySaveError(h, logger, error) {
  logger.error({ err: error }, 'Failed to save commodities')
  const { statusCode, message } = describeCommoditySaveError(error)
  return h.response({ message }).type('application/json').code(statusCode)
}

export const getCommodityDetailsController = {
  async handler(request, h) {
    let referenceData
    try {
      referenceData = await getCommodities(request.logger)
    } catch (error) {
      return renderReferenceDataUnavailable(h, request.logger, error)
    }

    const draft = await loadDraft(request)
    if (!draft) {
      return h
        .redirect('/notification/transport-details')
        .code(statusCodes.seeOther)
    }

    return renderCommodityDetailsForm(h, referenceData, draft.commodities)
  }
}

export const postCommodityDetailsController = {
  async handler(request, h) {
    try {
      await saveSubmittedCommodities(request)
      return h
        .response({ success: true })
        .type('application/json')
        .code(statusCodes.ok)
    } catch (error) {
      return respondWithCommoditySaveError(h, request.logger, error)
    }
  }
}
