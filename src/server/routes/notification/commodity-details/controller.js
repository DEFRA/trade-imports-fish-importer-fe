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

function submittedCommodities(payload) {
  try {
    const parsed =
      typeof payload?.commodities === 'string'
        ? JSON.parse(payload.commodities)
        : payload?.commodities
    const { error, value } = commodityListSchema.validate(parsed)
    if (error) {
      throw error
    }
    const commodityCodes = new Set()
    for (const commodity of value) {
      const code = commodity.commodityCode.trim().toLowerCase()
      if (commodityCodes.has(code)) {
        throw new Error('Duplicate commodity code')
      }
      commodityCodes.add(code)

      const speciesCodes = new Set()
      let total = 0
      for (const species of commodity.species) {
        const speciesCode = species.speciesCode.trim().toLowerCase()
        if (speciesCodes.has(speciesCode)) {
          throw new Error('Duplicate species code')
        }
        speciesCodes.add(speciesCode)
        total += species.netWeightKg
      }
      if (!Number.isFinite(total) || total !== commodity.totalNetWeightKg) {
        throw new Error('Commodity total does not match species weights')
      }
    }
    return value
  } catch {
    const error = new Error('Invalid commodity details')
    error.statusCode = statusCodes.badRequest
    throw error
  }
}

function saveErrorMessage(statusCode, error) {
  if (statusCode === statusCodes.badRequest) {
    return 'Check the commodity details and try again.'
  }
  if (statusCode === statusCodes.conflict) {
    return error.message
  }
  return 'We could not confirm that your commodity details were saved. Try again later.'
}

export const getCommodityDetailsController = {
  async handler(request, h) {
    let commodities
    try {
      commodities = await getCommodities(request.logger)
    } catch (error) {
      request.logger.error({ err: error }, 'Reference data unavailable')
      return h
        .view('error/index', {
          pageTitle: 'Commodity service unavailable',
          heading: 'Commodity service unavailable',
          message: 'Try again later.'
        })
        .code(statusCodes.serviceUnavailable)
    }
    const draft = await loadDraft(request)
    if (!draft) {
      return h
        .redirect('/notification/transport-details')
        .code(statusCodes.seeOther)
    }

    return h.view('notification/commodity-details/index', {
      pageTitle: 'Tell us about the seafood you are importing',
      referenceData: JSON.stringify(commodities),
      savedCommodities: JSON.stringify(draft.commodities ?? [])
    })
  }
}

export const postCommodityDetailsController = {
  async handler(request, h) {
    try {
      const commodities = submittedCommodities(request.payload)
      await saveCommodities(request, commodities)
      return h
        .response({ success: true })
        .type('application/json')
        .code(statusCodes.ok)
    } catch (error) {
      request.logger.error({ err: error }, 'Failed to save commodities')
      const statusCode =
        error.statusCode === statusCodes.badRequest ||
        error.statusCode === statusCodes.conflict
          ? error.statusCode
          : statusCodes.internalServerError
      const message = saveErrorMessage(statusCode, error)
      return h.response({ message }).type('application/json').code(statusCode)
    }
  }
}
