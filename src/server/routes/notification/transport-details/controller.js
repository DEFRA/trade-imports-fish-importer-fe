import {
  currentDraft,
  loadDraft,
  saveDraft
} from '#/server/services/notifications/draft-session.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { toTransportMethod } from '#/server/common/constants/transport-methods.js'
import { transportDetailsModel } from './model.js'

export const getTransportDetailsController = {
  async handler(request, h) {
    const notification = await loadDraft(request)
    return h.view(
      'notification/transport-details/index',
      transportDetailsModel(
        notification
          ? toTransportMethod(notification.notification.transport.mode)
          : undefined
      )
    )
  }
}

export const postTransportDetailsController = {
  async handler(request, h) {
    if (!currentDraft(request)) {
      return h
        .view('error/index', {
          pageTitle: 'Start again',
          heading: statusCodes.badRequest,
          message:
            'Your session has expired. Return to Transport details and try again.'
        })
        .code(statusCodes.badRequest)
    }
    await saveDraft(request, request.payload.transportMethod)
    return h
      .redirect('/notification/consignment-details')
      .code(statusCodes.seeOther)
  }
}
