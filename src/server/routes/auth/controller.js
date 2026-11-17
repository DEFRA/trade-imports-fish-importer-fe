import { randomUUID } from 'node:crypto'

import {
  findTestUser,
  getTestUsers
} from '#/server/common/helpers/test-users.js'

function signInPage(request, h, errorMessage) {
  const heading = 'Test user sign-in'
  return h
    .view('auth/sign-in', {
      pageTitle: errorMessage ? `Error: ${heading}` : heading,
      heading,
      signInUrl: `/auth/sign-in?returnTo=${encodeURIComponent(request.query.returnTo)}`,
      testUsers: getTestUsers().map((user) => ({
        value: user.userId,
        text: user.name,
        hint: { text: user.organisationName }
      })),
      error: errorMessage ? { text: errorMessage } : undefined
    })
    .header('Cache-Control', 'no-store')
}

export const authController = {
  signInPage,

  async signIn(request, h) {
    const user = findTestUser(request.payload.testUserId)
    if (!user) {
      return signInPage(request, h, 'Select a test user').code(400)
    }

    const previousSessionId = request.auth.credentials?.sessionId
    if (previousSessionId) {
      await request.server.app.authCache.drop(previousSessionId)
    }

    const sessionId = randomUUID()
    await request.server.app.authCache.set(sessionId, {
      sessionId,
      ...user,
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
    const { userId, name, organisationId, organisationName, identitySource } =
      request.auth.credentials
    return h
      .view('auth/identity', {
        pageTitle: 'Test user sign-in identity',
        userId,
        name,
        organisationId,
        organisationName,
        identitySource
      })
      .header('Cache-Control', 'no-store')
  }
}
