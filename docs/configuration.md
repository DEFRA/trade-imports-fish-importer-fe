# Configuration

[`src/config/config.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/config/config.js) defines and validates configuration with Convict. Production, development and test defaults are determined by exact `NODE_ENV` values. Times below are in milliseconds.

## Server and assets

| Environment variable     | Default                                 | Purpose                                                                                                                               |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`               | Not set by config                       | Selects environment-dependent defaults.                                                                                               |
| `HOST`                   | `0.0.0.0`                               | Bind address.                                                                                                                         |
| `PORT`                   | `3000`                                  | Bind port.                                                                                                                            |
| `SERVICE_VERSION`        | `null`                                  | Version included in ECS log configuration.                                                                                            |
| `ASSET_PATH`             | `/public`                               | Template asset prefix and production/test static route.                                                                               |
| `STATIC_CACHE_TIMEOUT`   | `604800000`                             | Static route cache lifetime, one week.                                                                                                |
| `ENABLE_SECURE_CONTEXT`  | `true` in production, otherwise `false` | Exposed as a config value, but not used to conditionally register the secure-context plugin.                                          |
| `HTTP_PROXY`             | `null`                                  | HTTP proxy configuration value.                                                                                                       |
| `ENVIRONMENT`            | `local`                                 | CDP environment, injected by the platform; one of `local`, `infra-dev`, `management`, `dev`, `test`, `perf-test`, `ext-test`, `prod`. |
| `NOTIFICATION_API_URL`   | Derived from `ENVIRONMENT`              | Base URL of the fish notification backend; see [Notification journey](notification-journey.md).                                       |
| `GOOGLE_TAG_MANAGER_KEY` | Empty string                            | Tag Manager container ID; see [Cookie consent](cookie-consent.md).                                                                    |

The service name is fixed in configuration as `trade-imports-fish-importer-fe`. `NOTIFICATION_API_URL` defaults to `http://localhost:8085` when `ENVIRONMENT` is `local`, and to `https://trade-imports-fish-be.{ENVIRONMENT}.cdp-int.defra.cloud` in CDP environments; set it explicitly to override. An `ENVIRONMENT` value outside the listed set fails config validation at startup.

Config exposes `HTTP_PROXY`; the application code does not itself configure an outbound HTTP client with this value.

Logging and tracing settings are described in [Logging and observability](logging-and-observability.md).

## Test user sign-in

| Environment variable        | Default | Purpose                                                                                |
| --------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `ENVIRONMENT`               | `local` | CDP environment, exposed as `cdpEnvironment`.                                          |
| `TEST_USER_SIGN_IN_ENABLED` | `false` | Enables the synthetic identity provider and its sign-in, sign-out and identity routes. |

When test user sign-in is enabled, `ENVIRONMENT` must be exactly `local`, `dev`
or `test`; other values reject startup. When `ENVIRONMENT` is unset, config
defaults it to `local`.
`NODE_ENV=production` remains valid for deployed dev/test and continues to
control secure-cookie and Redis defaults, not permission to enable test sign-in.
The development scripts explicitly set `ENVIRONMENT=local` and
`TEST_USER_SIGN_IN_ENABLED=true`.

Identities and organisation assignments come from the validated server-side JSON
catalogue. The former `TEST_ORGANISATION_ID` override is no longer read.
See [Local development](local-development.md) and
[Sessions and caching](sessions-and-caching.md).

## Sessions and Redis

| Environment variable        | Default                                   | Purpose                                                                            |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `SESSION_CACHE_ENGINE`      | `redis` in production, otherwise `memory` | Cache engine; allowed values are `redis` and `memory`.                             |
| `SESSION_CACHE_NAME`        | `session`                                 | Named Catbox cache and Yar session name.                                           |
| `SESSION_CACHE_TTL`         | `14400000`                                | Cache expiry, four hours.                                                          |
| `SESSION_COOKIE_TTL`        | `14400000`                                | Session cookie expiry, four hours.                                                 |
| `SESSION_COOKIE_PASSWORD`   | Development placeholder in config         | Yar and authentication cookie protection; supply a suitable secret for deployment. |
| `SESSION_COOKIE_SECURE`     | `true` in production, otherwise `false`   | Session cookie secure flag.                                                        |
| `REDIS_HOST`                | `127.0.0.1`                               | Redis host.                                                                        |
| `REDIS_USERNAME`            | Empty string                              | Redis username; credentials are passed when this is nonempty.                      |
| `REDIS_PASSWORD`            | Empty string                              | Redis password.                                                                    |
| `REDIS_KEY_PREFIX`          | `trade-imports-fish-importer-fe:`         | Redis key prefix.                                                                  |
| `USE_SINGLE_INSTANCE_CACHE` | `false` in production, otherwise `true`   | Use a single Redis instance rather than a cluster.                                 |
| `REDIS_TLS`                 | `true` in production, otherwise `false`   | Enable Redis TLS.                                                                  |

`SESSION_CACHE_ENGINE=false` is not a supported value. See [Sessions and caching](sessions-and-caching.md) for cache behavior.
