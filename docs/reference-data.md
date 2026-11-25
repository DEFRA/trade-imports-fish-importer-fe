# Reference data

The service loads commodity reference data at request time for the [commodity details page](notification-journey.md#commodity-details-page) form. Reference data is fetched from a configured external API and cached in memory across requests.

## Configuration

Commodity reference data loading requires two environment variables:

| Environment variable     | Purpose                                      |
| ------------------------ | -------------------------------------------- |
| `REFERENCE_DATA_API_URL` | Base URL of the commodity reference data API |
| `COMMODITIES_PATH`       | Path on that API to the commodities endpoint |

Both must be set; if either is empty, `getCommodities()` throws immediately.

## Loading and fallback behavior

[`getCommodities(logger)`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/reference-data/commodities.js) fetches commodity data from `{REFERENCE_DATA_API_URL}{COMMODITIES_PATH}` with a 10-second timeout. It validates and caches the result for reuse across requests.

**In production** (`isProduction: true`), if the API is unavailable or returns invalid data, the error is thrown and the request fails with HTTP 503. This ensures data accuracy in production.

**In development** (`isProduction: false`), if the API fetch fails or validation fails, the service falls back to a local fixture file at [`src/server/services/reference-data/commodities.json`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/reference-data/commodities.json). A warning is logged. This fixture is cached and reused for all subsequent requests in that session.

If both API and fixture validation fail in development, the error is thrown.

## Validation

The service validates commodity data structure and logical consistency:

- Each commodity has a non-empty `code` and `name`, and a non-empty `species` array.
- Each species has a non-empty `faoCode` and `commonName`; `scientificName` is optional.
- Species `faoCode` values must be unique within a commodity.
- Species `commonName` values must be distinguishable within a commodity after case-folding and whitespace normalization; duplicates and near-duplicates (e.g., "Salmon" and "salmon") are rejected.
- Commodity `code` values must be unique across the dataset.

Validation errors throw with descriptive messages such as `Invalid commodity reference data`, `Invalid species reference data`, `Duplicate commodity code in reference data`, or `Ambiguous species reference data`.

## Caching

Once loaded and validated, commodity data is cached in a module-level variable and reused for all subsequent requests within the same process. The cache does not expire; it is cleared only when the application restarts or when a request explicitly clears it via `vi.resetModules()` in tests.

If a fetch fails, the cache is cleared so the next request attempts a fresh load (or falls back to the fixture in development).
