# Notification journey

The [router plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/router.js) registers two notification pages: guidance and transport details. Their code lives under [`src/server/routes/notification`](https://github.com/DEFRA/trade-imports-fish-importer-fe/tree/main/src/server/routes/notification).

## Guidance page

`GET /notification/guidance` renders a page titled "Submit your seafood import notification" ([controller](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/guidance/controller.js), [tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/guidance/controller.test.js)). The home page's "Create a new import notification" button links here.

- Sections: Before you start, Documents you need, What happens when you upload your documents, Check the information carefully, and Related content.
- Two expandable details panels cover "Help with required documents" and "Help with additional documents".
- A "Back" link returns to `/`, and a related-content aside lists four guidance links.
- Viewing guidance does not start a journey. "Start now" submits a CSRF-protected `POST /notification/guidance`, starts a distinct browser journey and redirects to `/notification/transport-details`. Repeating the same Start request does not create another journey; a later Start from a newly loaded guidance page does.

## Transport details page

| Method | Path                              | Behavior                                                                                                                                                                                                                                        |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/notification/transport-details` | Loads the current journey and renders the page, preselecting the saved transport method. With no current journey, redirects to guidance.                                                                                                        |
| POST   | `/notification/transport-details` | Validates `transportMethod` and the journey ID, saves the current draft and redirects with 303 to `/notification/consignment-arrival-details`. A form from a superseded journey redirects to the current Transport details page without saving. |

Allowed `transportMethod` values come from [`transport-methods.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/common/constants/transport-methods.js): `ship-or-vessel`, `air-freight` and `road-vehicle`.

- Each guidance and transport details form carries a hidden `journeyId` field (a UUID). The guidance page generates a fresh one per render.
- If a current draft exists and the submitted `journeyId` differs from its ID (including a missing or invalid one), validation failure redirects with 303 to the current Transport details page before rendering validation errors. Otherwise (including when there is no draft), an invalid transport selection re-renders the page with status 400, an error summary and the message "Select how the consignment is being transported", and the page title is prefixed with `Error:`.
- If the session has no draft on POST, a 400 error view ("Your session has expired...") is returned instead of saving.
- The template includes the CSRF `crumb` hidden field and a back link to `/notification/guidance`. The router does not register the redirect target `/notification/consignment-arrival-details`.

## Draft session

[`draft-session.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/draft-session.js) keeps the current `notificationDraft` entry in the Yar session (see [Sessions and caching](sessions-and-caching.md)) holding `id`, the `organisationId` it was started under and, for older sessions, optionally `reference` and a `saved` flag. It also remembers Start request IDs in the session so a delayed retry cannot reactivate a superseded journey.

- Starting from guidance reserves a UUID in the browser session (`saved: false`); it does not persist a notification until the first valid Transport details save. `loadDraft` looks up an existing notification through the API client and refreshes the session entry.
- `saveDraft` looks up the existing notification first (to recover a first save whose response was lost), then updates it, or creates it if it does not exist.
- Once a notification is found, created or updated, its identity and reference are stored in a separate `saved-notification-drafts` cache segment. Loading and saving do not rewrite the Yar session, so a slow request for an older journey cannot restore it after a later Start.
- `saveDraft` throws if there is no draft in the session ("No active notification journey").
- Errors are thrown if the notification belongs to a different organisation, the reference differs from the one in the session or saved-draft cache (on load or save) or changes during an update, or a previously saved draft cannot be found.
- The organisation ID comes from the signed-in user's credentials (`request.auth.credentials.organisationId`). An error is thrown if there is none.
- A session draft started under a different organisation is ignored. Transport details redirects to guidance until the new organisation explicitly starts its own journey.
- Signing out does not clear the browser journey session. A same-organisation user can continue its current journey after signing back in while the session is valid.
- Starting another journey replaces the browser's current journey, not the previously persisted notification. Earlier saved drafts remain in the backend but there is no dashboard or route to discover and resume them in this increment. Opening Transport details in another tab without starting again uses the current journey; saving a form from before a later Start does not write to the new one.

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
