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

async function journeyStore(request) {
  const store = request.server.app.notificationJourneyStore
  const legacy = request.yar.get(sessionKey)
  if (legacy) {
    await store.initialize(
      request.yar.id,
      legacy,
      request.yar.get(startedKey) ?? []
    )
  }
  return store
}

// Ignore drafts started under another organisation, e.g. after a different user signs in.
export async function currentDraft(request) {
  const draft = await (await journeyStore(request)).get(request.yar.id)
  return draft?.organisationId === organisationOf(request) ? draft : null
}

export async function startDraft(request, id) {
  return (await journeyStore(request)).start(
    request.yar.id,
    id,
    organisationOf(request)
  )
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

export async function loadDraft(request, draft) {
  draft ??= await currentDraft(request)
  if (!draft) {
    throw new Error('No active notification journey')
  }
  const notification = await findDraft(request, draft)
  if (notification) {
    await remember(request, notification)
  }
  return notification
}

export async function saveDraft(request, transportMethod, draft) {
  draft ??= await currentDraft(request)
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
