# Notification journey

The [router plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/router.js) registers the guidance, transport details, consignment details, commodity details and next-step pages. Their code lives under [`src/server/routes/notification`](https://github.com/DEFRA/trade-imports-fish-importer-fe/tree/main/src/server/routes/notification).

The forward journey is guidance -> transport details -> consignment details -> commodity details. Back links on the implemented journey pages follow the reverse order, with guidance returning to the home page. The temporary `/notification/next-step` placeholder remains available directly with a Back link to consignment details.

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

| Method | Path                                | Behavior                                                                                                                                                                       |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/notification/consignment-details` | Loads a saved draft, pre-fills saved arrival and export details, and renders a Back link to transport details. Without a saved draft, redirects with 303 to transport details. |
| POST   | `/notification/consignment-details` | Validates arrival and export details, PATCHes a saved draft, redisplaying invalid values with HTTP 400 or redirecting with 303 to `/notification/commodity-details`.           |
| GET    | `/notification/next-step`           | Renders a temporary placeholder page with a Back link to consignment details.                                                                                                  |

- Consignment submissions require a CSRF token. Validation errors include a linked error summary, inline messages and an `Error:` page-title prefix.
- [Arrival validation](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/validation.js) interprets the entered date and time in `Europe/London`. Arrival must be at least two elapsed hours and no more than one calendar year after the server-clock instant captured at submission. Both bounds are inclusive, and submission seconds and milliseconds are retained; at 14:30:45, the earliest valid minute is 16:31.
- The calendar-year maximum keeps the UK-local time of day, clamping a 29 February anniversary to 28 February. If the anniversary falls in the spring-clock gap, it moves forward by that gap. Repeated autumn-clock times use their first occurrence, both for arrival input and the anniversary cutoff. Nonexistent spring-clock arrival times are rejected, not adjusted.
- Date and time are both required. Missing or malformed components retain their existing messages and field-specific highlighting; the combined arrival window is checked only once both date and time are complete and valid.
- Below the minimum, including past arrivals, the message is "The expected date and time of arrival must be at least 2 hours in the future". Above the maximum, it is "The expected date and time of arrival must be no more than 1 year in the future". Either error highlights all five date/time inputs and appears beside both groups, with one summary entry linking to the day input.
- A nonexistent arrival time instead shows "The expected time of arrival does not exist on this date because the UK clocks go forward", highlights hour and minute, and links one summary entry to hour. No window error is added for that input.
- Port options are temporarily seeded from the static [`ports.json`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/ports.json) file (read by `ports.js` at startup), not loaded from a live directory. A submitted port must match one of these values, otherwise "Select a port of entry from the list" is shown. Their option values are upper-case port codes while the visible names remain title case. The list currently contains seaports only, so an air freight importer cannot choose an airport; ask Jason who owns the port and airport reference data and when it will replace the seeded list.
- A valid submission sends `organisationId`, `notification.arrival`, `notification.countryOfExport` and, for rest-of-the-world countries, `notification.ched.reference` in one `PATCH /notifications/{id}` request. Arrival uses the selected port code, `YYYY-MM-DD` and `HH:mm`. The page does not create a notification; if the session has no draft, or an unsaved session draft is missing from the backend, POST returns the "Your session has expired..." 400 error view.
- The [seeded country list](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/countries.json) is provisional until MDM provides reference data. Only entries with two-letter upper-case values are offered or accepted. British Antarctic Territory and Akrotiri and Dhekelia are temporarily unavailable because their placeholder identifiers cannot be saved by the backend; ask Jason how to represent them.
- The prototype classifies EU-27 countries as EU and every other listed country as rest of the world. The SPS exemption is deferred until MDM; ask Jason which countries it covers and when the data will be available.
- A rest-of-the-world country requires a CHED reference in the fixed `CHEDP.GB.YYYY.NNNNNNN` format. The form trims and uppercases input before validation. Non-GB codes require a separate backend schema-change ticket, per Rajesh. The reference is not checked against another service.
- JavaScript reveals the CHED field for a rest-of-the-world country and clears it when an EU country is selected. Without JavaScript, the field remains visible for all countries and the server applies the same validation; the field is therefore visible for EU users in that mode.
- The existing expandable TRACES NT guidance is retained as requested by UX. [GOV.UK guidance](https://www.gov.uk/guidance/import-of-products-animals-food-and-feed-system) describes using IPAFFS for Great Britain import notifications; ask Jason and the product team to confirm the guidance destination.
- The existing dropdown and multi-question page are retained for the prototype. The GOV.UK Design System recommends selects only as a last resort and generally starting with one question per page; revisit the journey with user research.
- The page does not send `borderControlPost`. The backend preserves its stored value. Port and border-control-post reconciliation is deferred, so the stored value can become stale when the port changes. A transport-mode change also leaves the arrival unchanged. Ask Jason who sets the border control post, from which reference data, and when reconciliation occurs.
- GET pre-fills the port, date and time from `notification.arrival.portOfEntry`, `expectedArrivalDate` and `expectedArrivalTime` (not `expectedArrivalAt`). Day and month are shown without leading zeroes; hour and minute retain two digits. A port code absent from the seeded options is left unselected while the date and time remain. A saved arrival is pre-filled even if it is now past; submitting it again shows the normal minimum-window error.
- GET also preselects the saved country and prefills a saved CHED independently of arrival. A country absent from the seeded options is left unselected; a saved CHED string with an older format is prefilled but must pass the current validation when resubmitted. Back from consignment loads transport details with the saved method selected.

## Draft session

[`draft-session.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/draft-session.js) keeps a `notificationDraft` entry in the Yar session (see [Sessions and caching](sessions-and-caching.md)) holding `id`, optionally `reference`, the `organisationId` it was started under, and a `saved` flag.

