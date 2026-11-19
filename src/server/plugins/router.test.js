import { createServer as createViteServer } from 'vite'

import { config } from '#/config/config.js'
import { router } from './router.js'

vi.mock('vite', () => ({
  createServer: vi.fn()
}))

describe('#router development assets', () => {
  let server
  const middlewares = vi.fn()
  const originalConfig = {
    isProduction: config.get('isProduction'),
    isTest: config.get('isTest')
  }

  beforeEach(async () => {
    config.set('isProduction', false)
    config.set('isTest', false)
    createViteServer.mockResolvedValue({ middlewares })
    server = {
      register: vi.fn().mockResolvedValue(undefined),
      rules: vi.fn()
    }

    await router.plugin.register(server)
  })

  afterEach(() => {
    config.set('isProduction', originalConfig.isProduction)
    config.set('isTest', originalConfig.isTest)
  })

  test('keeps development assets public and registers Vite middleware', () => {
    expect(createViteServer).toHaveBeenCalledWith({
      server: { middlewareMode: true },
      appType: 'custom'
    })
    expect(server.register).toHaveBeenCalledWith({
      plugin: expect.objectContaining({ name: 'connect' }),
      options: {
        path: '/public',
        middleware: [middlewares]
      }
    })

    const [resolveRules] = server.rules.mock.calls[0]

    expect(resolveRules({}, { path: '/public/{param*}' })).toEqual({
      auth: false
    })
  })

  test.each(['/protected', '/publicity/{param*}'])(
    'does not override authentication for %s',
    (path) => {
      const [resolveRules] = server.rules.mock.calls[0]

      expect(resolveRules({}, { path })).toBeUndefined()
    }
  )
})
