# Notification journey

The [router plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/router.js) registers the guidance, transport details, consignment details and next-step pages. Their code lives under [`src/server/routes/notification`](https://github.com/DEFRA/trade-imports-fish-importer-fe/tree/main/src/server/routes/notification).

The forward journey is guidance -> transport details -> consignment details, followed by a redirect to `/notification/commodity-details`. That route is not yet registered and returns 404 until the commodity details page is integrated. The temporary `/notification/next-step` placeholder remains available directly with a Back link to consignment details, but is no longer the onward destination. Back links on the implemented journey pages follow the reverse order, with guidance returning to the home page.

## Route guarding

Transport and consignment routes use the shared [notification journey guard](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/guard.js) through Hapi's route-level `onPostAuth` extension. It runs on GET and POST after session loading, authentication and CSRF checks, but before form validation and the page handler.

- Without a notification started for the signed-in organisation, both pages redirect with 303 to guidance, except for a valid Transport POST. Transport validates the submitted form in this case: a valid submission shows the existing 400 "Your session has expired" response; an invalid submission redirects to guidance. Neither saves anything.
- Consignment additionally requires a saved notification for the active draft ID. The API response contract requires valid transport details, so a saved notification establishes this prerequisite without a separate session progress counter. An unsaved draft redirects with 303 to transport details, even when the submitted arrival fields are invalid.
- With an active draft, POST forms must carry its `journeyId`. A missing or different ID is rejected without saving or displaying validation errors. Once the page's prerequisites are met, the rejected submission redirects with 303 to that same page for the current notification. No message or banner is added; the rejection is logged. Rendering and saving use the draft checked by the guard, not the result of a second lookup that could pick up a newer Start.
- Completed pages remain accessible and pre-fill their saved answers. Revisiting or editing transport does not clear saved arrival details. Only persisted answers establish progress; page visits and invalid submissions do not unlock later pages.
- Viewing guidance does not reset access. Starting a different notification replaces the active draft ID, so the previous notification's saved transport cannot unlock consignment for the new one.
- Backend and cache failures propagate to the normal error response rather than being treated as an unfinished prerequisite.

The guard controls access and stale-form rejection, not successful onward navigation. In particular, it does not change the existing consignment redirect to the unimplemented next-step page.

## Guidance page

`GET /notification/guidance` renders a page titled "Submit your seafood import notification" ([controller](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/guidance/controller.js), [tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/guidance/controller.test.js)). The home page's "Create a new import notification" button links here.

- Sections: Before you start, Documents you need, What happens when you upload your documents, Check the information carefully, and Related content.
- Two expandable details panels cover "Help with required documents" and "Help with additional documents".
- A "Back" link returns to `/`, and a related-content aside lists four guidance links.
- Viewing guidance does not start a journey. "Start now" submits a CSRF-protected `POST /notification/guidance`, starts a distinct browser journey and redirects to `/notification/transport-details`. Repeating the same Start request does not create another journey; a later Start from a newly loaded guidance page does.

## Transport details page

| Method | Path                              | Behavior                                                                                                                                                                                                                                |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/notification/transport-details` | Loads the current journey and renders the page, preselecting the saved transport method. With no current journey, redirects to guidance.                                                                                                |
| POST   | `/notification/transport-details` | Validates `transportMethod` and the journey ID, saves the current draft and redirects with 303 to `/notification/consignment-details`. A form from a superseded journey redirects to the current Transport details page without saving. |

The `transportMethod` radios submit the API's **transport mode** codes. The form and the API response validator use the same [transport choices](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/common/constants/transport-methods.js):

| Label          | Form and API value |
| -------------- | ------------------ |
| Ship or vessel | `VESSEL`           |
| Air freight    | `AIR_FREIGHT`      |
| Road vehicle   | `ROAD_VEHICLE`     |

The draft service saves the selected value as `notification.transport.mode`. When the importer returns, the saved mode selects the matching radio without translation.

- Guidance, transport and consignment forms carry a hidden `journeyId` field (a UUID). The guidance page generates a fresh one per render; the question pages use the active draft ID, including on validation-error redisplay.
- After the route guard passes, an invalid transport selection re-renders the page with status 400, an error summary and the message "Select how the consignment is being transported", and the page title is prefixed with `Error:`.
- The template includes the CSRF `crumb` hidden field and a back link to `/notification/guidance`.

## Consignment details

| Method | Path                                | Behavior                                                                                                                                                                                                       |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/notification/consignment-details` | After route guarding, pre-fills any saved arrival and export details using the notification loaded by the guard, and renders a Back link to transport details.                                                 |
| POST   | `/notification/consignment-details` | After route guarding and draft-ID checks, validates arrival and export details, PATCHes a saved draft, redisplaying invalid values with HTTP 400 or redirecting with 303 to `/notification/commodity-details`. |
| GET    | `/notification/next-step`           | Renders a temporary placeholder page with a Back link to consignment details.                                                                                                                                  |

- Consignment submissions require a CSRF token and the active draft ID. Validation errors include a linked error summary, inline messages and an `Error:` page-title prefix.
- The date hint shows "For example, D M YYYY". Starting two UK calendar days from today, it uses the first date with a day of 13 or more and a month from January to September, following [GOV.UK guidance on example dates](https://design-system.service.gov.uk/patterns/dates/#how-to-write-dates). This rule applies only to the example, not to the dates importers can enter. The server recalculates the hint on GET and validation-error redisplay without changing entered or saved values. An open page keeps its example until the next server render.
- [Arrival validation](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/validation.js) interprets the entered date and time in `Europe/London`. Arrival must be at least two elapsed hours and no more than one calendar year after the server-clock instant captured at submission. Both bounds are inclusive, and submission seconds and milliseconds are retained; at 14:30:45, the earliest valid minute is 16:31.
- The calendar-year maximum keeps the UK-local time of day, clamping a 29 February anniversary to 28 February. If the anniversary falls in the spring-clock gap, it moves forward by that gap. Repeated autumn-clock times use their first occurrence, both for arrival input and the anniversary cutoff. Nonexistent spring-clock arrival times are rejected, not adjusted.
- Date and time are both required. Missing or malformed components retain their existing messages and field-specific highlighting; the combined arrival window is checked only once both date and time are complete and valid.
- Below the minimum, including past arrivals, the message is "The expected date and time of arrival must be at least 2 hours in the future". Above the maximum, it is "The expected date and time of arrival must be no more than 1 year in the future". Either error highlights all five date/time inputs and appears beside both groups, with one summary entry linking to the day input.
- A nonexistent arrival time instead shows "The expected time of arrival does not exist on this date because the UK clocks go forward", highlights hour and minute, and links one summary entry to hour. No window error is added for that input.
- Port options are temporarily seeded from the static [`ports.json`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/ports.json) file (read by `ports.js` at startup), not loaded from a live directory. A submitted port must match one of these values, otherwise "Select a port of entry from the list" is shown. Their option values are upper-case port codes while the visible names remain title case. The list currently contains seaports only, so an air freight importer cannot choose an airport; ask Jason who owns the port and airport reference data and when it will replace the seeded list.
- A valid submission sends `organisationId`, `notification.arrival`, `notification.countryOfExport` and, for rest-of-the-world countries, `notification.ched.reference` in one `PATCH /notifications/{id}` request. Arrival uses the selected port code, `YYYY-MM-DD` and `HH:mm`. The page does not create a notification; the route guard redirects requests that have no active draft or have not saved transport before validation or saving.
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

[`draft-session.js`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/draft-session.js) uses the browser's opaque Yar session ID to access a separate journey store (see [Sessions and caching](sessions-and-caching.md)). The store holds the current journey ID and organisation, plus used Start IDs. Start registration and replacement are atomic across instances sharing Redis, so overlapping Starts cannot lose a used ID or reactivate an older journey on retry while the journey session is valid. Existing Yar `notificationDraft` and `notificationStartedJourneys` entries are migrated on first access.

- The [journey store](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/journey-store.js) is created in `server.js` with the session cache TTL. With Redis, state is stored as JSON under the key `notification-journey:{sessionId}` with that TTL in milliseconds. Otherwise it is held in an in-process map whose entries expire after the same TTL.
- Migrating existing Yar values (`initialize`) only writes when no store state exists (Redis `SET ... NX`). `start` returns `false` without changing state if the journey ID was already used, so repeated Starts are idempotent; with Redis it runs as a single Lua script, and the in-process fallback does the same check in one synchronous step.
- Viewing guidance establishes an opaque browser session, but only Start reserves a journey UUID (`saved: false`). No backend notification is persisted until the first valid Transport details save. `loadDraft` looks up an existing notification through the API client.
- `loadSavedDraft` never starts a journey. It returns `null` when there is no session draft or when an unsaved session draft is not found on the backend; a saved draft missing from the backend still fails explicitly.
- `saveDraft` looks up the notification first. If found, it remembers it in the saved-draft cache before attempting PATCH, including when recovering a creation whose response was lost. The submitted selection can differ from the recovered mode.
- If an unsaved journey has no backend notification, `saveDraft` creates it with the existing journey UUID as the idempotency key. There is no automatic POST retry loop; a later submission performs GET-before-save again and retains the same UUID.
- Once a notification is found, created or updated, its identity and reference are stored in a separate `saved-notification-drafts` cache segment. Loading and saving do not rewrite the journey state, so a slow request for an older journey cannot restore it after a later Start.
- `saveDraft` throws if there is no active journey ("No active notification journey").
- On a valid consignment POST, the guard loads and checks the saved notification once. `saveConsignmentDetails` uses that notification's ID to PATCH only the submitted arrival and export details, without another GET or session lookup. It checks the returned reference against the one the guard read. If the PATCH fails, the request fails; it never creates a replacement notification.
- Errors are thrown if the notification belongs to a different organisation, the reference differs from the one in the session or saved-draft cache (on load or save) or changes during an update, or a previously saved draft cannot be found.
- The organisation ID comes from the signed-in user's credentials (`request.auth.credentials.organisationId`). An error is thrown if there is none.
- A session draft started under a different organisation is ignored. Transport details redirects to guidance until the new organisation explicitly starts its own journey.
- Signing out does not clear the browser journey session. A same-organisation user can continue its current journey after signing back in while the session is valid.
- Starting another journey replaces the browser's current journey, not the previously persisted notification. Earlier saved drafts remain in the backend but there is no dashboard or route to discover and resume them in this increment. Opening Transport details in another tab without starting again uses the current journey; saving a form from before a later Start does not write to the new one.
- A failed PATCH after recovery leaves the recovered draft in the saved-draft cache. If a later GET cannot find it, the service fails explicitly rather than recreating it.
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

## Validation boundaries and release dependency

The existing [API-client tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/client.test.js) mock fetch. [Draft-session tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/notifications/draft-session.test.js) mock the API client, while the [transport-route tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/transport-details/controller.test.js) and [consignment-route tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/controller.test.js) exercise the real frontend through `server.inject()` with that client mocked. The [arrival-validation tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/consignment-details/validation.test.js) cover form validation and API formatting; [transport-model tests](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/notification/transport-details/model.test.js) exercise transport form presentation. These tests cover the frontend contract and recovery safeguards; they do not prove compatibility with a running backend or backend timestamp refresh behaviour. Real frontend-backend checks must be reported separately.

This frontend requires the matching backend release implementing nested canonical transport creation, transport, arrival and export-details PATCH, and GET as described above. It has no legacy API compatibility path. See [Deployment](deployment.md#notification-api-release-dependency) for the release dependency; coordination remains a separate team decision.