- `loadDraft` on a first visit allocates only a session journey token with a random UUID (`saved: false`) and returns `null`; it does not create a backend draft notification. Otherwise it looks the notification up through the API client and refreshes the session entry.
- `loadSavedDraft` never starts a journey. It returns `null` when there is no session draft or when an unsaved session draft is not found on the backend; a saved draft missing from the backend still fails explicitly.
- `saveDraft` looks up the notification first. If found, it remembers it as `saved: true` before attempting PATCH, including when recovering a creation whose response was lost. The submitted selection can differ from the recovered mode.
- If an unsaved journey has no backend notification, `saveDraft` creates it with the existing journey UUID as the idempotency key. There is no automatic POST retry loop; a later submission performs GET-before-save again and retains the same UUID.
- Once a notification is found, created or updated, the session entry is rewritten with its `id` and `reference` and `saved: true`.
- `saveDraft` throws if there is no draft in the session ("No active notification journey").
- `saveConsignmentDetails` requires an existing draft on the backend, verifies the same organisation and reference checks as `saveDraft`, then PATCHes the submitted arrival and export details. It never creates a notification. A missing unsaved backend draft returns `null` so the page can show its expired-session error.
- Errors are thrown if the notification belongs to a different organisation, the reference differs from the one in the session (on load or save) or changes during an update, or a draft marked `saved` cannot be found.
- The organisation ID comes from the signed-in user's credentials (`request.auth.credentials.organisationId`). An error ("No signed-in importer organisation") is thrown if there is none.
- A session draft started under a different organisation is ignored, so a new draft is started when another organisation signs in on the same browser.
- A failed PATCH after recovery leaves the recovered draft marked saved. If a later GET cannot find it, the service fails explicitly rather than recreating it.
- Backend creation replays return the original creation representation, which can differ from the current mode after updates. Returning to transport details reads the current state through GET; it does not use a creation replay to restore the selected choice. No original-mode session field or additional recovery state machine is used.

## Notification API client

