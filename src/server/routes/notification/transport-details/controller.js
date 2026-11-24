import {
  currentDraft,
  loadDraft,
  saveDraft
} from '#/server/services/notifications/draft-session.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { transportDetailsModel } from './model.js'

export const getTransportDetailsController = {
  async handler(request, h) {
    if (!currentDraft(request)) {
      return h.redirect('/notification/guidance').code(statusCodes.seeOther)
    }
    const notification = await loadDraft(request)
    return h.view(
      'notification/transport-details/index',
      transportDetailsModel(
        notification?.transportMethod,
        false,
        currentDraft(request).id
      )
    )
  }
}

export const postTransportDetailsController = {
  async handler(request, h) {
    const draft = currentDraft(request)
    if (!draft) {
      return h
        .view('error/index', {
          pageTitle: 'Start again',
          heading: statusCodes.badRequest,
          message:
            'Your session has expired. Return to Transport details and try again.'
        })
        .code(statusCodes.badRequest)
    }
    if (draft.id !== request.payload.journeyId) {
      return h
        .redirect('/notification/transport-details')
        .code(statusCodes.seeOther)
    }
    await saveDraft(request, request.payload.transportMethod)
    return h
      .redirect('/notification/consignment-arrival-details')
      .code(statusCodes.seeOther)
  }
}
