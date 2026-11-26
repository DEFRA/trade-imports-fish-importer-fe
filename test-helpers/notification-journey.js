export function receiveCookies(jar, response) {
  for (const cookie of response.headers['set-cookie'] ?? []) {
    const pair = cookie.split(';')[0]
    const separator = pair.indexOf('=')
    jar[pair.slice(0, separator)] = pair.slice(separator + 1)
  }
}

export function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

export function mockNotificationDrafts(client) {
  const drafts = new Map()

  client.find.mockImplementation(async (_request, id) => drafts.get(id) ?? null)
  client.create.mockImplementation(
    async (_request, id, { organisationId, notification }) => {
      const now = new Date().toISOString()
      const draft = {
        id,
        reference: 'GBN-FIS-26-AXN04',
        status: 'DRAFT',
        organisationId,
        notification,
        createdAt: now,
        updatedAt: now
      }
      drafts.set(id, draft)
      return draft
    }
  )
  client.update.mockImplementation(async (_request, id, { notification }) => {
    const existing = drafts.get(id)
    if (!existing) {
      throw new Error('Notification API PATCH failed with status 404')
    }
    const updated = {
      ...existing,
      notification: { ...existing.notification, ...notification },
      updatedAt: new Date().toISOString()
    }
    drafts.set(id, updated)
    return updated
  })

  return drafts
}
