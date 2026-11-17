# Sessions and caching

The application registers Yar for server-side sessions and names its Catbox cache with the configured session cache name. Blank sessions are not stored, the cache must be ready before use, and cache and session-cookie expiration are configured separately. The session cookie uses the configured password and secure flag.

## Cache engines

`SESSION_CACHE_ENGINE` selects `redis` or `memory`. Production defaults to Redis; other environments default to memory. If memory is selected in production, the application logs an error but still creates the memory cache. Memory is process-local and does not share session data between application instances.

Redis uses port 6379 and database 0. `USE_SINGLE_INSTANCE_CACHE` selects a Redis instance or a cluster; TLS, username, password and key prefix are configurable. See [Configuration](configuration.md) for names and defaults.

The Redis client logs connection and error events. The server configures the cache engine during startup; see [Server startup](server-startup.md).
