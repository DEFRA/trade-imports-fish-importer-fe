import {
  loadDraft,
  saveDraft
} from '#/server/services/notifications/draft-session.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { transportDetailsModel } from './model.js'

export const getTransportDetailsController = {
  async handler(request, h) {
    const draft = request.app.notificationDraft
    const notification = await loadDraft(request, draft)
    return h.view(
      'notification/transport-details/index',
      transportDetailsModel(
        notification?.notification.transport.mode,
        false,
        draft.id
      )
    )
  }
}

export const postTransportDetailsController = {
  async handler(request, h) {
    const draft = request.app.notificationDraft
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
    await saveDraft(request, request.payload.transportMethod, draft)
    return h
      .redirect('/notification/consignment-details')
      .code(statusCodes.seeOther)
  }
}
