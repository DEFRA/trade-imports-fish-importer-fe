# trade-imports-fish-importer-fe

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-imports-fish-importer-fe&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-imports-fish-importer-fe)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-imports-fish-importer-fe&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-imports-fish-importer-fe)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-imports-fish-importer-fe&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-imports-fish-importer-fe)

Core delivery platform Node.js Frontend Template.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Server-side Caching](#server-side-caching)
- [Redis](#redis)
- [Local Development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
  - [Update dependencies](#update-dependencies)
  - [Formatting](#formatting)
    - [Windows prettier issue](#windows-prettier-issue)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Publishing](#publishing)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Requirements

### Node.js

Please install Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd trade-imports-fish-importer-fe
nvm use
```

## Server-side Caching

We use Catbox for server-side caching. By default the service will use CatboxRedis when deployed and CatboxMemory for
local development.
You can override the default behaviour by setting the `SESSION_CACHE_ENGINE` environment variable to either `redis` or
`memory`.

Please note: CatboxMemory (`memory`) is _not_ suitable for production use! The cache will not be shared between each
instance of the service and it will not persist between restarts.

## Redis

Redis is an in-memory key-value store. Every instance of a service has access to the same Redis key-value store similar
to how services might have a database (or MongoDB). All frontend services are given access to a namespaced prefixed that
matches the service name. e.g. `my-service` will have access to everything in Redis that is prefixed with `my-service`.

If your service does not require a session cache to be shared between instances or if you don't require Redis, you can
disable setting `SESSION_CACHE_ENGINE=false` or changing the default value in `src/config/index.js`.

## Proxy

We are using forward-proxy which is set up by default. Services are automatically configured with the proxy environment variables when deployed.

Node.js 24 uses these variables to route outbound HTTP(S) requests through the proxy:

NODE_USE_ENV_PROXY=1
HTTPS_PROXY=...
NO_PROXY=...

No additional proxy configuration is required in the service.

## Local Development

### Setup

Install application dependencies:

```bash
npm install
```

### Git hooks

Install git hooks (optional)

```bash
npm run git:hooks
```

### Development

To run the application in `development` mode run:

```bash
npm run dev
```

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json)
To view them in your command line run:

```bash
npm run
```

### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

#### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## Docker

### Development image

> [!TIP]
> For Apple Silicon users, you may need to add `--platform linux/amd64` to the `docker run` command to ensure
> compatibility fEx: `docker build --platform=linux/arm64 --no-cache --tag trade-imports-fish-importer-fe`

Build:

```bash
docker build --target development --no-cache --tag trade-imports-fish-importer-fe:development .
```

Run:

```bash
docker run -p 3000:3000 trade-imports-fish-importer-fe:development
```

### Production image

Build:

```bash
docker build --no-cache --tag trade-imports-fish-importer-fe .
```

Run:

```bash
docker run -p 3000:3000 trade-imports-fish-importer-fe
```

### Publishing

The [Publish workflow](.github/workflows/publish.yml) automatically publishes normal releases on pushes to `main`,
including public Docker Hub publication. Prereleases are temporarily published automatically on pushes to these branch forms:

- `feature/FISB-1234-upload-documents`
- `bugfix/FISB-1234-fix-upload`
- `ci/FISB-1234-build-image`

Jira ticket numbers may contain any number of digits. A description after the ticket number is required and must use lowercase letters and numbers,
separated by single hyphens. Invalid or unsupported non-main branch names fail validation before publishing.

To publish a prerelease, push changes to a supported branch containing the updated workflow.
Non-main publishing rejects HEAD if it carries a stable release tag (`1.6.0` or `v1.6.0`, including annotated tags),
before invoking the CDP build action. Add a new commit after the stable release before publishing a branch created
at that release; otherwise CDP can reuse the stable ECR image tag despite prerelease mode.
Prerelease tags alone do not block publishing. The non-main checkout fetches full history and tags for this check,
and a failed Git inspection stops publishing rather than bypassing validation.
The manual trigger and manual-only build condition are temporarily commented out in the workflow.
Normal releases still run only on pushes to `main`.

The CDP build action receives a prerelease suffix containing the full branch name, lowercased with `/` replaced by `-`,
followed by `-run-<GITHUB_RUN_ID>-attempt-<GITHUB_RUN_ATTEMPT>`.
For example, `feature/FISB-1234-upload-documents` produces versions such as
`1.6.0-feature-fisb-1234-upload-documents-run-1658821493-attempt-1.0`.
Branch prefixes and descriptions distinguish branches even when they share the same Jira ticket.
The run ID uniquely identifies a workflow run within the repository; starting another publish uses a new run ID.
The attempt starts at `1` and increments when that same workflow run is rerun, while its run ID remains unchanged.
CDP discovers previous prereleases only among tags reachable from the branch. Rebasing can remove a tagged commit from
that history, so the branch name alone cannot prevent reuse of an earlier version. The run/attempt component keeps
prerelease suffixes distinct across publishes and reruns even after a rebase.
CDP still manages the version base, but each publishing attempt starts a separate suffix sequence, normally ending in `.0`.
Existing versions and tags remain untouched. Missing or invalid run identifiers fail validation before prerelease publishing.

Keep branch names short enough for Docker image tags: the complete version, including the suffix and build number,
must fit within 128 characters. Validation rejects suffixes over 120 characters, including the run ID and attempt,
because even `0.0.0-<suffix>.0`
would exceed that limit. This is only an upper bound, not a guarantee: a longer version base or build number leaves less
room, and CDP's intermediate build-stage image tags add their own prefix and stage name. Names are never silently truncated.

Prerelease images are published to ECR for ingestion and deployment through the CDP Portal, **not** to public Docker Hub.
After a supported branch build succeeds in GitHub Actions, check the resulting prerelease version in the CDP Portal.
The full-branch/run/attempt format still needs a live Portal check for readability, truncation and version selection,
including a realistic longer branch name. Verify distinct Git and image tags by publishing a branch, rebasing and
publishing again, then rerunning the workflow. Use a branch with untagged changes and no `#none` token for this check:
The released-HEAD check prevents reuse due to no new commits, but the upstream action can still return a stable tag
before prerelease generation when version bumping is skipped by `#none`; that separate case is not covered by this guard.
Automatic tag cleanup is not enabled; it requires review after the Portal check. Deleting Git tags would not delete ECR images.

### Docker Compose

A local environment with:

- Floci (replacing Localstack) for AWS services (S3, SQS)
- Redis
- MongoDB
- This service.
- A commented out backend example.

```bash
docker compose up --build -d
```

### Dependabot

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](.github/example.dependabot.yml) to `.github/dependabot.yml`

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties).

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
