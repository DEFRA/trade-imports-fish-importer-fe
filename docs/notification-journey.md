# Notification journey

The [router plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/router.js) registers three notification pages: guidance, transport details and consignment details. Their code lives under [`src/server/routes/notification`](https://github.com/DEFRA/trade-imports-fish-importer-fe/tree/main/src/server/routes/notification).

The implemented forward journey is guidance -> transport details -> consignment details. A successful consignment submission redirects to the unregistered `/notification/next-step` URL, which returns the normal 404 page. Back links on the implemented pages follow the reverse order, with guidance returning to the home page.

## Guidance page

`GET /notification/guidance` renders a static page titled "Submit your seafood import notification" ([controller](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/guidance/controller.js), [tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/guidance/controller.test.js)). The home page's "Create a new import notification" button links here.

- Sections: Before you start, Documents you need, What happens when you upload your documents, Check the information carefully, and Related content.
- Two expandable details panels cover "Help with required documents" and "Help with additional documents".
- A "Back" link returns to `/`, and a related-content aside lists four guidance links.
- The "Start now" button links directly to `/notification/transport-details`. The page does not create a session draft; that happens when the transport details page loads.

## Transport details page

| Method | Path                              | Behavior                                                                                                    |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET    | `/notification/transport-details` | Loads the draft and renders the page, preselecting the saved transport method.                              |
| POST   | `/notification/transport-details` | Validates `transportMethod`, saves the draft and redirects with 303 to `/notification/consignment-details`. |

The business term is **transport mode**; `transportMethod` remains the browser form field name. The shared choices and bidirectional translation come from [`transport-methods.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/common/constants/transport-methods.js):

| Label          | Browser value    | Canonical API mode |
| -------------- | ---------------- | ------------------ |
| Ship or vessel | `ship-or-vessel` | `VESSEL`           |
| Air freight    | `air-freight`    | `AIR_FREIGHT`      |
| Road vehicle   | `road-vehicle`   | `ROAD_VEHICLE`     |

The draft service translates the validated browser selection when constructing a write payload. The transport controller translates the canonical mode returned by GET back to the browser value for preselection. The API client uses the canonical contract, while the form model uses only browser values. Radio values, field identifiers and labels are unchanged.

- If validation fails (including no selection), the page is re-rendered with status 400, an error summary and the message "Select how the consignment is being transported", and the page title is prefixed with `Error:`.
- If the session has no draft on POST, a 400 error view ("Your session has expired...") is returned instead of saving.
- The template includes the CSRF `crumb` hidden field and a back link to `/notification/guidance`.

## Consignment details

| Method | Path                                | Behavior                                                                                                                   |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/notification/consignment-details` | Renders an empty port of entry and expected arrival date/time form with a Back link to transport details.                  |
| POST   | `/notification/consignment-details` | Validates arrival details, redisplaying invalid values with HTTP 400 or redirecting with 303 to `/notification/next-step`. |

- Consignment submissions require a CSRF token. Validation errors include a linked error summary, inline messages and an `Error:` page-title prefix.
- [Arrival validation](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/validation.js) interprets the entered date and time in `Europe/London`. Arrival must be at least two elapsed hours and no more than one calendar year after the server-clock instant captured at submission. Both bounds are inclusive, and submission seconds and milliseconds are retained; at 14:30:45, the earliest valid minute is 16:31.
- The calendar-year maximum keeps the UK-local time of day, clamping a 29 February anniversary to 28 February. If the anniversary falls in the spring-clock gap, it moves forward by that gap. Repeated autumn-clock times use their first occurrence, both for arrival input and the anniversary cutoff. Nonexistent spring-clock arrival times are rejected, not adjusted.
- Date and time are both required. Missing or malformed components retain their existing messages and field-specific highlighting; the combined arrival window is checked only once both date and time are complete and valid.
- Below the minimum, including past arrivals, the message is "The expected date and time of arrival must be at least 2 hours in the future". Above the maximum, it is "The expected date and time of arrival must be no more than 1 year in the future". Either error highlights all five date/time inputs and appears beside both groups, with one summary entry linking to the day input.
- A nonexistent arrival time instead shows "The expected time of arrival does not exist on this date because the UK clocks go forward", highlights hour and minute, and links one summary entry to hour. No window error is added for that input.
- Port options are temporarily seeded, not loaded from a live directory. Existing form labels, examples and hints are unchanged.
- The consignment page does not save arrival data, call the notification API or create/change a notification draft. It preserves the transport draft already held in the session.
- Back from consignment loads transport details with the saved method selected. Revisiting consignment details loads an empty form.

## Draft session

[`draft-session.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/draft-session.js) keeps a `notificationDraft` entry in the Yar session (see [Sessions and caching](sessions-and-caching.md)) holding `id`, optionally `reference`, the `organisationId` it was started under, and a `saved` flag.

- `loadDraft` on a first visit allocates only a session journey token with a random UUID (`saved: false`) and returns `null`; it does not create a backend draft notification. Otherwise it looks the notification up through the API client and refreshes the session entry.
- `saveDraft` looks up the notification first. If found, it remembers it as `saved: true` before attempting PATCH, including when recovering a creation whose response was lost. The submitted selection can differ from the recovered mode.
- If an unsaved journey has no backend notification, `saveDraft` creates it with the existing journey UUID as the idempotency key. There is no automatic POST retry loop; a later submission performs GET-before-save again and retains the same UUID.
- Once a notification is found, created or updated, the session entry is rewritten with its `id` and `reference` and `saved: true`.
- `saveDraft` throws if there is no draft in the session ("No active notification journey").
- Errors are thrown if the notification belongs to a different organisation, the reference differs from the one in the session (on load or save) or changes during an update, or a draft marked `saved` cannot be found.
- The organisation ID comes from the signed-in user's credentials (`request.auth.credentials.organisationId`). An error is thrown if there is none.
- A session draft started under a different organisation is ignored, so a new draft is started when another organisation signs in on the same browser.
- A failed PATCH after recovery leaves the recovered draft marked saved. If a later GET cannot find it, the service fails explicitly rather than recreating it.
- Backend creation replays return the original creation representation, which can differ from the current mode after updates. Returning to transport details reads the current state through GET; it does not use a creation replay to restore the selected choice. No original-mode session field or additional recovery state machine is used.

## Notification API client

[`client.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/client.js) calls the backend at `NOTIFICATION_API_URL`, which defaults to `http://localhost:8085` locally and to `https://trade-imports-fish-be.{ENVIRONMENT}.cdp-int.defra.cloud` in CDP environments; see [Configuration](configuration.md).

| Operation | Request                     | Notes                                                                         |
| --------- | --------------------------- | ----------------------------------------------------------------------------- |
| `find`    | `GET /notifications/{id}`   | A 404 returns `null`; other non-200 statuses throw.                           |
| `create`  | `POST /notifications`       | Sends an `Idempotency-Key` header equal to the draft ID; 200 or 201 accepted. |
| `update`  | `PATCH /notifications/{id}` | 200 accepted, including an unchanged mode.                                    |

Both writes send `Content-Type: application/json` with only the signed-in organisation and canonical transport mode:

```json
{
  "organisationId": "represented-importer",
  "notification": {
    "transport": {
      "mode": "AIR_FREIGHT"
    }
  }
}
```

This is the matching backend's documented partial-update contract, not JSON Merge Patch. Organisation and mode are required; empty patches, explicit nulls, legacy `transportMethod` and unsupported notification write fields are rejected with 400. The frontend constructs this minimal supported payload instead of echoing a fetched notification or its other sections.

Successful responses use this required shape:

```json
{
  "id": "a495eae6-c0c8-4b79-b032-f0bb8f2f377e",
  "reference": "GBN-FIS-26-AXN04",
  "organisationId": "represented-importer",
  "status": "DRAFT",
  "notification": {
    "transport": {
      "mode": "AIR_FREIGHT"
    }
  },
  "createdAt": "2026-11-16T16:00:00.123Z",
  "updatedAt": "2026-11-16T17:00:00.123Z"
}
```

- The matching backend returns 201 for creation and 200 for an identical creation replay, both with `Location`; the journey UUID becomes the notification ID. The client accepts these statuses without adding a separate `Location` validation requirement.
- PATCH returns 200 even for an unchanged mode. The matching backend contract refreshes `updatedAt` after successful saves; the frontend does not skip unchanged saves or generate timestamps itself.
- GET returns 200 with current state. Only GET 404 returns `null`; failed writes, other unexpected statuses, malformed responses and network/timeout errors propagate as failures and do not produce a successful browser redirect.
- The configured tracing header (`TRACING_HEADER`) is forwarded when present on the incoming request.
- Redirects are not followed, and requests time out after 10 seconds.
- Joi requires `id` (UUID), `reference` (pattern `GBN-FIS-NN-XXXXX`), `status` of `DRAFT`, `organisationId`, ISO `createdAt` and `updatedAt`, and nested `notification.transport.mode` in the canonical set. Legacy flat responses are not an alternative contract.
- The returned `id` must match the request. For writes, the organisation and canonical response mode must match the canonical request mode, not the browser presentation value.
- Validation preserves additional response sections and metadata, including within `notification` and `transport`. It checks the required frontend subset, not the complete backend schema, and does not reject or strip sections simply because the frontend cannot edit them.

## Validation boundaries and release dependency

The existing [API-client tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/client.test.js) mock fetch. [Draft-session tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/draft-session.test.js) mock the API client, while [transport-route tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/transport-details/controller.test.js) exercise the real frontend through `server.inject()` with that client mocked. [Model tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/transport-details/model.test.js) exercise form validation and presentation directly. These tests cover the frontend contract and recovery safeguards; they do not prove compatibility with a running backend or backend timestamp refresh behaviour. Real frontend-backend checks must be reported separately.

This frontend requires the matching backend release implementing the nested canonical transport POST/PATCH/GET contract described above. It has no legacy API compatibility path. See [Deployment](deployment.md#notification-api-release-dependency) for the release dependency; coordination remains a separate team decision.
