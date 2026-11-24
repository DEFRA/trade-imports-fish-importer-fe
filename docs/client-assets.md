# Client assets

The browser entry point, `src/client/javascripts/application.js`, initializes the cookie-consent client module and the GOV.UK Button, Checkboxes, ErrorSummary, Radios and SkipLink components. It also initializes the commodity details page script, described in [Notification journey](notification-journey.md). The cookie behavior is documented in [Cookie consent](cookie-consent.md).

## Build

[Vite configuration](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/vite.config.js) builds three entries: `src/client/assets.html`, the application JavaScript and `src/client/stylesheets/application.scss`. Build output goes to `.public`, includes a manifest and source maps, and uses `/public` as the base path. Run `npm run build:frontend` to build the assets.

The asset HTML entry declares GOV.UK Frontend icons and manifests for Vite to emit; those files are referenced directly from templates. The application stylesheet imports GOV.UK Frontend and local styles, including the `commodity-details` partial ([`_commodity-details.scss`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/client/stylesheets/_commodity-details.scss)). That partial styles the commodity and species dropdowns (`app-commodity-dropdown*`, `app-commodity-option`, `app-commodity-species`), the Remove button (`app-remove-commodity`) and, from the tablet breakpoint, the species and weight column widths.

## Serving and resolving asset URLs

In development (except test mode), the router mounts Vite middleware at `/public`. In production and test modes, the static-file plugin serves `.public` under `ASSET_PATH` (default `/public`) and applies a private cache lifetime configured by `STATIC_CACHE_TIMEOUT`.

The template `getAssetPath()` helper returns the source path under the asset prefix outside production. In production, it looks up the path in `.public/.vite/manifest.json`, falling back to the original path if the manifest or entry is missing. The Vite base and development mount are fixed at `/public`; changing `ASSET_PATH` alone does not change them. See [Configuration](configuration.md) for the environment variable defaults and [Views and templates](views-and-templates.md) for template usage.
