export const environment = {
  plugin: {
    name: 'environment-diagnostics',
    register(server) {
      server.route({
        method: 'GET',
        path: '/dev/environment',
        options: { auth: false },
        handler(_request, h) {
          return h
            .view('dev/environment', {
              pageTitle: 'Deployment environment',
              environment: process.env.ENVIRONMENT || 'Not set'
            })
            .header('Cache-Control', 'no-store')
        }
      })
    }
  }
}
