import { notificationsClient } from './client.js'
import { config } from '#/config/config.js'

const id = 'a495eae6-c0c8-4b79-b032-f0bb8f2f377e'
const request = { headers: { 'x-cdp-request-id': 'test-trace' } }
const payload = {
  organisationId: 'represented-importer',
  transportMethod: 'air-freight'
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

  test('sends only the two allowed body fields and creation key, with tracing and a timeout', async () => {
    fetchMock.mockResolvedValue(Response.json(notification, { status: 201 }))
    await expect(
      notificationsClient.create(request, id, payload)
    ).resolves.toEqual(notification)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url.toString()).toBe(
      new URL('/notifications', config.get('notificationApiUrl')).toString()
    )
    expect(options.method).toBe('POST')
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
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT')
  })

  test('an identical creation replay accepts 200', async () => {
    fetchMock.mockResolvedValue(Response.json(notification))
    await expect(
      notificationsClient.create(request, id, payload)
    ).resolves.toEqual(notification)
  })

  test('only GET 404 represents an absent draft', async () => {
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 404 })
    )
    await expect(notificationsClient.find(request, id)).resolves.toBeNull()
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
    }
  )

  test.each([
    { ...notification, id: '90d79b91-40b1-4daf-ad0e-bf554aeb56f3' },
    { ...notification, reference: 'wrong-reference' },
    { ...notification, status: 'SUBMITTED' },
    { ...notification, organisationId: 'another' },
    { ...notification, transportMethod: 'road-vehicle' },
    { ...notification, createdAt: 'not-a-date' },
    { ...notification, updatedAt: 'not-a-date' },
    { ...notification, createdAt: undefined },
    { ...notification, updatedAt: undefined },
    {}
  ])('rejects invalid or mismatched save responses: %j', async (response) => {
    fetchMock.mockResolvedValue(Response.json(response))
    await expect(
      notificationsClient.create(request, id, payload)
    ).rejects.toThrow()
  })

  test('network and timeout errors propagate rather than create success', async () => {
    fetchMock.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'))
    await expect(
      notificationsClient.create(request, id, payload)
    ).rejects.toThrow('Timed out')
  })
})
