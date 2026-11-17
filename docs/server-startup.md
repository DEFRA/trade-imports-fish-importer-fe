# Server startup

The application entry point, [`src/index.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/index.js), awaits `startServer()`. The helper creates the server, starts it, logs that it is listening and returns the Hapi server instance. The host defaults to `0.0.0.0` and the port to `3000`; see [Configuration](configuration.md).

`createServer()` in [`src/server/server.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/server.js) creates Hapi with trailing-slash normalization, request validation configured to report all validation errors, `.public` as the static file root, and the configured session-cache engine.

The plugin registration sequence is request logger, tracing, CDP metrics, secure context, pulse, content security policy, session cache, Nunjucks/Vision, Scooter, CSRF, cookie consent and the router. A final `onPreResponse` extension handles Boom errors. See [Logging and observability](logging-and-observability.md), [Security](security.md) and [Sessions and caching](sessions-and-caching.md) for those responsibilities.

If an unhandled promise rejection occurs, the entry point logs the rejection and sets `process.exitCode` to `1`.
