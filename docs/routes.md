# Routes

The [router plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/router.js) registers the following routes. Trailing slashes are stripped by the server.

| Method | Path       | Behavior                                                                                                                                            |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`        | Requires a session and renders the fish importer home page.                                                                                         |
| GET    | `/about`   | Requires a session and renders the about page with breadcrumbs.                                                                                     |
| GET    | `/health`  | Returns HTTP 200 and `{"message":"success"}`. This checks that the service handles the request; it does not explicitly check external dependencies. |
| GET    | `/cookies` | Renders cookie preferences.                                                                                                                         |
| POST   | `/cookies` | Saves cookie preferences. See [Cookie consent](cookie-consent.md) for payload and response details.                                                 |

Application routes require the `session` strategy by default. Health checks,
cookie policy and consent updates, favicon and assets explicitly remain public.
Unauthenticated protected GETs redirect to sign-in when test user sign-in is
enabled, preserving a validated internal destination. Protected POSTs receive
HTTP 401. With test user sign-in disabled and no other authentication provider,
application routes remain protected and return HTTP 401.

The following routes are registered only when `TEST_USER_SIGN_IN_ENABLED=true`
and `ENVIRONMENT` is `local`, `dev` or `test`:

| Method | Path             | Behavior                                                                                              |
| ------ | ---------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/auth/sign-in`  | Displays the GOV.UK radio selection form without establishing a session.                              |
| POST   | `/auth/sign-in`  | Validates the selected synthetic user and CSRF token, renews the session and redirects with HTTP 303. |
| POST   | `/auth/sign-out` | Requires a session and CSRF token; invalidates the session and redirects with HTTP 303.               |
| GET    | `/dev/identity`  | Requires a session and displays its identity and Sign out button; unlinked and non-cacheable.         |

These routes are absent when test user sign-in is disabled. See
[Local development](local-development.md) and [Security](security.md).

The [home template](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/home/index.njk) displays an import-notification introduction and an empty imports message, but its start button has `href="#"`. No notification-creation or upload route is registered in the current router.

In production and test modes, the [static file plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/serve-static-files.js) serves GET requests under the configured asset path from `.public`, with private caching, and responds to `GET /favicon.ico` with 204. In other modes the router mounts Vite middleware at `/public` instead. See [Client assets](client-assets.md).

Route behavior is covered by the [home](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/home/controller.test.js), [about](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/about/controller.test.js), [health](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/health/controller.test.js) and [cookie](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/cookies/controller.test.js) tests.
