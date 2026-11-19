import Joi from 'joi'

import { config } from '#/config/config.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { transportModes } from '#/server/common/constants/transport-methods.js'

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
      .required()
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

function verifyNotification(notification, id, payload) {
  if (notification.id !== id) {
    throw new Error('Notification API returned a different draft identity')
  }
  if (
    payload &&
    (notification.organisationId !== payload.organisationId ||
      notification.notification.transport.mode !==
        payload.notification.transport.mode)
  ) {
    throw new Error(
      'Notification API response does not match the saved details'
    )
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
    throw new Error(
      `Notification API ${method} failed with status ${response.status}`
    )
  }

  const notification = await notificationSchema.validateAsync(
    await response.json()
  )
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
