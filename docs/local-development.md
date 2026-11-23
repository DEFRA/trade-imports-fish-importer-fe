# Local development

The [package manifest](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/package.json) requires Node.js 24 or later. From the repository root, install dependencies and start the development server:

```bash
npm install
npm run dev
```

By default the service listens on port 3000. The development command runs Nodemon with `.env` loaded if present; [`nodemon.json`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/nodemon.json) sets `NODE_ENV=development`. Vite middleware serves client assets; see [Client assets](client-assets.md). See [Configuration](configuration.md) for overrides.

## Test user sign-in

Both `npm run dev` and `npm run dev:debug` explicitly set `ENVIRONMENT=local`
and `TEST_USER_SIGN_IN_ENABLED=true`; no `.env` file is needed to enable sign-in.
Opening the homepage or a protected direct link redirects to the GOV.UK radio
selection form. Choose a test user and click Continue:

| Test user                | Role             | Organisation                     |
| ------------------------ | ---------------- | -------------------------------- |
| North Quay Importer      | `importer`       | North Quay Seafood Ltd           |
| Westhaven Importer       | `importer`       | Westhaven Fish Imports Ltd       |
| Harbourgate Import Agent | `importer-agent` | Harbourgate Customs Services Ltd |

The descriptive IDs make test identities recognisable in saved data:

| User ID                         | Organisation ID                         |
| ------------------------------- | --------------------------------------- |
| `test-user-importer-north-quay` | `test-org-north-quay-seafood`           |
| `test-user-importer-westhaven`  | `test-org-westhaven-fish-imports`       |
| `test-user-agent-harbourgate`   | `test-org-harbourgate-customs-services` |

Each user belongs to a separate fictional organisation. All users and IDs are
synthetic. The catalogue covers the importer journey only: two importers and one
importer agent. Inspector/PHA/PHI users belong to the separate inspector journey
and are not included. Roles are mock identity data; they do not introduce
role-based access rules. The sign-in options show each user's role and organisation.
No user is preselected and an invalid selection returns an
accessible validation error without changing an existing session.

The server-only catalogue is
`src/server/common/helpers/test-users.json`. Edit test-user labels, roles and synthetic IDs there
and restart/redeploy; invalid records reject startup. Do not add real personal
information or secrets. Every user must have a role of `importer` or `importer-agent`.
Role and organisation assignments come only from this catalogue;
the former `TEST_ORGANISATION_ID` override is no longer read.
Sessions whose role or organisation assignment no longer matches the catalogue
are invalidated; users must sign in again.

To switch users, visit the unlinked `/dev/identity` page, check the selected
identity, role and organisation and use its CSRF-protected Sign out button, then select another user.
This page requires a session and exists only when test user sign-in is enabled
in `local`, `dev`, `test` or `ext-test`. There is no header sign-out control.

To run without the test identity provider, use
`TEST_USER_SIGN_IN_ENABLED=false npm run server:watch`. Application pages remain
protected and return HTTP 401 until another authentication provider is available.
This feature does not contact an identity provider or create backend notifications.

Other useful commands:

| Command                  | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `npm run dev:debug`      | Start Nodemon with the debugger paused on startup.                         |
| `npm run build:frontend` | Build Vite assets into `.public`.                                          |
| `npm start`              | Build frontend assets via `prestart`, then run with `NODE_ENV=production`. |
| `npm test`               | Run Vitest with coverage and `TZ=UTC`.                                     |
| `npm run lint`           | Run JavaScript and SCSS linters.                                           |
| `npm run format:check`   | Check formatting.                                                          |

Production defaults use a Redis cluster, TLS and secure session cookies. For local production-mode testing, configure a suitable Redis instance and cookie settings, or explicitly select memory for a single local process. Memory is not appropriate for a shared production deployment; see [Sessions and caching](sessions-and-caching.md). For container and release workflows, see [Deployment](deployment.md).

## Git hooks

The repository uses native Git hooks from `.githooks`. The `prepare` script in `package.json` runs `git config core.hooksPath .githooks` during `npm install`; outside a Git repository it exits without failing the install.

The `pre-commit` hook runs `scripts/update-docs.sh` and then `npm run git:pre-commit-hook` (security audit, format check, lint and tests). When non-documentation changes are staged, `update-docs.sh` requires the Copilot CLI (`copilot`) and one of `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` or `GITHUB_TOKEN`, and refuses to run while tracked files have unstaged changes.

## Documentation site

`mkdocs.yml` configures the MkDocs Material site and `docs/` supplies its pages. The documentation workflow in `.github/workflows/build-docs.yml` installs `mkdocs-material==9.8.1` and runs `mkdocs build --strict`; it builds on relevant pull requests and deploys for non-pull-request runs. See [Deployment](deployment.md).