[`client.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/client.js) calls the backend at `NOTIFICATION_API_URL`, which defaults to `http://localhost:8085` locally and to `https://trade-imports-fish-be.{ENVIRONMENT}.cdp-int.defra.cloud` in CDP environments; see [Configuration](configuration.md).

| Operation | Request                     | Notes                                                                         |
| --------- | --------------------------- | ----------------------------------------------------------------------------- |
| `find`    | `GET /notifications/{id}`   | A 404 returns `null`; other non-200 statuses throw.                           |
| `create`  | `POST /notifications`       | Sends an `Idempotency-Key` header equal to the draft ID; 200 or 201 accepted. |
| `update`  | `PATCH /notifications/{id}` | 200 accepted; transport and consignment details can be patched independently. |

Each write sends `Content-Type: application/json` with only the signed-in organisation and the notification section being changed. A transport patch is:

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

A rest-of-the-world consignment patch is:

```json
{
  "organisationId": "represented-importer",
  "notification": {
    "arrival": {
      "portOfEntry": "FELIXSTOWE",
      "expectedArrivalDate": "2027-06-15",
      "expectedArrivalTime": "09:05"
    },
    "countryOfExport": "NO",
    "ched": { "reference": "CHEDP.GB.2026.1234567" }
  }
}
```

For an EU country, the frontend omits `ched`; the backend removes any previously saved CHED. These are partial updates, not JSON Merge Patch. Organisation and at least one supported section are required; explicit nulls, legacy `transportMethod` and unsupported notification write fields are rejected with 400. The frontend constructs a minimal payload instead of echoing a fetched notification or its other sections.

Successful responses include the following required envelope. The optional `arrival` section is shown when present:

```json
{
  "id": "a495eae6-c0c8-4b79-b032-f0bb8f2f377e",
  "reference": "GBN-FIS-26-AXN04",
  "organisationId": "represented-importer",
  "status": "DRAFT",
  "notification": {
    "transport": {
      "mode": "AIR_FREIGHT"
    },
    "arrival": {
      "portOfEntry": "FELIXSTOWE",
      "expectedArrivalDate": "2027-06-15",
      "expectedArrivalTime": "09:05",
      "expectedArrivalAt": "2027-06-15T08:05:00Z",
      "borderControlPost": "FELIXSTOWE"
    },
    "countryOfExport": "NO",
    "exportRegion": "REST_OF_WORLD",
    "ched": { "reference": "CHEDP.GB.2026.1234567" }
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
- Joi requires `id` (UUID), `reference` (pattern `GBN-FIS-NN-XXXXX`), `status` of `DRAFT`, `organisationId`, ISO `createdAt` and `updatedAt`, and nested `notification.transport.mode` in the canonical set. `notification.arrival` is optional; when present its port code, date, time and `expectedArrivalAt` are validated. Additional arrival fields such as `borderControlPost` are accepted and preserved. Legacy flat responses are not an alternative contract.
- Optional `countryOfExport`, `exportRegion` and `ched` are validated when present. The CHED reference can be absent or an older string format on read, so users can correct it; malformed response structures are rejected.
- The returned `id` must match the request. For writes, the organisation and every submitted notification field must match the response in the same canonical form as the request. For export details the client also checks the expected derived region and, for an EU save, that `ched` is absent.
- Validation preserves additional response sections and metadata, including within `notification` and `transport`. It checks the required frontend subset, not the complete backend schema, and does not reject or strip sections simply because the frontend cannot edit them.

## Commodity details page

| Method | Path                              | Behavior                                                                                                |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET    | `/notification/commodity-details` | Loads reference commodity data and renders the commodity selection interface with saved commodity rows. |
| POST   | `/notification/commodity-details` | Validates and saves committed commodities; returns JSON with status 200 on success or an error message. |

The commodity details page requires loaded reference data from [`getCommodities()`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/reference-data/commodities.js). If no saved draft is found for the journey, the page redirects (303) to `/notification/transport-details` instead of displaying the form. Otherwise, the page renders with the reference data and any previously saved commodities. The client-side script [`commodity-details.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/client/javascripts/commodity-details.js) handles the interactive dropdown selections and form submission.

Reference data loading, validation, and fallback behavior are described in [Reference data](reference-data.md).

POST validates the submitted commodity list JSON payload:

- Each commodity must have a `commodityCode`, optional `description`, and a non-empty `species` array.
- Each species entry requires a `speciesCode`, `commonName`, optional `scientificName`, and `netWeightKg`.
- Species codes must not duplicate within a commodity.
- Commodity codes must not duplicate across the submission.
- The sum of individual species weights must equal the commodity's `totalNetWeightKg`.

On validation failure, the handler returns HTTP 400 with a JSON error message: `{"message":"Invalid commodity details"}` or a specific conflict message. On success, it returns HTTP 200 with `{"success":true}`, having saved the commodities to the draft.

If reference data is unavailable, GET returns HTTP 503 with an error page. If the session has no active draft, the page redirects (303) to transport details.

## Validation boundaries and release dependency

The existing [API-client tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/client.test.js) mock fetch. [Draft-session tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/draft-session.test.js) mock the API client, while the [transport-route tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/transport-details/controller.test.js) and [consignment-route tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/controller.test.js) exercise the real frontend through `server.inject()` with that client mocked. The [arrival-validation tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/validation.test.js) cover form validation and API formatting; [transport-model tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/transport-details/model.test.js) exercise transport form presentation. These tests cover the frontend contract and recovery safeguards; they do not prove compatibility with a running backend or backend timestamp refresh behaviour. Real frontend-backend checks must be reported separately.

This frontend requires the matching backend release implementing nested canonical transport creation, transport, arrival and export-details PATCH, and GET as described above. It has no legacy API compatibility path. See [Deployment](deployment.md#notification-api-release-dependency) for the release dependency; coordination remains a separate team decision.
