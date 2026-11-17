import {
  currentDraft,
  loadDraft,
  saveDraft
} from '#/server/services/notifications/draft-session.js'
import { transportDetailsModel } from './model.js'

export const getTransportDetailsController = {
  async handler(request, h) {
    const notification = await loadDraft(request)
    return h.view(
      'notification/transport-details/index',
      transportDetailsModel(notification?.transportMethod)
    )
  }
}

export const postTransportDetailsController = {
  async handler(request, h) {
    if (!currentDraft(request)) {
      return h
        .view('error/index', {
          pageTitle: 'Start again',
          heading: 400,
          message:
            'Your session has expired. Return to Transport details and try again.'
        })
        .code(400)
    }
    await saveDraft(request, request.payload.transportMethod)
    return h.redirect('/notification/consignment-arrival-details').code(303)
  }
}
