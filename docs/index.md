# Documentation overview

For setup basics see the [repository README](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/README.md).

| Document                                                  | Covers                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Server startup and plugins](server-startup.md)           | Entry point, `createServer()`, plugin order, error handler                   |
| [Routes](routes.md)                                       | Route table, route module layout, static assets                              |
| [Notification journey](notification-journey.md)           | Guidance, transport and consignment details pages, draft session, API client |
| [Reference data](reference-data.md)                       | Commodity data loading, validation, caching, production vs development       |
| [Configuration](configuration.md)                         | All config keys, environment variables, and defaults                         |
| [Sessions and caching](sessions-and-caching.md)           | Yar session, Catbox engines, Redis client                                    |
| [Cookie consent](cookie-consent.md)                       | Consent cookie, banner, `/cookies` routes, client-side behaviour             |
| [Security](security.md)                                   | Security headers, CSP, CSRF, authentication, cookie and redirect safety      |
| [Views and templates](views-and-templates.md)             | Nunjucks setup, shared context, layout, globals and filters                  |
| [Client assets](client-assets.md)                         | Vite build, runtime asset serving, JavaScript and SCSS                       |
| [Logging and observability](logging-and-observability.md) | Logger, request logging and tracing, health check, Pulse                     |
| [Local development](local-development.md)                 | npm scripts, Docker Compose stack, tests, linting                            |
| [Deployment](deployment.md)                               | Dockerfile stages, production runtime, CI workflows                          |
