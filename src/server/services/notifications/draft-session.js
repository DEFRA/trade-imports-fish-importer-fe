import { randomUUID } from 'node:crypto'

import { notificationsClient } from './client.js'

const sessionKey = 'notificationDraft'
const startedKey = 'notificationStartedJourneys'

function organisationOf(request) {
  const organisationId = request.auth?.credentials?.organisationId
  if (typeof organisationId !== 'string' || !organisationId) {
    throw new Error('No signed-in importer organisation')
  }
  return organisationId
}

// Ignore drafts started under another organisation, e.g. after a different user signs in.
export function currentDraft(request) {
  const draft = request.yar.get(sessionKey)
  return draft?.organisationId === organisationOf(request) ? draft : null
}

export function startDraft(request, id) {
  const startedIds = request.yar.get(startedKey) ?? []
  if (startedIds.includes(id)) {
    return
  }
  request.yar.set(startedKey, [...startedIds, id])
  request.yar.set(sessionKey, {
    id,
    organisationId: organisationOf(request),
    saved: false
  })
}

async function remember(request, notification) {
  await request.server.app.savedNotificationDrafts.set(notification.id, {
    reference: notification.reference,
    organisationId: notification.organisationId
  })
}

async function findDraft(request, draft) {
  const saved = await request.server.app.savedNotificationDrafts.get(draft.id)
  const notification = await notificationsClient.find(request, draft.id)
  if (!notification) {
    if (draft.saved || saved) {
      throw new Error('The saved notification draft could not be found')
    }
    return null
  }
  if (notification.organisationId !== organisationOf(request)) {
    throw new Error(
      'Draft does not belong to the current importer organisation'
    )
  }
  if (
    (draft.reference && notification.reference !== draft.reference) ||
    (saved &&
      (notification.reference !== saved.reference ||
        notification.organisationId !== saved.organisationId))
  ) {
    throw new Error('Draft reference has unexpectedly changed')
  }
  return notification
}

export async function loadDraft(request) {
  const draft = currentDraft(request)
  if (!draft) {
    request.yar.set(sessionKey, {
      id: randomUUID(),
      organisationId: organisationOf(request),
      saved: false
    })
    return null
  }
  const notification = await findDraft(request, draft)
  if (notification) {
    await remember(request, notification)
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
    await remember(request, existing)
  }
  const payload = { organisationId: organisationOf(request), transportMethod }
  const notification = existing
    ? await notificationsClient.update(request, draft.id, payload)
    : await notificationsClient.create(request, draft.id, payload)
  if (existing && notification.reference !== existing.reference) {
    throw new Error('Draft reference has unexpectedly changed during save')
  }
  await remember(request, notification)
  return notification
}
