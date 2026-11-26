import { randomUUID } from 'node:crypto'

import { config } from '#/config/config.js'
import { startDraft } from '#/server/services/notifications/draft-session.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

export const guidanceController = {
  handler(request, h) {
    if (!request.state[config.get('session.cache.name')]?.id) {
      request.yar.touch()
    }
    return h.view('notification/guidance/index', {
      pageTitle: 'Submit your seafood import notification',
      heading: 'Submit your seafood import notification',
      journeyId: randomUUID()
    })
  }
}

export const startGuidanceController = {
  async handler(request, h) {
    if (await startDraft(request, request.payload.journeyId)) {
      request.yar.touch()
    }
    return h
      .redirect('/notification/transport-details')
      .code(statusCodes.seeOther)
  }
}
