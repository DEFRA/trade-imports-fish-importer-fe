# Deployment

## Container image

The [Dockerfile](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/Dockerfile) defines development and production build stages. The production stage copies the application source and built `.public` assets from the build stage, installs production dependencies with `npm ci --omit=dev`, and starts Node with `node src`.

## Publishing

The [Publish workflow](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/.github/workflows/publish.yml) runs on pushes to `main` and manual dispatch. The workflow's job conditions and publish settings script determine whether a run proceeds and its release versioning. It builds frontend assets, runs tests and invokes the CDP build action to build and publish.

The [Publish Hot Fix workflow](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/.github/workflows/publish-hotfix.yml) is manually dispatched. It builds the frontend, runs formatting, lint and tests, then invokes the CDP hotfix build action. Image publishing details are handled by those external CDP actions.

Pull requests to `main` run security audit, frontend build, formatting, lint, tests and a Docker image build in the [pull request workflow](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/.github/workflows/check-pull-request.yml).

## Dependency updates

[Dependabot](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/.github/dependabot.yml) is configured for npm packages and GitHub Actions, checking weekly on Mondays at 10:30 Europe/London. The npm configuration allows up to 10 open pull requests, updates direct dependencies only, uses the `increase` versioning strategy, ignores `eslint` and `eslint-*`, and groups related packages (`build`, `lint`, `logging`, `tools` and `types`) into shared pull requests.

## Local Compose environment

Run the local services with:

```bash
docker compose up --build -d
```

The [Compose file](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/compose.yml) defines the frontend, Redis, MongoDB and Floci. The frontend uses Redis as a single instance without TLS. A backend service is present only as a commented example; the MongoDB and Floci initialization scripts contain examples rather than active database seed or cloud-resource setup.

## Documentation publishing

The documentation workflow in `.github/workflows/build-docs.yml` builds the MkDocs site in strict mode on relevant pull requests and pushes to `main`. For non-pull-request events it deploys the built site to GitHub Pages.
