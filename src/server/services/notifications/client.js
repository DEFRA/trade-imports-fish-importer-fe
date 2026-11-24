import Joi from 'joi'

import { config } from '#/config/config.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import {
  transportModes,
  toTransportMethod
} from '#/server/common/constants/transport-methods.js'

const speciesSchema = Joi.object({
  speciesCode: Joi.string().required(),
  commonName: Joi.string().required(),
  netWeightKg: Joi.number().required(),
  scientificName: Joi.string().allow(null).optional()
}).unknown(true)

const commoditySchema = Joi.object({
  commodityCode: Joi.string().required(),
  description: Joi.string().allow(null).optional(),
  species: Joi.array().items(speciesSchema).min(1).required(),
  totalNetWeightKg: Joi.number().required()
}).unknown(true)

const notificationSchema = Joi.object({
  id: Joi.string().uuid().required(),
  reference: Joi.string()
    .pattern(/^GBN-FIS-\d{2}-[0-9A-Z]{5}$/)
    .required(),
  status: Joi.string().valid('DRAFT').required(),
  organisationId: Joi.string().required(),
  notification: Joi.object({
    transport: Joi.object({
      mode: Joi.string()
        .valid(...transportModes.values())
        .required()
    })
      .unknown(true)
      .optional(),
    arrival: Joi.object({
      portOfEntry: Joi.string()
        .pattern(/^[A-Z0-9-]+$/)
        .required(),
      expectedArrivalDate: Joi.string()
        .pattern(/^\d{4}-\d{2}-\d{2}$/)
        .required(),
      expectedArrivalTime: Joi.string()
        .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
        .required(),
      expectedArrivalAt: Joi.string().isoDate().strict().required()
    }).unknown(true),
    countryOfExport: Joi.string()
      .pattern(/^[A-Z]{2}$/)
      .strict(),
    exportRegion: Joi.string().valid('EU', 'REST_OF_WORLD').strict(),
    ched: Joi.object({
      reference: Joi.string().allow('').strict()
    }).unknown(true),
    commodities: Joi.array().items(commoditySchema).allow(null).optional()
  })
    .unknown(true)
    .required(),
  createdAt: Joi.string().isoDate().strict().required(),
  updatedAt: Joi.string().isoDate().strict().required()
}).unknown(true)

const requestTimeoutMs = 10000

function buildHeaders(request, id, method, payload) {
  const headers = { accept: 'application/json' }
  const traceHeader = config.get('tracing.header')
  const traceId = request.headers[traceHeader]
  if (traceId) {
    headers[traceHeader] = traceId
  }
  if (payload) {
    headers['content-type'] = 'application/json'
  }
  if (method === 'POST') {
    headers['Idempotency-Key'] = id
  }
  return headers
}

function expectedStatuses(method) {
  return method === 'POST'
    ? [statusCodes.ok, statusCodes.created]
    : [statusCodes.ok]
}

function normalize(value) {
  return value.trim().toLowerCase()
}

function uniqueIdentities(values, key) {
  const identities = values.map((value) => normalize(value[key]))
  const set = new Set(identities)
  if (set.size !== identities.length) {
    throw new Error('Returned commodities or species are duplicated')
  }
  return set
}

