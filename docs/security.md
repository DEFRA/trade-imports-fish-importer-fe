# Security

The server configures Hapi route security with HSTS for one year, including subdomains but without preload, XSS protection, content-type sniffing protection and frame protection.

## Content security policy

The application registers Blankie with generated nonces for inline scripts. The policy defaults resources to the same origin; allows connections to Google Analytics and Tag Manager origins; restricts images, media, fonts, forms and manifests; sets `object-src` to `none`; and sets `frame-ancestors` to `none`. The exact directives are maintained in the [CSP plugin](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/plugins/content-security-policy.js).

## CSRF

The application registers `@hapi/crumb` for CSRF protection. Cookie preferences,
test user sign-in and sign-out require valid crumb tokens. The asynchronous
cookie preference request sends the token in the JSON body. The crumb cookie's
secure flag is enabled in production. See [Cookie consent](cookie-consent.md)
for the cookie preference form and request behavior.

## Authentication

Application routes require a server-side session by default. The current test
identity provider is an explicitly enabled, non-production alternative, not real
identity verification or DEFRA SSO. Enabling it when `ENVIRONMENT` is not
`local`, `dev`, `test` or `ext-test` rejects startup (`ENVIRONMENT` defaults to `local` when
unset). Disabling it does not make protected application routes public.

The browser selects an allowlisted test user ID; names and organisation details
are resolved from validated server-only JSON, not trusted from browser fields.
The HttpOnly, SameSite=Strict authentication cookie contains only a random
reference; the identity is held in the existing memory/Redis cache. Sign-in
renews the reference and sign-out invalidates it. Removed users or changed
organisation assignments invalidate affected sessions without a Redis-wide flush.

The unlinked `/dev/identity` page requires authentication, is non-cacheable and
only exists when test user sign-in is enabled in an allowed environment. It is
the current sign-out location; no header control is added. Future backend calls
must use organisation context from `request.auth.credentials`, with a separately
agreed backend authentication and authorisation contract. An organisation ID
alone is not proof of authority.

## Cookies and redirects

The session cookie's secure setting defaults to production-only; its password and TTL are configurable. The analytics preference cookie is secure in production. Cookie consent is not included in cached view responses: the consent plugin sets `Cache-Control: no-store`.

Cookie preferences and sign-in use a shared internal-redirect guard. A return
path must begin with `/`, must not begin with `//`, and must not contain
backslashes or control characters. Invalid sign-in destinations return HTTP 400;
invalid cookie preference destinations redirect to the local preferences page.
