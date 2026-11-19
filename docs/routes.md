# Routes

The [router plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/router.js) registers the following routes. Trailing slashes are stripped by the server.

| Method | Path                                | Behavior                                                                                                                                                    |
| ------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`                                 | Renders the fish importer home page.                                                                                                                        |
| GET    | `/about`                            | Renders the about page with breadcrumbs.                                                                                                                    |
| GET    | `/notification/guidance`            | Renders the "Submit your seafood import notification" guidance page. See [Notification journey](notification-journey.md).                                   |
| GET    | `/health`                           | Returns HTTP 200 and `{"message":"success"}`. This checks that the service handles the request; it does not explicitly check external dependencies.         |
| GET    | `/cookies`                          | Renders cookie preferences.                                                                                                                                 |
| POST   | `/cookies`                          | Saves cookie preferences. See [Cookie consent](cookie-consent.md) for payload and response details.                                                         |
| GET    | `/notification/transport-details`   | Renders the transport method radios, preselected from the saved draft. See [Notification journey](notification-journey.md).                                 |
| POST   | `/notification/transport-details`   | Validates and saves the transport method, then redirects (303) to `/notification/consignment-details`. See [Notification journey](notification-journey.md). |
| GET    | `/notification/consignment-details` | Renders the port of entry and expected arrival date/time form, with a Back link to transport details.                                                       |
| POST   | `/notification/consignment-details` | Validates arrival details without saving them, then redirects (303) to `/notification/next-step`.                                                           |

Application routes require the `session` authentication strategy by default. `/health`, `/cookies` (GET and POST) and the static asset routes set `auth: false`, so they are public. Unauthenticated GET requests are redirected to `/auth/sign-in` when test user sign-in is enabled; other requests receive HTTP 401. See [Security](security.md).

When `TEST_USER_SIGN_IN_ENABLED` is true, the router also registers the [test user auth routes](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/auth/index.js):

| Method | Path             | Behavior                                                                                                                                                                                 |
| ------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/auth/sign-in`  | Renders the test user selection form (optional session). The `returnTo` query defaults to `/`, is limited to 2,000 characters and must pass the safe-redirect check, otherwise HTTP 400. |
| POST   | `/auth/sign-in`  | Validates the selected `testUserId`, creates a new session and redirects (303) to `returnTo`. An unknown or empty selection re-renders the form with HTTP 400.                           |
| POST   | `/auth/sign-out` | Requires a session; drops it, clears the cookie and redirects (303) to `/`.                                                                                                              |
| GET    | `/dev/identity`  | Requires a session; shows the signed-in test identity.                                                                                                                                   |

Responses from these routes send `Cache-Control: no-store`. In development mode the Vite `/public` mount is also exempted from authentication so the sign-in page can load assets.

The [home template](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/home/index.njk) displays an import-notification introduction and an empty imports message. Its "Create a new import notification" start button links to `/notification/guidance`. The notification journey continues through transport details and consignment details, then redirects to the unregistered `/notification/next-step` URL, which returns the normal 404 page. Back links on the implemented journey pages return to the preceding page.

In production and test modes, the [static file plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/serve-static-files.js) serves GET requests under the configured asset path from `.public`, with private caching, and responds to `GET /favicon.ico` with 204. In other modes the router mounts Vite middleware at `/public` instead. See [Client assets](client-assets.md).

Route behavior is covered by the [home](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/home/controller.test.js), [guidance](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/guidance/controller.test.js), [transport](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/transport-details/controller.test.js), [consignment](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/controller.test.js), [about](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/about/controller.test.js), [health](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/health/controller.test.js) and [cookie](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/cookies/controller.test.js) tests.
