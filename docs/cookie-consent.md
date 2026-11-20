# Cookie consent

The [cookie policy manager](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/common/helpers/cookie-policy-manager.js) creates a default policy of `confirmed: false`, `essential: true` and `analytics: false` when none exists. The consent cookie is named `trade-imports-fish-importer-fe_policy`, encoded as `base64json`, has `SameSite=Lax` and a one-year TTL, and is secure in production. Invalid cookies are cleared.

The [consent plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/cookie-consent.js) adds the policy and current path to eligible view responses and sets `Cache-Control: no-store`. The shared layout shows the banner when the policy is not confirmed. For an explicitly rejected policy, the server attempts to expire matching Google Analytics cookies found in the request.

## Preferences

[`GET /cookies`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/routes/cookies/controller.js) renders the preferences page. Its optional `updated` query parameter is a boolean and defaults to `false`.

`POST /cookies` requires a boolean `analytics`; `async` is an optional boolean defaulting to `false`, and `returnUrl` is an optional string up to 2,000 characters. Crumb CSRF protection also applies. The handler sets `confirmed` to true and saves the choice.

- With `async: true`, it returns `{"message":"success"}`.
- Otherwise it redirects to `returnUrl` if it starts with `/` but not `//`; otherwise it redirects to `/cookies?updated=true`.
- When analytics is rejected, it attempts to expire request cookies named `_ga` or `_gid`, or prefixed `_ga_`, `_gat_` or `_dc_gtm_`.

The banner works as a form without JavaScript. With JavaScript, the [client module](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/client/javascripts/cookies.js) shows a confirmation and sends an asynchronous JSON request with the crumb; it attempts a native form submission on a network or non-2xx response. Acceptance attempts to load Tag Manager immediately if the key matches `GTM-` followed by uppercase letters or digits. Rejection attempts browser-side deletion of matching analytics cookies across hostname and parent-domain variants. Cookie deletion depends on browser cookie attributes and is not guaranteed for every existing cookie.

## Analytics

The [shared layout](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/common/templates/layouts/page.njk) includes the Google Tag Manager script and noscript partials only when the policy has `analytics: true`; those partials also require a nonempty `GOOGLE_TAG_MANAGER_KEY`. Actual tracking depends on the configured container and external service. The browser code also deletes matching cookies on a persisted `pageshow` before reloading, and attempts stale-cookie cleanup when no banner and no GTM script are present.
