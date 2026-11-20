# Routes

The [router plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/router.js) registers the following routes. Trailing slashes are stripped by the server.

| Method | Path       | Behavior                                                                                                                                            |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`        | Renders the fish importer home page.                                                                                                                |
| GET    | `/about`   | Renders the about page with breadcrumbs.                                                                                                            |
| GET    | `/health`  | Returns HTTP 200 and `{"message":"success"}`. This checks that the service handles the request; it does not explicitly check external dependencies. |
| GET    | `/cookies` | Renders cookie preferences.                                                                                                                         |
| POST   | `/cookies` | Saves cookie preferences. See [Cookie consent](cookie-consent.md) for payload and response details.                                                 |

The [home template](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/home/index.njk) displays an import-notification introduction and an empty imports message, but its start button has `href="#"`. No notification-creation or upload route is registered in the current router.

In production and test modes, the [static file plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/serve-static-files.js) serves GET requests under the configured asset path from `.public`, with private caching, and responds to `GET /favicon.ico` with 204. In other modes the router mounts Vite middleware at `/public` instead. See [Client assets](client-assets.md).

Route behavior is covered by the [home](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/home/controller.test.js), [about](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/about/controller.test.js), [health](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/health/controller.test.js) and [cookie](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/cookies/controller.test.js) tests.
