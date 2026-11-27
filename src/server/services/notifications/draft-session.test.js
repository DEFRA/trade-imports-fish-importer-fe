import {
  currentDraft,
  loadDraft,
  loadSavedDraft,
  saveArrival,
  saveDraft,
  startDraft
} from './draft-session.js'
import { notificationsClient } from './client.js'
import { createJourneyStore } from './journey-store.js'

vi.mock('./client.js', () => ({
  notificationsClient: {
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  }
}))

const organisationId = 'test-org-north-quay-seafood'
const journeyId = 'a495eae6-c0c8-4b79-b032-f0bb8f2f377e'

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
    const savedDrafts = new Map()
    request = {
      auth: { credentials: { organisationId } },
      server: {
        app: {
          notificationJourneyStore: createJourneyStore(3600000),
          savedNotificationDrafts: {
            get: async (id) => savedDrafts.get(id),
            set: async (id, value) => savedDrafts.set(id, value)
          }
        }
      },
      yar: {
        id: 'browser-session',
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

  async function beginJourney(id = journeyId) {
    await startDraft(request, id)
  }

  test('Start allocates only a journey identity and makes no backend draft', async () => {
    await beginJourney()
    expect(notificationsClient.find).not.toHaveBeenCalled()
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(await loadDraft(request)).toBeNull()
    expect((await currentDraft(request)).id).toBe(journeyId)
  })

  test('migrates the legacy journey and prevents replay of a superseded Start', async () => {
    const previousId = '90d79b91-40b1-4daf-ad0e-bf554aeb56f3'
    const nextId = '0dddb858-bf94-40bb-83c7-8b35523c0120'
    const legacy = { id: journeyId, organisationId, saved: false }
    request.yar.set('notificationDraft', legacy)
    request.yar.set('notificationStartedJourneys', [previousId, journeyId])

    expect(await currentDraft(request)).toEqual(legacy)
    expect(await startDraft(request, previousId)).toBe(false)
    expect(await startDraft(request, nextId)).toBe(true)
    expect(await currentDraft(request)).toEqual({ ...legacy, id: nextId })
  })

  test('checking for a saved draft does not start a journey', async () => {
    expect(await loadSavedDraft(request)).toBeNull()
    expect(await currentDraft(request)).toBeNull()
    expect(notificationsClient.find).not.toHaveBeenCalled()
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('an unsaved journey is not mistaken for a backend draft', async () => {
    await beginJourney()

    const notification = await loadSavedDraft(request)
    expect(notification).toBeNull()
    await expect(saveArrival(request, {}, notification)).rejects.toThrow(
      'No saved notification for arrival details'
    )
    expect(await currentDraft(request)).toMatchObject({
      id: journeyId,
      saved: false
    })
    expect(notificationsClient.update).not.toHaveBeenCalled()
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('patches arrival details on the notification checked by the guard', async () => {
    await beginJourney()
    const id = (await currentDraft(request)).id
    const arrival = {
      portOfEntry: 'FELIXSTOWE',
      expectedArrivalDate: '2027-06-15',
      expectedArrivalTime: '09:05'
    }
    const response = {
      ...saved(id),
      notification: {
        transport: { mode: 'AIR_FREIGHT' },
        arrival: {
          ...arrival,
          expectedArrivalAt: '2027-06-15T08:05:00Z',
          borderControlPost: 'FELIXSTOWE'
        }
      }
    }
    notificationsClient.update.mockResolvedValue(response)

    await expect(saveArrival(request, arrival, saved(id))).resolves.toEqual(
      response
    )

    expect(notificationsClient.update).toHaveBeenCalledExactlyOnceWith(
      request,
      id,
      { organisationId, notification: { arrival } }
    )
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(await currentDraft(request)).toEqual({
      id,
      organisationId,
      saved: false
    })
    expect(await request.server.app.savedNotificationDrafts.get(id)).toEqual({
      reference: 'GBN-FIS-26-AXN04',
      organisationId
    })
  })

  test('loading a saved draft propagates cache failures before updating', async () => {
    await beginJourney()
    notificationsClient.find.mockResolvedValue(saved(journeyId))
    request.server.app.savedNotificationDrafts.set = vi
      .fn()
      .mockRejectedValue(new Error('Cache unavailable'))

    await expect(loadSavedDraft(request)).rejects.toThrow('Cache unavailable')
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('rejects an arrival update whose reference differs from the checked notification', async () => {
    const notification = saved(journeyId)
    notificationsClient.update.mockResolvedValue({
      ...notification,
      reference: 'GBN-FIS-26-OTHER'
    })

    await expect(saveArrival(request, {}, notification)).rejects.toThrow(
      'Draft reference has unexpectedly changed during save'
    )
  })

  test('first save creates once and later saves update the same ID/reference', async () => {
    await beginJourney()
    const id = (await currentDraft(request)).id
    await saveDraft(request, 'AIR_FREIGHT')
    notificationsClient.find.mockResolvedValue(saved(id))
    await saveDraft(request, 'ROAD_VEHICLE')
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
    expect((await currentDraft(request)).id).toBe(id)
  })

  test.each(['VESSEL', 'AIR_FREIGHT', 'ROAD_VEHICLE'])(
    'updates %s with only canonical transport details, including unchanged saves',
    async (mode) => {
      await beginJourney()
      const id = (await currentDraft(request)).id
      notificationsClient.find.mockResolvedValue({
        ...saved(id),
        notification: {
          transport: { mode: 'AIR_FREIGHT', additionalDetail: 'retained' },
          additionalSection: { detail: 'retained' }
        },
        metadata: { version: 1 }
      })
      await saveDraft(request, mode)
      expect(notificationsClient.update).toHaveBeenCalledExactlyOnceWith(
        request,
        id,
        { organisationId, notification: { transport: { mode } } }
      )
      expect(notificationsClient.create).not.toHaveBeenCalled()
    }
  )

  test('recovers a committed save after a lost response, including a changed selection', async () => {
    await beginJourney()
    const id = (await currentDraft(request)).id
    notificationsClient.create.mockRejectedValueOnce(new Error('Lost response'))
    await expect(saveDraft(request, 'AIR_FREIGHT')).rejects.toThrow(
      'Lost response'
    )
    expect((await currentDraft(request)).id).toBe(id)
    notificationsClient.find.mockResolvedValue(saved(id))
    await saveDraft(request, 'ROAD_VEHICLE')
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
    expect(notificationsClient.update).toHaveBeenCalledWith(request, id, {
      organisationId,
      notification: { transport: { mode: 'ROAD_VEHICLE' } }
    })
  })

  test('returning after a lost create response reads the current backend choice', async () => {
    await beginJourney()
    notificationsClient.create.mockRejectedValueOnce(new Error('Lost response'))
    await expect(saveDraft(request, 'AIR_FREIGHT')).rejects.toThrow(
      'Lost response'
    )
    notificationsClient.find.mockResolvedValue(saved(journeyId, 'ROAD_VEHICLE'))
    expect((await loadDraft(request)).notification.transport.mode).toBe(
      'ROAD_VEHICLE'
    )
    expect(
      await request.server.app.savedNotificationDrafts.get(journeyId)
    ).toEqual({
      reference: 'GBN-FIS-26-AXN04',
      organisationId
    })
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
  })

  test('a failed creation retry keeps its original key', async () => {
    await beginJourney()
    const id = (await currentDraft(request)).id
    notificationsClient.create.mockRejectedValueOnce(new Error('Unavailable'))
    await expect(saveDraft(request, 'AIR_FREIGHT')).rejects.toThrow(
      'Unavailable'
    )
    await saveDraft(request, 'AIR_FREIGHT')
    expect(
      notificationsClient.create.mock.calls.map((call) => call[1])
    ).toEqual([id, id])
  })

  test('does not silently recreate a missing saved draft', async () => {
    await beginJourney()
    await saveDraft(request, 'AIR_FREIGHT')
    await expect(saveDraft(request, 'ROAD_VEHICLE')).rejects.toThrow(
      'could not be found'
    )
    await expect(loadDraft(request)).rejects.toThrow('could not be found')
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
  })

  test('remembers a recovered draft so a failed update cannot lead to recreation', async () => {
    await beginJourney()
    const id = (await currentDraft(request)).id
    notificationsClient.find.mockResolvedValueOnce(saved(id))
    notificationsClient.update.mockRejectedValueOnce(
      new Error('Notification API PATCH failed with status 404')
    )
    await expect(saveDraft(request, 'ROAD_VEHICLE')).rejects.toThrow('404')
    await expect(saveDraft(request, 'ROAD_VEHICLE')).rejects.toThrow(
      'could not be found'
    )
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('rejects another organisation and an unexpectedly changed reference', async () => {
    await beginJourney()
    const id = (await currentDraft(request)).id
    notificationsClient.find.mockResolvedValue({
      ...saved(id),
      organisationId: 'another'
    })
    await expect(loadDraft(request)).rejects.toThrow('organisation')
    await expect(saveDraft(request, 'AIR_FREIGHT')).rejects.toThrow(
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
    await expect(saveDraft(request, 'AIR_FREIGHT')).rejects.toThrow('reference')
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('rejects a changed reference returned by an update and keeps the recovered identity', async () => {
    await beginJourney()
    const id = (await currentDraft(request)).id
    notificationsClient.find.mockResolvedValue(saved(id))
    notificationsClient.update.mockResolvedValue({
      ...saved(id, 'ROAD_VEHICLE'),
      reference: 'GBN-FIS-26-OTHER'
    })
    await expect(saveDraft(request, 'ROAD_VEHICLE')).rejects.toThrow(
      'reference has unexpectedly changed during save'
    )
    expect(await currentDraft(request)).toEqual({
      id,
      saved: false,
      organisationId
    })
    expect(await request.server.app.savedNotificationDrafts.get(id)).toEqual({
      reference: 'GBN-FIS-26-AXN04',
      organisationId
    })
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('rejects a changed reference from a legacy draft with no Start history', async () => {
    request.yar.set('notificationDraft', {
      ...saved(journeyId),
      reference: 'GBN-FIS-26-LEGACY',
      saved: true
    })
    notificationsClient.find.mockResolvedValue(saved(journeyId))

    await expect(loadDraft(request)).rejects.toThrow(
      'Draft reference has unexpectedly changed'
    )
    expect(notificationsClient.find).toHaveBeenCalledExactlyOnceWith(
      request,
      journeyId
    )
  })

  test('rejects an update response with a changed draft reference', async () => {
    await beginJourney()
    const existing = saved(journeyId)
    notificationsClient.find.mockResolvedValue(existing)
    notificationsClient.update.mockResolvedValue({
      ...saved(journeyId, 'ROAD_VEHICLE'),
      reference: 'GBN-FIS-26-OTHER'
    })

    await expect(saveDraft(request, 'ROAD_VEHICLE')).rejects.toThrow(
      'Draft reference has unexpectedly changed during save'
    )
    expect(await loadDraft(request)).toEqual(existing)
  })

  test('cannot load or save without a journey session', async () => {
    await expect(loadDraft(request)).rejects.toThrow('No active')
    await expect(saveDraft(request, 'AIR_FREIGHT')).rejects.toThrow('No active')
    expect(notificationsClient.find).not.toHaveBeenCalled()
    expect(notificationsClient.update).not.toHaveBeenCalled()
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('saves under the signed-in organisation', async () => {
    request.auth.credentials.organisationId = 'test-org-harbour-fish'
    await beginJourney()
    await saveDraft(request, 'AIR_FREIGHT')
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
    await beginJourney()
    const id = (await currentDraft(request)).id
    request.auth.credentials.organisationId = 'test-org-harbour-fish'
    expect(await currentDraft(request)).toBeNull()
    await beginJourney('90d79b91-40b1-4daf-ad0e-bf554aeb56f3')
    expect((await currentDraft(request)).id).not.toBe(id)
    expect(notificationsClient.find).not.toHaveBeenCalled()
  })

  test('requires a signed-in organisation', async () => {
    request.auth = undefined
    await expect(currentDraft(request)).rejects.toThrow(
      'No signed-in importer organisation'
    )
  })
})