function verifyCommodities(submitted, returned) {
  if (!Array.isArray(returned) || submitted.length !== returned.length) {
    throw new Error('Returned commodities do not match submitted list')
  }
  uniqueIdentities(submitted, 'commodityCode')
  uniqueIdentities(returned, 'commodityCode')

  for (const submittedCommodity of submitted) {
    const commodity = returned.find(
      (item) =>
        normalize(item.commodityCode) ===
        normalize(submittedCommodity.commodityCode)
    )
    if (
      !commodity ||
      commodity.totalNetWeightKg !== submittedCommodity.totalNetWeightKg ||
      (submittedCommodity.description !== undefined &&
        commodity.description !== submittedCommodity.description) ||
      !Array.isArray(commodity.species) ||
      commodity.species.length !== submittedCommodity.species.length
    ) {
      throw new Error('Returned commodities do not match submitted list')
    }

    const returnedCodes = uniqueIdentities(commodity.species, 'speciesCode')
    uniqueIdentities(submittedCommodity.species, 'speciesCode')
    for (const submittedSpecies of submittedCommodity.species) {
      const species = commodity.species.find(
        (item) =>
          normalize(item.speciesCode) ===
          normalize(submittedSpecies.speciesCode)
      )
      if (
        !species ||
        !returnedCodes.has(normalize(submittedSpecies.speciesCode)) ||
        species.commonName !== submittedSpecies.commonName ||
        species.netWeightKg !== submittedSpecies.netWeightKg ||
        (submittedSpecies.scientificName !== undefined &&
          species.scientificName !== submittedSpecies.scientificName)
      ) {
        throw new Error('Returned species do not match submitted list')
      }
    }
  }
}

function verifyNotification(notification, id, payload) {
  if (notification.id !== id) {
    throw new Error('Notification API returned a different draft identity')
  }
  if (payload) {
    const sentDetails = payload.notification
    const returnedDetails = notification.notification
    const detailsDiffer =
      sentDetails &&
      Object.entries(sentDetails).some(([section, fields]) => {
        // Skip commodities verification here - it's handled separately below
        if (section === 'commodities') {
          return false
        }
        const returned = notification.notification[section]
        if (typeof fields !== 'object' || fields === null) {
          return returned !== fields
        }
        return Object.entries(fields).some(
          ([field, value]) => returned?.[field] !== value
        )
      })
    const exportDetailsDiffer =
      sentDetails?.countryOfExport !== undefined &&
      (returnedDetails.exportRegion !==
        (sentDetails.ched ? 'REST_OF_WORLD' : 'EU') ||
        (!sentDetails.ched && returnedDetails.ched !== undefined))
    if (
      notification.organisationId !== payload.organisationId ||
      detailsDiffer ||
      exportDetailsDiffer
    ) {
      throw new Error(
        'Notification API response does not match the saved details'
      )
    }
  }
  const commodities = payload?.commodities ?? payload?.notification?.commodities
  if (commodities) {
    verifyCommodities(commodities, notification.commodities)
  }
}

async function send(request, id, method, payload) {
  const path = method === 'POST' ? '/notifications' : `/notifications/${id}`
  const response = await fetch(
    new URL(path, config.get('notificationApiUrl')),
    {
      method,
      headers: buildHeaders(request, id, method, payload),
      redirect: 'manual',
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(requestTimeoutMs)
    }
  )

  if (method === 'GET' && response.status === statusCodes.notFound) {
    await response.body?.cancel()
    return null
  }
  if (!expectedStatuses(method).includes(response.status)) {
    await response.body?.cancel()
    if (response.status === 409 && method !== 'GET') {
      const error = new Error(
        method === 'POST'
          ? 'The notification could not be created because the idempotency key conflicts with an existing request.'
          : 'The notification could not be updated because its status or organisation conflicts with this request.'
      )
      error.statusCode = 409
      throw error
    }
    throw new Error(
      `Notification API ${method} failed with status ${response.status}`
    )
  }

  const responseBody = await notificationSchema.validateAsync(
    await response.json()
  )
  const notification = {
    ...responseBody,
    transportMethod: responseBody.notification.transport?.mode
      ? toTransportMethod(responseBody.notification.transport.mode)
      : undefined,
    commodities: responseBody.notification.commodities
  }
  verifyNotification(notification, id, payload)
  return notification
}

export const notificationsClient = {
  find(request, id) {
    return send(request, id, 'GET')
  },
  create(request, id, payload) {
    return send(request, id, 'POST', payload)
  },
  update(request, id, payload) {
    return send(request, id, 'PATCH', payload)
  }
}
