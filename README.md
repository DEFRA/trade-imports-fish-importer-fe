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
including public Docker Hub publication. Prereleases are started manually for these branch forms:

- `feature/FISB-1234` or `feature/FISB-1234-upload-documents`
- `bugfix/FISB-1234` or `bugfix/FISB-1234-fix-upload`
- `ci/FISB-1234` or `ci/FISB-1234-build-image`

Jira ticket numbers may contain any number of digits. Optional descriptions must use lowercase letters and numbers,
separated by single hyphens. Invalid or unsupported non-main branch names fail validation before publishing.

To publish a prerelease, open **Actions > Publish > Run workflow** in GitHub, select the supported branch, and click
**Run workflow**. Branch pushes do not publish prereleases automatically. The manual trigger must first be merged into
the default branch (`main`), and the selected branch must contain the updated workflow. Repository write access is required.
Selecting `main` manually publishes a normal release, not a prerelease.

The CDP build action uses only the lowercased Jira ticket as the prerelease suffix: for example, `fisb-1234`.
It manages version increments automatically, producing versions such as `1.6.0-fisb-1234.0` and `1.6.0-fisb-1234.1`.
Branches with the same Jira ticket share this suffix, regardless of branch prefix or description.

Prerelease images are published to ECR for ingestion and deployment through the CDP Portal, **not** to public Docker Hub.
After a supported branch build succeeds in GitHub Actions, check the resulting prerelease version in the CDP Portal.

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
