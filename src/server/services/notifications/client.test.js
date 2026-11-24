import { notificationsClient } from './client.js'
import { config } from '#/config/config.js'

const id = 'a495eae6-c0c8-4b79-b032-f0bb8f2f377e'
const request = { headers: { 'x-cdp-request-id': 'test-trace' } }
const payload = {
  organisationId: 'represented-importer',
  notification: { transport: { mode: 'AIR_FREIGHT' } }
}
const arrivalPayload = {
  organisationId: 'represented-importer',
  notification: {
    arrival: {
      portOfEntry: 'FELIXSTOWE',
      expectedArrivalDate: '2027-06-15',
      expectedArrivalTime: '09:05'
    }
  }
}
const notification = {
  id,
  reference: 'GBN-FIS-26-AXN04',
  status: 'DRAFT',
  ...payload,
  createdAt: '2026-11-16T16:00:00.123Z',
  updatedAt: '2026-11-16T16:00:00.123Z'
}

describe('notificationsClient', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('sends the minimal canonical transport body and creation key, with tracing and a timeout', async () => {
    fetchMock.mockResolvedValue(Response.json(notification, { status: 201 }))
    await expect(
      notificationsClient.create(request, id, payload)
    ).resolves.toEqual(notification)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url.toString()).toBe(
      new URL('/notifications', config.get('notificationApiUrl')).toString()
    )
    expect(options.method).toBe('POST')
    expect(options.redirect).toBe('manual')
    expect(JSON.parse(options.body)).toEqual(payload)
    expect(options.headers).toMatchObject({
      'Idempotency-Key': id,
      'x-cdp-request-id': 'test-trace',
      'content-type': 'application/json'
    })
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  test('reads and updates the same draft without sending another creation key', async () => {
    fetchMock.mockImplementation(async () => Response.json(notification))
    await notificationsClient.find({ headers: {} }, id)
    await notificationsClient.update(request, id, payload)
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url.pathname).toBe(`/notifications/${id}`)
      expect(options.headers).not.toHaveProperty('Idempotency-Key')
    }
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH')
    expect(fetchMock.mock.calls[1][1].headers['content-type']).toBe(
      'application/json'
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(payload)
  })

  test('an identical creation replay accepts 200', async () => {
    fetchMock.mockResolvedValue(Response.json(notification))
    await expect(
      notificationsClient.create(request, id, payload)
    ).resolves.toEqual(notification)
  })

  test.each(['VESSEL', 'AIR_FREIGHT', 'ROAD_VEHICLE'])(
    'reads canonical mode %s without stripping additional response data',
    async (mode) => {
      const response = {
        ...notification,
        notification: {
          transport: { mode, additionalDetail: 'retained' },
          additionalSection: { detail: 'retained' }
        },
        metadata: { version: 1 }
      }
      fetchMock.mockResolvedValue(Response.json(response))
      await expect(notificationsClient.find(request, id)).resolves.toEqual(
        response
      )
    }
  )

  test('an unchanged-mode PATCH accepts the refreshed timestamp', async () => {
    const response = {
      ...notification,
      updatedAt: '2026-11-16T17:00:00.123Z'
    }
    fetchMock.mockResolvedValue(Response.json(response))
    await expect(
      notificationsClient.update(request, id, payload)
    ).resolves.toEqual(response)
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(payload)
  })

  test('accepts and verifies an arrival-only PATCH response', async () => {
    const response = {
      ...notification,
      notification: {
        ...notification.notification,
        arrival: {
          ...arrivalPayload.notification.arrival,
          expectedArrivalAt: '2027-06-15T08:05:00Z',
          borderControlPost: 'FELIXSTOWE'
        }
      }
    }
    fetchMock.mockResolvedValue(Response.json(response))
    await expect(
      notificationsClient.update(request, id, arrivalPayload)
    ).resolves.toEqual(response)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(arrivalPayload)
  })

  test('retains additional arrival response fields', async () => {
    const response = {
      ...notification,
      notification: {
        ...notification.notification,
        arrival: {
          ...arrivalPayload.notification.arrival,
          expectedArrivalAt: '2027-06-15T08:05:00Z',
          borderControlPost: 'FELIXSTOWE',
          referenceData: { version: 2 }
        }
      }
    }
    fetchMock.mockResolvedValue(Response.json(response))
    await expect(notificationsClient.find(request, id)).resolves.toEqual(
      response
    )
  })

  test.each([
    ['portOfEntry', 'felixstowe'],
    ['expectedArrivalDate', '15/06/2027'],
    ['expectedArrivalTime', '9:05'],
    ['expectedArrivalAt', 'not-a-date']
  ])('rejects a response with malformed arrival %s', async (field, value) => {
    const response = {
      ...notification,
      notification: {
        ...notification.notification,
        arrival: {
          ...arrivalPayload.notification.arrival,
          expectedArrivalAt: '2027-06-15T08:05:00Z',
          [field]: value
        }
      }
    }
    fetchMock.mockResolvedValue(Response.json(response))
    await expect(notificationsClient.find(request, id)).rejects.toThrow()
  })

  test.each([
    ['portOfEntry', 'DOVER'],
    ['expectedArrivalDate', '2027-06-16'],
    ['expectedArrivalTime', '09:06']
  ])(
    'rejects an arrival PATCH response with a different %s',
    async (field, value) => {
      const response = {
        ...notification,
        notification: {
          ...notification.notification,
          arrival: {
            ...arrivalPayload.notification.arrival,
            expectedArrivalAt: '2027-06-15T08:05:00Z',
            [field]: value
          }
        }
      }
      fetchMock.mockResolvedValue(Response.json(response))
      await expect(
        notificationsClient.update(request, id, arrivalPayload)
      ).rejects.toThrow('does not match the saved details')
    }
  )

  test('only GET 404 represents an absent draft', async () => {
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 404 })
    )
    await expect(notificationsClient.find(request, id)).resolves.toBeNull()
    await expect(
      notificationsClient.create(request, id, payload)
    ).rejects.toThrow('status 404')
    await expect(
      notificationsClient.update(request, id, payload)
    ).rejects.toThrow('status 404')
  })

  test.each([400, 409, 500, 503, 204, 302])(
    'does not treat HTTP %s as a successful save',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }))
      await expect(
        notificationsClient.create(request, id, payload)
      ).rejects.toThrow(`status ${status}`)
      await expect(
        notificationsClient.update(request, id, payload)
      ).rejects.toThrow(`status ${status}`)
      await expect(notificationsClient.find(request, id)).rejects.toThrow(
        `status ${status}`
      )
    }
  )

  test('PATCH does not accept the creation-only 201 status', async () => {
    fetchMock.mockResolvedValue(Response.json(notification, { status: 201 }))
    await expect(
      notificationsClient.update(request, id, payload)
    ).rejects.toThrow('status 201')
  })

  test.each([
    {
      ...notification,
      notification: undefined,
      transportMethod: 'air-freight'
    },
    {}
  ])(
    'a malformed GET success response is not an absent draft: %j',
    async (response) => {
      fetchMock.mockResolvedValue(Response.json(response))
      await expect(notificationsClient.find(request, id)).rejects.toThrow()
    }
  )

  test.each([
    { ...notification, id: '90d79b91-40b1-4daf-ad0e-bf554aeb56f3' },
    { ...notification, reference: 'wrong-reference' },
    { ...notification, status: 'SUBMITTED' },
    { ...notification, organisationId: 'another' },
    {
      ...notification,
      notification: { transport: { mode: 'ROAD_VEHICLE' } }
    },
    {
      ...notification,
      notification: undefined,
      transportMethod: 'air-freight'
    },
    { ...notification, notification: null },
    { ...notification, notification: {} },
    { ...notification, notification: { transport: null } },
    { ...notification, notification: { transport: {} } },
    { ...notification, notification: { transport: { mode: null } } },
    { ...notification, notification: { transport: { mode: 'air-freight' } } },
    { ...notification, notification: { transport: { mode: 'RAIL' } } },
    { ...notification, createdAt: 'not-a-date' },
    { ...notification, updatedAt: 'not-a-date' },
    { ...notification, createdAt: undefined },
    { ...notification, updatedAt: undefined },
    {}
  ])('rejects invalid or mismatched save responses: %j', async (response) => {
    fetchMock.mockImplementation(async () => Response.json(response))
    await expect(
      notificationsClient.create(request, id, payload)
    ).rejects.toThrow()
    await expect(
      notificationsClient.update(request, id, payload)
    ).rejects.toThrow()
  })

  test('malformed JSON does not become a successful save', async () => {
    fetchMock.mockImplementation(async () => new Response('{'))
    await expect(
      notificationsClient.create(request, id, payload)
    ).rejects.toThrow(SyntaxError)
    await expect(
      notificationsClient.update(request, id, payload)
    ).rejects.toThrow(SyntaxError)
  })

  test.each([
    new Error('Network unavailable'),
    new DOMException('Timed out', 'TimeoutError')
  ])(
    'network and timeout errors propagate rather than create success: %s',
    async (error) => {
      fetchMock.mockRejectedValue(error)
      await expect(
        notificationsClient.create(request, id, payload)
      ).rejects.toThrow(error.message)
      await expect(
        notificationsClient.update(request, id, payload)
      ).rejects.toThrow(error.message)
      await expect(notificationsClient.find(request, id)).rejects.toThrow(
        error.message
      )
    }
  )
})
