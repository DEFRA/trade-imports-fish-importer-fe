# Logging and observability

## Logging

The application uses Hapi Pino. Configuration selects whether logging is enabled, the log level and output format. Production defaults to ECS-formatted logs; other environments default to `pino-pretty`. In production, authorization and cookie request headers and response headers are redacted by default. See [Configuration](configuration.md) for the corresponding environment variables.

Request logging ignores paths beginning `/public`, `/health` and `/favicon.ico`. The logger options also exclude `/health`. When a trace ID is available, the logger includes it as `trace.id`.

## Tracing and metrics

The request tracing plugin uses the configured `TRACING_HEADER`, which defaults to `x-cdp-request-id`. The server also registers the `@defra/cdp-metrics` plugin. The application code does not define additional metrics endpoints.

## Health and liveness

`GET /health` responds with HTTP 200 and `{"message":"success"}`. This route does not explicitly query Redis or other external dependencies. Hapi Pulse is registered with a ten-second timeout. See [Routes](routes.md) for the route inventory.
