import Joi from 'joi'

import { config } from '#/config/config.js'
import { transportMethods } from '#/server/common/constants/transport-methods.js'

const notificationSchema = Joi.object({
  id: Joi.string().uuid().required(),
  reference: Joi.string()
    .pattern(/^GBN-FIS-\d{2}-[0-9A-Z]{5}$/)
    .required(),
  status: Joi.string().valid('DRAFT').required(),
  organisationId: Joi.string().required(),
  transportMethod: Joi.string()
    .valid(...transportMethods.map(({ value }) => value))
    .required(),
  createdAt: Joi.string().isoDate().strict().required(),
  updatedAt: Joi.string().isoDate().strict().required()
}).unknown(true)

async function send(request, id, method, payload) {
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

  const path = method === 'POST' ? '/notifications' : `/notifications/${id}`
  const response = await fetch(
    new URL(path, config.get('notificationApiUrl')),
    {
      method,
      headers,
      redirect: 'manual',
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(10000)
    }
  )

  if (method === 'GET' && response.status === 404) {
    await response.body?.cancel()
    return null
  }
  const expectedStatuses = method === 'POST' ? [200, 201] : [200]
  if (!expectedStatuses.includes(response.status)) {
    await response.body?.cancel()
    throw new Error(
      `Notification API ${method} failed with status ${response.status}`
    )
  }

  const notification = await notificationSchema.validateAsync(
    await response.json()
  )
  if (notification.id !== id) {
    throw new Error('Notification API returned a different draft identity')
  }
  if (
    payload &&
    (notification.organisationId !== payload.organisationId ||
      notification.transportMethod !== payload.transportMethod)
  ) {
    throw new Error(
      'Notification API response does not match the saved details'
    )
  }
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
    return send(request, id, 'PUT', payload)
  }
}
