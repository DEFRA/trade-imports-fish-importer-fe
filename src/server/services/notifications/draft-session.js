import { randomUUID } from 'node:crypto'

import { organisationId } from '#/server/common/constants/organisation.js'
import { notificationsClient } from './client.js'

const sessionKey = 'notificationDraft'

export function currentDraft(request) {
  return request.yar.get(sessionKey)
}

function remember(request, notification) {
  request.yar.set(sessionKey, {
    id: notification.id,
    reference: notification.reference,
    saved: true
  })
}

async function findDraft(request, draft) {
  const notification = await notificationsClient.find(request, draft.id)
  if (notification) {
    if (notification.organisationId !== organisationId) {
      throw new Error(
        'Draft does not belong to the current importer organisation'
      )
    }
    if (draft.reference && notification.reference !== draft.reference) {
      throw new Error('Draft reference has unexpectedly changed')
    }
  } else if (draft.saved) {
    throw new Error('The saved notification draft could not be found')
  }
  return notification
}

export async function loadDraft(request) {
  const draft = currentDraft(request)
  if (!draft) {
    request.yar.set(sessionKey, { id: randomUUID(), saved: false })
    return null
  }
  const notification = await findDraft(request, draft)
  if (notification) {
    remember(request, notification)
  }
  return notification
}

export async function saveDraft(request, transportMethod) {
  const draft = currentDraft(request)
  if (!draft) {
    throw new Error('No active notification journey')
  }
  // Recover a committed first save even when its response was lost.
  const existing = await findDraft(request, draft)
  if (existing) {
    remember(request, existing)
  }
  const payload = { organisationId, transportMethod }
  const notification = existing
    ? await notificationsClient.update(request, draft.id, payload)
    : await notificationsClient.create(request, draft.id, payload)
  if (existing && notification.reference !== existing.reference) {
    throw new Error('Draft reference has unexpectedly changed during save')
  }
  remember(request, notification)
  return notification
}
