# Notification journey

The transport details step is the only notification page registered by the [router plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/router.js). Its code lives in [`src/server/routes/notification/transport-details`](https://github.com/DEFRA/trade-imports-fish-importer-fe/tree/main/src/server/routes/notification/transport-details).

## Transport details page

| Method | Path                              | Behavior                                                                                                            |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/notification/transport-details` | Loads the draft and renders the page, preselecting the saved transport method.                                      |
| POST   | `/notification/transport-details` | Validates `transportMethod`, saves the draft and redirects with 303 to `/notification/consignment-arrival-details`. |

Allowed `transportMethod` values come from [`transport-methods.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/common/constants/transport-methods.js): `ship-or-vessel`, `air-freight` and `road-vehicle`.

- If validation fails (including no selection), the page is re-rendered with status 400, an error summary and the message "Select how the consignment is being transported", and the page title is prefixed with `Error:`.
- If the session has no draft on POST, a 400 error view ("Your session has expired...") is returned instead of saving.
- The template includes the CSRF `crumb` hidden field and a back link to `/notification/guidance`. The router does not register that path or the redirect target.

## Draft session

[`draft-session.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/draft-session.js) keeps a `notificationDraft` entry in the Yar session (see [Sessions and caching](sessions-and-caching.md)) holding `id`, optionally `reference`, and a `saved` flag.

- `loadDraft` on a first visit creates a session draft with a random UUID (`saved: false`) and returns `null`. Otherwise it looks the notification up through the API client and refreshes the session entry.
- `saveDraft` looks up the existing notification first (to recover a first save whose response was lost), then updates it, or creates it if it does not exist.
- Once a notification is found, created or updated, the session entry is rewritten with its `id` and `reference` and `saved: true`.
- `saveDraft` throws if there is no draft in the session ("No active notification journey").
- Errors are thrown if the notification belongs to a different organisation, the reference differs from the one in the session (on load or save) or changes during an update, or a draft marked `saved` cannot be found.
- The organisation ID is the constant `local-importer-organisation` ([`organisation.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/common/constants/organisation.js)).

## Notification API client

[`client.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/client.js) calls the backend at `NOTIFICATION_API_URL`, which defaults to `http://localhost:8085` locally and to `https://trade-imports-fish-be.{ENVIRONMENT}.cdp-int.defra.cloud` in CDP environments; see [Configuration](configuration.md).

| Operation | Request                   | Notes                                                                         |
| --------- | ------------------------- | ----------------------------------------------------------------------------- |
| `find`    | `GET /notifications/{id}` | A 404 returns `null`; other non-200 statuses throw.                           |
| `create`  | `POST /notifications`     | Sends an `Idempotency-Key` header equal to the draft ID; 200 or 201 accepted. |
| `update`  | `PUT /notifications/{id}` | 200 accepted.                                                                 |

- The payload is `{ organisationId, transportMethod }` as JSON.
- The configured tracing header (`TRACING_HEADER`) is forwarded when present on the incoming request.
- Redirects are not followed, and requests time out after 10 seconds.
- Responses are validated: `id` (UUID), `reference` (pattern `GBN-FIS-NN-XXXXX`), `status` of `DRAFT`, `organisationId`, `transportMethod`, `createdAt` and `updatedAt`. The returned `id` must match the request, and for writes the organisation and transport method must match what was sent.
