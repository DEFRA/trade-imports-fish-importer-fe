import { randomUUID } from 'node:crypto'

import { config } from '#/config/config.js'

export const authController = {
  signInPage(request, h) {
    return h
      .view('auth/sign-in', {
        pageTitle: 'Test user sign-in',
        signInUrl: `/auth/sign-in?returnTo=${encodeURIComponent(request.query.returnTo)}`
      })
      .header('Cache-Control', 'no-store')
  },

  async signIn(request, h) {
    const previousSessionId = request.auth.credentials?.sessionId
    if (previousSessionId) {
      await request.server.app.authCache.drop(previousSessionId)
    }

    const sessionId = randomUUID()
    await request.server.app.authCache.set(sessionId, {
      sessionId,
      userId: 'stub-user-1',
      name: 'Stub User',
      organisationId: config.get('auth.testOrganisationId'),
      identitySource: 'test-user'
    })

    request.cookieAuth.set({ sessionId })
    return h
      .redirect(request.query.returnTo)
      .code(303)
      .header('Cache-Control', 'no-store')
  },

  async signOut(request, h) {
    await request.server.app.authCache.drop(request.auth.credentials.sessionId)
    request.cookieAuth.clear()
    return h.redirect('/').code(303).header('Cache-Control', 'no-store')
  },

  identity(request, h) {
    const { userId, name, organisationId, identitySource } =
      request.auth.credentials
    return h
      .view('auth/identity', {
        pageTitle: 'Test user sign-in identity',
        userId,
        name,
        organisationId,
        identitySource
      })
      .header('Cache-Control', 'no-store')
  }
}
