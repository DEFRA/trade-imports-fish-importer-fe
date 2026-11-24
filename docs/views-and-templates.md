# Views and templates

The application uses Nunjucks through Hapi Vision. The [Nunjucks configuration](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/config/nunjucks/nunjucks.js) loads route views from `src/server/routes` and searches GOV.UK Frontend, shared templates and components for imports and includes. Autoescaping is enabled; undefined values do not throw. Nunjucks watching and no-cache mode are enabled when `NODE_ENV=development`; Vision view caching is enabled in production.

The shared page layout extends the GOV.UK template and provides the header, service navigation, Alpha phase banner, breadcrumbs, footer and asset references. The phase banner's feedback link temporarily points to the home page. The service navigation displays `insServiceName` as plain text, without navigation links. Shared context provides the service names, asset helper and breadcrumbs. Consent state and banner behavior are described in [Cookie consent](cookie-consent.md).

Registered filters are `assign`, `formatDate` and `formatCurrency`; the `govukRebrand` global is `true`. `formatDate` accepts a Date or ISO string and defaults to `EEE do MMMM yyyy`. `formatCurrency` defaults to locale `en-GB` and currency `GBP`.

Client files are built and served separately; see [Client assets](client-assets.md).
