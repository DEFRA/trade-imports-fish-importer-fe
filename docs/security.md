# Security

The server configures Hapi route security with HSTS for one year, including subdomains but without preload, XSS protection, content-type sniffing protection and frame protection.

## Content security policy

The application registers Blankie with generated nonces for inline scripts. The policy defaults resources to the same origin; allows connections to Google Analytics and Tag Manager origins; restricts images, media, fonts, forms and manifests; sets `object-src` to `none`; and sets `frame-ancestors` to `none`. The exact directives are maintained in the [CSP plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/content-security-policy.js).

## CSRF

The application registers `@hapi/crumb` for CSRF protection. The cookie preference form includes a crumb token, and the asynchronous request sends it in the JSON body. The crumb cookie's secure flag is enabled in production. See [Cookie consent](cookie-consent.md) for the form and request behavior.

## Cookies and redirects

The session cookie's secure setting defaults to production-only; its password and TTL are configurable. The analytics preference cookie is secure in production. Cookie consent is not included in cached view responses: the consent plugin sets `Cache-Control: no-store`.

The cookie preference handler accepts a return path only when it begins with `/` and does not begin with `//`; other values redirect to the local cookie preferences page. This is the redirect check used by that handler, not a general redirect facility.
