import { currentDraft, loadDraft, saveDraft } from './draft-session.js'
import { notificationsClient } from './client.js'

vi.mock('./client.js', () => ({
  notificationsClient: {
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  }
}))

const organisationId = 'test-org-north-quay-seafood'

function saved(id, mode = 'AIR_FREIGHT') {
  return {
    id,
    reference: 'GBN-FIS-26-AXN04',
    organisationId,
    notification: { transport: { mode } }
  }
}

describe('notification draft session', () => {
  let request

  beforeEach(() => {
    vi.resetAllMocks()
    const store = new Map()
    request = {
      auth: { credentials: { organisationId } },
      yar: {
        get: (key) => store.get(key),
        set: (key, value) => store.set(key, value)
      }
    }
    notificationsClient.find.mockResolvedValue(null)
    notificationsClient.create.mockImplementation(
      async (_request, id, payload) =>
        saved(id, payload.notification.transport.mode)
    )
    notificationsClient.update.mockImplementation(
      async (_request, id, payload) =>
        saved(id, payload.notification.transport.mode)
    )
  })

  test('first GET allocates only a session token and makes no backend draft', async () => {
    expect(await loadDraft(request)).toBeNull()
    expect(currentDraft(request).id).toMatch(/^[a-f0-9-]{36}$/)
    expect(notificationsClient.find).not.toHaveBeenCalled()
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('first save creates once and later saves update the same ID/reference', async () => {
    await loadDraft(request)
    const id = currentDraft(request).id
    await saveDraft(request, 'air-freight')
    notificationsClient.find.mockResolvedValue(saved(id))
    await saveDraft(request, 'road-vehicle')
    expect(notificationsClient.create).toHaveBeenCalledExactlyOnceWith(
      request,
      id,
      {
        organisationId,
        notification: { transport: { mode: 'AIR_FREIGHT' } }
      }
    )
    expect(notificationsClient.update).toHaveBeenCalledExactlyOnceWith(
      request,
      id,
      {
        organisationId,
        notification: { transport: { mode: 'ROAD_VEHICLE' } }
      }
    )
    expect(currentDraft(request)).toEqual({
      id,
      saved: true,
      reference: 'GBN-FIS-26-AXN04',
      organisationId
    })
  })

  test.each([
    ['ship-or-vessel', 'VESSEL'],
    ['air-freight', 'AIR_FREIGHT'],
    ['road-vehicle', 'ROAD_VEHICLE']
  ])(
    'updates %s with only canonical transport details, including unchanged saves',
    async (transportMethod, mode) => {
      await loadDraft(request)
      const id = currentDraft(request).id
      notificationsClient.find.mockResolvedValue({
        ...saved(id),
        notification: {
          transport: { mode: 'AIR_FREIGHT', additionalDetail: 'retained' },
          additionalSection: { detail: 'retained' }
        },
        metadata: { version: 1 }
      })
      await saveDraft(request, transportMethod)
      expect(notificationsClient.update).toHaveBeenCalledExactlyOnceWith(
        request,
        id,
        { organisationId, notification: { transport: { mode } } }
      )
      expect(notificationsClient.create).not.toHaveBeenCalled()
    }
  )

  test('recovers a committed save after a lost response, including a changed selection', async () => {
    await loadDraft(request)
    const id = currentDraft(request).id
    notificationsClient.create.mockRejectedValueOnce(new Error('Lost response'))
    await expect(saveDraft(request, 'air-freight')).rejects.toThrow(
      'Lost response'
    )
    expect(currentDraft(request).id).toBe(id)
    notificationsClient.find.mockResolvedValue(saved(id))
    await saveDraft(request, 'road-vehicle')
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
    expect(notificationsClient.update).toHaveBeenCalledWith(request, id, {
      organisationId,
      notification: { transport: { mode: 'ROAD_VEHICLE' } }
    })
  })

  test('returning after a lost create response reads the current backend choice', async () => {
    await loadDraft(request)
    notificationsClient.create.mockRejectedValueOnce(new Error('Lost response'))
    await expect(saveDraft(request, 'air-freight')).rejects.toThrow(
      'Lost response'
    )
    notificationsClient.find.mockResolvedValue(
      saved(currentDraft(request).id, 'ROAD_VEHICLE')
    )
    expect((await loadDraft(request)).notification.transport.mode).toBe(
      'ROAD_VEHICLE'
    )
    expect(currentDraft(request).saved).toBe(true)
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
  })

  test('a failed creation retry keeps its original key', async () => {
    await loadDraft(request)
    const id = currentDraft(request).id
    notificationsClient.create.mockRejectedValueOnce(new Error('Unavailable'))
    await expect(saveDraft(request, 'air-freight')).rejects.toThrow(
      'Unavailable'
    )
    await saveDraft(request, 'air-freight')
    expect(
      notificationsClient.create.mock.calls.map((call) => call[1])
    ).toEqual([id, id])
  })

  test('does not silently recreate a missing saved draft', async () => {
    await loadDraft(request)
    await saveDraft(request, 'air-freight')
    await expect(saveDraft(request, 'road-vehicle')).rejects.toThrow(
      'could not be found'
    )
    await expect(loadDraft(request)).rejects.toThrow('could not be found')
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
  })

  test('remembers a recovered draft so a failed update cannot lead to recreation', async () => {
    await loadDraft(request)
    const id = currentDraft(request).id
    notificationsClient.find.mockResolvedValueOnce(saved(id))
    notificationsClient.update.mockRejectedValueOnce(
      new Error('Notification API PATCH failed with status 404')
    )
    await expect(saveDraft(request, 'road-vehicle')).rejects.toThrow('404')
    expect(currentDraft(request)).toEqual({
      id,
      saved: true,
      reference: 'GBN-FIS-26-AXN04',
      organisationId
    })
    await expect(saveDraft(request, 'road-vehicle')).rejects.toThrow(
      'could not be found'
    )
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('rejects another organisation and an unexpectedly changed reference', async () => {
    await loadDraft(request)
    const id = currentDraft(request).id
    notificationsClient.find.mockResolvedValue({
      ...saved(id),
      organisationId: 'another'
    })
    await expect(loadDraft(request)).rejects.toThrow('organisation')
    await expect(saveDraft(request, 'air-freight')).rejects.toThrow(
      'organisation'
    )
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(notificationsClient.update).not.toHaveBeenCalled()
    notificationsClient.find.mockResolvedValue(saved(id))
    await loadDraft(request)
    notificationsClient.find.mockResolvedValue({
      ...saved(id),
      reference: 'GBN-FIS-26-OTHER'
    })
    await expect(loadDraft(request)).rejects.toThrow('reference')
    await expect(saveDraft(request, 'air-freight')).rejects.toThrow('reference')
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('rejects a changed reference returned by an update and keeps the recovered identity', async () => {
    await loadDraft(request)
    const id = currentDraft(request).id
    notificationsClient.find.mockResolvedValue(saved(id))
    notificationsClient.update.mockResolvedValue({
      ...saved(id, 'ROAD_VEHICLE'),
      reference: 'GBN-FIS-26-OTHER'
    })
    await expect(saveDraft(request, 'road-vehicle')).rejects.toThrow(
      'reference has unexpectedly changed during save'
    )
    expect(currentDraft(request)).toEqual({
      id,
      saved: true,
      reference: 'GBN-FIS-26-AXN04',
      organisationId
    })
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('cannot save without a journey session', async () => {
    await expect(saveDraft(request, 'air-freight')).rejects.toThrow('No active')
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('saves under the signed-in organisation', async () => {
    request.auth.credentials.organisationId = 'test-org-harbour-fish'
    await loadDraft(request)
    await saveDraft(request, 'air-freight')
    expect(notificationsClient.create).toHaveBeenCalledWith(
      request,
      expect.any(String),
      {
        organisationId: 'test-org-harbour-fish',
        notification: { transport: { mode: 'AIR_FREIGHT' } }
      }
    )
  })

  test('a different organisation signing in starts a fresh draft', async () => {
    await loadDraft(request)
    const id = currentDraft(request).id
    request.auth.credentials.organisationId = 'test-org-harbour-fish'
    expect(currentDraft(request)).toBeNull()
    expect(await loadDraft(request)).toBeNull()
    expect(currentDraft(request).id).not.toBe(id)
    expect(notificationsClient.find).not.toHaveBeenCalled()
  })

  test('requires a signed-in organisation', async () => {
    request.auth = undefined
    await expect(loadDraft(request)).rejects.toThrow(
      'No signed-in importer organisation'
    )
  })
})
