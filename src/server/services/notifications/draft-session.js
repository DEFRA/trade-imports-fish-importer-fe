import { randomUUID } from 'node:crypto'

import { notificationsClient } from './client.js'

const sessionKey = 'notificationDraft'

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

function remember(request, notification) {
  request.yar.set(sessionKey, {
    id: notification.id,
    reference: notification.reference,
    organisationId: notification.organisationId,
    saved: true
  })
}

async function findDraft(request, draft) {
  const notification = await notificationsClient.find(request, draft.id)
  if (!notification) {
    if (draft.saved) {
      throw new Error('The saved notification draft could not be found')
    }
    return null
  }
  if (notification.organisationId !== organisationOf(request)) {
    throw new Error(
      'Draft does not belong to the current importer organisation'
    )
  }
  if (draft.reference && notification.reference !== draft.reference) {
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
  const payload = { organisationId: organisationOf(request), transportMethod }
  const notification = existing
    ? await notificationsClient.update(request, draft.id, payload)
    : await notificationsClient.create(request, draft.id, payload)
  if (existing && notification.reference !== existing.reference) {
    throw new Error('Draft reference has unexpectedly changed during save')
  }
  remember(request, notification)
  return notification
}
