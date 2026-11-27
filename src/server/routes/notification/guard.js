import { statusCodes } from '#/server/common/constants/status-codes.js'
import {
  currentDraft,
  loadSavedDraft
} from '#/server/services/notifications/draft-session.js'

export function notificationJourneyGuard({
  requiresTransport = false,
  validateWithoutDraft = false
} = {}) {
  return {
    async method(request, h) {
      const draft = await currentDraft(request)
      request.app.notificationDraft = draft
      if (!draft) {
        if (validateWithoutDraft) {
          return h.continue
        }
        request.logger.info(
          'Redirecting request without a started notification'
        )
        return h
          .redirect('/notification/guidance')
          .code(statusCodes.seeOther)
          .takeover()
      }
      if (requiresTransport) {
        const notification = await loadSavedDraft(request, draft)
        if (!notification) {
          request.logger.info(
            'Redirecting request without saved transport details'
          )
          return h
            .redirect('/notification/transport-details')
            .code(statusCodes.seeOther)
            .takeover()
        }
        request.app.notification = notification
      }
      if (
        request.method === 'post' &&
        request.payload?.journeyId !== draft.id
      ) {
        request.logger.warn('Rejecting form for an inactive notification')
        return h.redirect(request.path).code(statusCodes.seeOther).takeover()
      }
      return h.continue
    }
  }
}
