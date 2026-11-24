import { randomUUID } from 'node:crypto'

import { startDraft } from '#/server/services/notifications/draft-session.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

export const guidanceController = {
  handler(_request, h) {
    return h.view('notification/guidance/index', {
      pageTitle: 'Submit your seafood import notification',
      heading: 'Submit your seafood import notification',
      journeyId: randomUUID()
    })
  }
}

export const startGuidanceController = {
  handler(request, h) {
    startDraft(request, request.payload.journeyId)
    return h
      .redirect('/notification/transport-details')
      .code(statusCodes.seeOther)
  }
}
