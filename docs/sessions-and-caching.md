# Sessions and caching

The application registers Yar for server-side sessions and names its Catbox cache with the configured session cache name. Blank sessions are not stored, `maxCookieSize` is `0` so session data is always held server-side in the cache (the cookie carries only the session identifier), the cache must be ready before use, and cache and session-cookie expiration are configured separately. The session cookie uses the configured password and secure flag.

Authentication separately uses `@hapi/cookie` and the same configured cache's
`auth-sessions` segment. Its protected browser cookie contains only a random
session reference. Cached credentials contain the selected user's ID, name,
organisation ID and name, identity source `test-user` and internal session ID.
Yar and unrelated session data remain unchanged.

Sign-in renews the session and invalidates the previous reference; sign-out
drops that authentication cache entry and clears the cookie. Separate browsers
have independent sessions even when they select the same test user. Each request
checks catalogue membership and organisation assignment. Removed users, changed
organisation assignments and the former `stub-user-1` identity are rejected;
display-label changes remain a snapshot until the next sign-in. No migration or
Redis-wide flush is performed.

Existing cache/cookie TTL settings also apply to authentication. Memory-backed
authentication sessions are lost on frontend restart.

Routes using session authentication read the authentication cache before cookie
validation. A failed read is logged and returns HTTP 503 using the standard error
page, without clearing the authentication cookie or running the route handler.
This also applies to sign-in requests carrying an existing session reference,
even though sign-in uses optional authentication. Once the cache recovers, the
same cookie can be used if the session is still valid. Public routes do not read
the authentication cache. Missing, expired and invalid sessions retain the
existing sign-in redirect or HTTP 401 behaviour and invalid-cookie clearing.

## Cache engines

`SESSION_CACHE_ENGINE` selects `redis` or `memory`. Production defaults to Redis; other environments default to memory. If memory is selected in production, the application logs an error but still creates the memory cache. Memory is process-local and does not share session data between application instances.

Redis uses port 6379 and database 0. `USE_SINGLE_INSTANCE_CACHE` selects a Redis instance or a cluster; TLS, username, password and key prefix are configurable. See [Configuration](configuration.md) for names and defaults.

The notification journey stores its current draft identifier under `notificationDraft` and previously used Start request identifiers under `notificationStartedJourneys`. A separate `saved-notification-drafts` cache segment tracks persisted draft references so asynchronous loads and saves do not rewrite the browser session; see [Notification journey](notification-journey.md).

The Redis client logs connection and error events. The server configures the cache engine during startup; see [Server startup](server-startup.md).
