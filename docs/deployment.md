# Deployment

## Container image

The [Dockerfile](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/Dockerfile) defines development and production build stages. The production stage copies the application source and built `.public` assets from the build stage, installs production dependencies with `npm ci --omit=dev`, and starts Node with `node src`.

## Publishing

The [Publish workflow](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/.github/workflows/publish.yml) runs on pushes to `main` and manual dispatch. Its build job is skipped for the first workflow run, and runs only for pushes to `main` or manual dispatches from a branch other than `main`. The `scripts/configure-publish-settings.js` script sets the prerelease, prerelease suffix and Docker Hub push inputs. The job installs dependencies, builds frontend assets, runs tests, invokes the CDP build action to build and publish, then runs a SonarCloud scan. Runs are queued rather than cancelled.

The [Publish Hot Fix workflow](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/.github/workflows/publish-hotfix.yml) is manually dispatched. It builds the frontend, runs formatting, lint and tests, invokes the CDP hotfix build action, then runs a SonarCloud scan. Image publishing details are handled by those external CDP actions.

Both workflows use the Node.js version from `.nvmrc`.

Pull requests to `main` (opened, reopened, synchronized or ready for review) run security audit, frontend build, formatting, lint, tests and a Docker image build in the [pull request workflow](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/.github/workflows/check-pull-request.yml). It also runs a SonarCloud scan (skipped for Dependabot) and a dependency review that fails on moderate or higher severity issues.

## Dependency updates

[Dependabot](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/.github/dependabot.yml) checks direct npm dependencies and GitHub Actions weekly (10:30 Europe/London). Minor and patch updates are grouped, and Vitest packages form their own npm group. ESLint packages and major `stylelint` updates are ignored.

## Local Compose environment

Run the local services with:

```bash
docker compose up --build -d
```

The [Compose file](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/compose.yml) defines the frontend, Redis, MongoDB and Floci. The frontend uses Redis as a single instance without TLS. A backend service is present only as a commented example; the MongoDB and Floci initialization scripts contain examples rather than active database seed or cloud-resource setup.

## Documentation publishing

The documentation workflow in `.github/workflows/build-docs.yml` builds the MkDocs site in strict mode on pull requests and pushes to `main` that change `docs/**` or `mkdocs.yml`, and on manual dispatch. For non-pull-request events it deploys the built site to GitHub Pages.
