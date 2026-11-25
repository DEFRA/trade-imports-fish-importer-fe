# Reference data

The service loads commodity reference data at request time for the [commodity details page](notification-journey.md#commodity-details-page) form. It tries the configured external API first and caches the validated result in memory across requests.

## Configuration

Loading commodity data from the API requires two environment variables:

| Environment variable     | Purpose                                      |
| ------------------------ | -------------------------------------------- |
| `REFERENCE_DATA_API_URL` | Base URL of the commodity reference data API |
| `COMMODITIES_PATH`       | Path on that API to the commodities endpoint |

If either is empty, the loader treats it as an API failure and applies the fallback rules below.

## Loading and fallback behavior

[`getCommodities(logger)`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/reference-data/commodities.js) fetches commodity data from `{REFERENCE_DATA_API_URL}{COMMODITIES_PATH}` with a 10-second timeout. It validates and caches the result for reuse across requests.

**When `ENVIRONMENT` is explicitly set to `local`, `dev`, `test`, `perf-test`, or `ext-test`**, the service logs a warning and falls back to seeded data from [`commodities.json`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/src/server/services/reference-data/commodities.json) if the API load fails or returns invalid data. If the seeded data cannot be read or validated, the error is thrown.

**In all other supported environments, including `prod`, or when `ENVIRONMENT` is unset**, the service throws the original load error and the commodity details route returns HTTP 503.

The fallback does not depend on `NODE_ENV` or use the shared `local` default. The local development scripts explicitly set `ENVIRONMENT=local`. An unknown value such as `staging` is rejected at startup; see [Configuration](configuration.md).

## Validation

The service validates commodity data structure and logical consistency:

- Each commodity has a non-blank `code` and `name`, and a `species` array, which may be empty.
- Each species has a non-empty `faoCode` and `commonName`; `scientificName` is optional.
- Species `faoCode` values must be unique within a commodity after trimming and case-folding.
- Species `commonName` values must be distinguishable within a commodity after case-folding and whitespace normalization; duplicates and near-duplicates (e.g., "Salmon" and "salmon") are rejected.
- Commodity `code` values must be unique across the dataset after trimming and case-folding.

Validation errors throw with descriptive messages such as `Invalid commodity reference data`, `Invalid species reference data`, `Duplicate commodity code in reference data`, or `Ambiguous species reference data`.

## Caching

Concurrent requests share the same in-flight load. Once validated, the data is reused for subsequent requests within the same process. A successful load does not expire.

If loading fails without a successful fallback, the cache is cleared so the next request can retry.
