import { load } from 'cheerio'
import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { notificationsClient } from '#/server/services/notifications/client.js'
import {
  cookieHeader,
  mockNotificationDrafts,
  receiveCookies
} from '#/test-helpers/notification-journey.js'

vi.mock('#/server/services/notifications/client.js')

const path = '/notification/transport-details'
const organisationId = 'test-org-north-quay-seafood'
const auth = {
  strategy: 'session',
  credentials: {
    userId: 'test-user-importer-north-quay',
    role: 'importer',
    organisationId
  }
}

function notification(id, mode = 'AIR_FREIGHT') {
  return {
    id,
    reference: 'GBN-FIS-26-AXN04',
    organisationId,
    notification: { transport: { mode } }
  }
}

describe('transport details routes', () => {
  let server
  let drafts

  async function initializeServer(instance) {
    await instance.initialize()
    await vi.waitFor(() =>
      expect(instance.app.savedNotificationDrafts.isReady()).toBe(true)
    )
  }

  beforeAll(async () => {
    server = await createServer()
    await initializeServer(server)
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  beforeEach(() => {
    vi.resetAllMocks()
    drafts = mockNotificationDrafts(notificationsClient)
  })

  async function visit() {
    const jar = {}
    const guidance = await server.inject({
      url: '/notification/guidance',
      auth
    })
    receiveCookies(jar, guidance)
    const $ = load(guidance.payload)
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(jar) },
      payload: {
        crumb: $('form input[name="crumb"]').val(),
        journeyId: $('form input[name="journeyId"]').val()
      }
    })
    receiveCookies(jar, started)
    const response = await server.inject({
      url: started.headers.location,
      auth,
      headers: { cookie: cookieHeader(jar) }
    })
    receiveCookies(jar, response)
    return {
      response,
      jar,
      crumb: load(response.payload)('form input[name="crumb"]').val(),
      journeyId: load(response.payload)('form input[name="journeyId"]').val()
    }
  }

  async function submit(journey, transportMethod) {
    const response = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        transportMethod,
        crumb: journey.crumb,
        journeyId: journey.journeyId
      }
    })
    receiveCookies(journey.jar, response)
    return response
  }

  test('visiting Transport details without starting returns to guidance', async () => {
    const response = await server.inject({ url: path, auth })
    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('/notification/guidance')
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('renders screenshot main content with no initial selection or backend draft', async () => {
    const { response, journeyId } = await visit()
    const $ = load(response.payload)
    expect(response.statusCode).toBe(200)
    expect($('.govuk-caption-l').text()).toBe('Import notification')
    expect($('h1').text()).toBe('Transport details')
    expect($('legend').text().trim()).toBe(
      'How is the consignment being transported?'
    )
    expect($('form input[type="radio"]')).toHaveLength(3)
    expect($('form input:checked')).toHaveLength(0)
    expect(
      $('.govuk-radios__label')
        .map((_i, element) => $(element).text().trim())
        .get()
    ).toEqual(['Ship or vessel', 'Air freight', 'Road vehicle'])
    expect($('.govuk-form-group').next('p').text().trim()).toBe(
      "We'll use the documents you upload to get your transport details."
    )
    expect($('main form button').text().trim()).toBe('Save and continue')
    expect($('.govuk-back-link').attr('href')).toBe('/notification/guidance')
    expect(notificationsClient.find).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      journeyId
    )
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test.each([
    ['Ship or vessel', 'VESSEL'],
    ['Air freight', 'AIR_FREIGHT'],
    ['Road vehicle', 'ROAD_VEHICLE']
  ])(
    'submits the %s radio as %s, then redirects to consignment details',
    async (label, mode) => {
      const journey = await visit()
      const $ = load(journey.response.payload)
      const radio = $(`input[name="transportMethod"][value="${mode}"]`)
      expect(
        $(`label[for="${radio.attr('id')}"]`)
          .text()
          .trim()
      ).toBe(label)
      const response = await submit(journey, radio.val())
      expect(response.statusCode).toBe(303)
      expect(response.headers.location).toBe(
        '/notification/consignment-details'
      )
      expect(notificationsClient.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^[a-f0-9-]{36}$/),
        { organisationId, notification: { transport: { mode } } }
      )
      const destination = await server.inject({
        url: response.headers.location,
        auth,
        headers: { cookie: cookieHeader(journey.jar) }
      })
      expect(destination.statusCode).toBe(200)
      expect(load(destination.payload)('h1').text()).toBe('Consignment details')
    }
  )

  test.each([
    undefined,
    '',
    'train',
    'air-freight',
    ['AIR_FREIGHT', 'ROAD_VEHICLE']
  ])(
    'invalid selection %j renders accessible errors without persistence',
    async (transportMethod) => {
      const response = await submit(await visit(), transportMethod)
      const $ = load(response.payload)
      expect(response.statusCode).toBe(400)
      expect($('title').text().trim()).toMatch(/^Error: Transport details/)
      expect($('.govuk-error-summary a').attr('href')).toBe('#transportMethod')
      expect($('.govuk-error-message').text()).toContain(
        'Select how the consignment is being transported'
      )
      expect(
        $('#transportMethod').attr('aria-describedby') ??
          $('fieldset').attr('aria-describedby')
      ).toContain('transportMethod-error')
      expect(notificationsClient.create).not.toHaveBeenCalled()
      expect(notificationsClient.update).not.toHaveBeenCalled()
    }
  )

  test.each(['VESSEL', 'AIR_FREIGHT', 'ROAD_VEHICLE'])(
    'preselects the saved %s radio',
    async (mode) => {
      const { jar, journeyId } = await visit()
      drafts.set(journeyId, notification(journeyId, mode))
      const response = await server.inject({
        method: 'GET',
        url: path,
        auth,
        headers: { cookie: cookieHeader(jar) }
      })
      const $ = load(response.payload)
      expect(response.statusCode).toBe(200)
      expect($('input[type="radio"]:checked')).toHaveLength(1)
      expect($('input[type="radio"]:checked').val()).toBe(mode)
    }
  )

  test('retains the selected mode when another submitted field is invalid', async () => {
    const journey = await visit()
    const response = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        transportMethod: 'ROAD_VEHICLE',
        unsupported: 'value',
        crumb: journey.crumb,
        journeyId: journey.journeyId
      }
    })
    const $ = load(response.payload)
    expect(response.statusCode).toBe(400)
    expect($('input:checked').val()).toBe('ROAD_VEHICLE')
    expect($('title').text().trim()).toMatch(/^Error: Transport details/)
    expect($('.govuk-error-summary a').attr('href')).toBe('#transportMethod')
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('guidance leads through transport to consignment, and returning and resaving use the same draft', async () => {
    const journey = await visit()
    const { jar } = journey
    expect(journey.response.statusCode).toBe(200)
    const saved = await submit(journey, 'AIR_FREIGHT')
    expect(saved.statusCode).toBe(303)
    const consignment = await server.inject({
      url: saved.headers.location,
      auth,
      headers: { cookie: cookieHeader(jar) }
    })
    expect(consignment.statusCode).toBe(200)
    receiveCookies(jar, consignment)
    const back = load(consignment.payload)('.govuk-back-link').attr('href')
    expect(back).toBe(path)
    const id = notificationsClient.create.mock.calls[0][1]
    const returned = await server.inject({
      method: 'GET',
      url: back,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(returned.statusCode).toBe(200)
    expect(load(returned.payload)('input:checked').val()).toBe('AIR_FREIGHT')
    expect(load(returned.payload)('.govuk-back-link').attr('href')).toBe(
      '/notification/guidance'
    )
    receiveCookies(jar, returned)
    journey.crumb = load(returned.payload)('form input[name="crumb"]').val()
    await submit(journey, 'ROAD_VEHICLE')
    await submit(journey, 'ROAD_VEHICLE')
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
    expect(notificationsClient.update).toHaveBeenCalledTimes(2)
    expect(
      notificationsClient.update.mock.calls.map((call) => call[1])
    ).toEqual([id, id])
  })

  test('Start now begins a distinct notification after saving transport details', async () => {
    const journey = await visit()
    await submit(journey, 'AIR_FREIGHT')
    const firstId = notificationsClient.create.mock.calls[0][1]

    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const startForm = $('main form:has(button.govuk-button--start)')
    expect(startForm.attr('method')).toBe('post')

    const started = await server.inject({
      method: 'POST',
      url: startForm.attr('action'),
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: startForm.find('input[name="crumb"]').val(),
        journeyId: startForm.find('input[name="journeyId"]').val()
      }
    })
    receiveCookies(journey.jar, started)
    expect(started.statusCode).toBe(303)
    const transport = await server.inject({
      url: started.headers.location,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(load(transport.payload)('input:checked')).toHaveLength(0)
    journey.crumb = load(transport.payload)('form input[name="crumb"]').val()
    journey.journeyId = load(transport.payload)(
      'form input[name="journeyId"]'
    ).val()
    await submit(journey, 'ROAD_VEHICLE')
    expect(notificationsClient.create).toHaveBeenCalledTimes(2)
    expect(notificationsClient.create.mock.calls[1][1]).not.toBe(firstId)
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('saving a superseded tab redirects without writing its selection', async () => {
    const journey = await visit()
    const firstId = load(journey.response.payload)(
      'form input[name="journeyId"]'
    ).val()
    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: $('form input[name="crumb"]').val(),
        journeyId: $('form input[name="journeyId"]').val()
      }
    })
    receiveCookies(journey.jar, started)

    const stale = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: journey.crumb,
        journeyId: firstId,
        transportMethod: 'AIR_FREIGHT'
      }
    })
    expect(stale.statusCode).toBe(303)
    expect(stale.headers.location).toBe(path)
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('an invalid form from a superseded tab cannot rebind to the current journey', async () => {
    const journey = await visit()
    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: $('form input[name="crumb"]').val(),
        journeyId: $('form input[name="journeyId"]').val()
      }
    })
    receiveCookies(journey.jar, started)

    const stale = await submit(journey, '')
    expect(stale.statusCode).toBe(303)
    expect(stale.headers.location).toBe(path)
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('a delayed retry of an old Start cannot revive a superseded journey', async () => {
    const journey = await visit()
    const previousId = journey.journeyId
    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const currentId = $('form input[name="journeyId"]').val()
    const startPayload = {
      crumb: $('form input[name="crumb"]').val(),
      journeyId: currentId
    }
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: startPayload
    })
    receiveCookies(journey.jar, started)
    const retried = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: { ...startPayload, journeyId: previousId }
    })
    receiveCookies(journey.jar, retried)
    const transport = await server.inject({
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(load(transport.payload)('form input[name="journeyId"]').val()).toBe(
      currentId
    )
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('overlapping Starts cannot forget a superseded Start identity', async () => {
    const journey = await visit()
    const startForms = await Promise.all(
      [0, 1].map(async () => {
        const guidance = await server.inject({
          url: '/notification/guidance',
          auth,
          headers: { cookie: cookieHeader(journey.jar) }
        })
        const $ = load(guidance.payload)
        return {
          crumb: $('form input[name="crumb"]').val(),
          journeyId: $('form input[name="journeyId"]').val()
        }
      })
    )
    const secondServer =
      config.get('session.cache.engine') === 'redis'
        ? await createServer()
        : server
    try {
      if (secondServer !== server) {
        await initializeServer(secondServer)
      }
      const responses = await Promise.all(
        [server, secondServer].map((instance, index) =>
          instance.inject({
            method: 'POST',
            url: '/notification/guidance',
            auth,
            headers: { cookie: cookieHeader(journey.jar) },
            payload: startForms[index]
          })
        )
      )
      expect(responses.map(({ statusCode }) => statusCode)).toEqual([303, 303])
    } finally {
      if (secondServer !== server) {
        await secondServer.stop({ timeout: 0 })
      }
    }
    const current = await server.inject({
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    const currentId = load(current.payload)(
      'form input[name="journeyId"]'
    ).val()
    expect(startForms.map(({ journeyId }) => journeyId)).toContain(currentId)
    const oldStart = startForms.find(({ journeyId }) => journeyId !== currentId)
    const retried = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: oldStart
    })
    expect(retried.statusCode).toBe(303)
    const afterRetry = await server.inject({
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(load(afterRetry.payload)('form input[name="journeyId"]').val()).toBe(
      currentId
    )
  })

  test('a slow load cannot restore a journey superseded by Start now', async () => {
    const journey = await visit()
    let beginFind
    let releaseFind
    const findStarted = new Promise((resolve) => {
      beginFind = resolve
    })
    const findCanFinish = new Promise((resolve) => {
      releaseFind = resolve
    })
    notificationsClient.find.mockImplementation(async (_request, id) => {
      if (id !== journey.journeyId) {
        return null
      }
      beginFind()
      await findCanFinish
      return notification(id)
    })
    const loading = server.inject({
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    await findStarted

    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const nextId = $('form input[name="journeyId"]').val()
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: $('form input[name="crumb"]').val(),
        journeyId: nextId
      }
    })
    receiveCookies(journey.jar, started)
    releaseFind()
    const loaded = await loading
    expect(load(loaded.payload)('form input[name="journeyId"]').val()).toBe(
      journey.journeyId
    )

    const current = await server.inject({
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(load(current.payload)('form input[name="journeyId"]').val()).toBe(
      nextId
    )
  })

  test('a slow save cannot restore a journey superseded by Start now', async () => {
    const journey = await visit()
    let beginCreate
    let releaseCreate
    const createStarted = new Promise((resolve) => {
      beginCreate = resolve
    })
    const createCanFinish = new Promise((resolve) => {
      releaseCreate = resolve
    })
    notificationsClient.create.mockImplementationOnce(
      async (_request, id, payload) => {
        beginCreate()
        await createCanFinish
        return notification(id, payload.notification.transport.mode)
      }
    )
    const saving = submit(journey, 'AIR_FREIGHT')
    await createStarted

    const guidance = await server.inject({
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    receiveCookies(journey.jar, guidance)
    const $ = load(guidance.payload)
    const nextId = $('form input[name="journeyId"]').val()
    const started = await server.inject({
      method: 'POST',
      url: '/notification/guidance',
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: {
        crumb: $('form input[name="crumb"]').val(),
        journeyId: nextId
      }
    })
    receiveCookies(journey.jar, started)
    releaseCreate()
    await saving

    const current = await server.inject({
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) }
    })
    expect(load(current.payload)('form input[name="journeyId"]').val()).toBe(
      nextId
    )
    expect(load(current.payload)('input:checked')).toHaveLength(0)
  })

  test('backend failures do not redirect, and retry recovers an already committed draft', async () => {
    const journey = await visit()
    const create = notificationsClient.create.getMockImplementation()
    notificationsClient.create.mockImplementationOnce(async (...args) => {
      await create(...args)
      throw new Error('Lost backend response')
    })
    const failed = await submit(journey, 'AIR_FREIGHT')
    expect(failed.statusCode).toBe(500)
    expect(failed.headers.location).toBeUndefined()
    const id = notificationsClient.create.mock.calls[0][1]
    expect((await submit(journey, 'ROAD_VEHICLE')).statusCode).toBe(303)
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
    expect(notificationsClient.update).toHaveBeenCalledWith(
      expect.anything(),
      id,
      {
        organisationId,
        notification: { transport: { mode: 'ROAD_VEHICLE' } }
      }
    )
    notificationsClient.update.mockRejectedValueOnce(
      new Error('Backend unavailable')
    )
    const failedUpdate = await submit(journey, 'ROAD_VEHICLE')
    expect(failedUpdate.statusCode).toBe(500)
    expect(failedUpdate.headers.location).toBeUndefined()
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
  })

  test('does not recreate a draft that disappears between lookup and update', async () => {
    const journey = await visit()
    await submit(journey, 'AIR_FREIGHT')
    const { journeyId } = journey
    notificationsClient.find.mockResolvedValueOnce(drafts.get(journeyId))
    drafts.delete(journeyId)

    const response = await submit(journey, 'ROAD_VEHICLE')

    expect(response.statusCode).toBe(500)
    expect(response.headers.location).toBeUndefined()
    expect(notificationsClient.update).toHaveBeenCalledTimes(1)
    expect(notificationsClient.create).toHaveBeenCalledTimes(1)
    expect(drafts.has(journeyId)).toBe(false)
  })

  test('separate browser sessions do not share draft identities', async () => {
    await submit(await visit(), 'AIR_FREIGHT')
    await submit(await visit(), 'AIR_FREIGHT')
    expect(notificationsClient.create.mock.calls[0][1]).not.toBe(
      notificationsClient.create.mock.calls[1][1]
    )
  })

  test('rejects missing CSRF tokens before persistence', async () => {
    const journey = await visit()
    const response = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: cookieHeader(journey.jar) },
      payload: { transportMethod: 'AIR_FREIGHT' }
    })
    expect(response.statusCode).toBe(403)
    expect(notificationsClient.create).not.toHaveBeenCalled()
  })

  test('a valid submission without the notification session shows the expired-session response', async () => {
    const journey = await visit()
    const response = await server.inject({
      method: 'POST',
      url: path,
      auth,
      headers: { cookie: `crumb=${journey.jar.crumb}` },
      payload: {
        crumb: journey.crumb,
        journeyId: journey.journeyId,
        transportMethod: 'AIR_FREIGHT'
      }
    })
    expect(response.statusCode).toBe(400)
    expect(response.headers.location).toBeUndefined()
    expect(response.payload).toContain(
      'Your session has expired. Return to Transport details and try again.'
    )
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })

  test('an invalid selection without the journey session redirects to guidance', async () => {
    const journey = await visit()
    journey.jar = { crumb: journey.jar.crumb }
    notificationsClient.find.mockClear()

    const response = await submit(journey, '')

    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe('/notification/guidance')
    expect(notificationsClient.find).not.toHaveBeenCalled()
    expect(notificationsClient.create).not.toHaveBeenCalled()
    expect(notificationsClient.update).not.toHaveBeenCalled()
  })
})
