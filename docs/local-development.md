# Local development

The [package manifest](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/package.json) requires Node.js 24 or later. From the repository root, install dependencies and start the development server:

```bash
npm install
npm run dev
```

By default the service listens on port 3000. The development command runs Nodemon with `.env` loaded if present; [`nodemon.json`](https://github.com/DEFRA/trade-imports-fish-importer-fe/blob/main/nodemon.json) sets `NODE_ENV=development`. Vite middleware serves client assets; see [Client assets](client-assets.md). See [Configuration](configuration.md) for overrides.

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

## Documentation site

`mkdocs.yml` configures the MkDocs Material site and `docs/` supplies its pages. The documentation workflow in `.github/workflows/build-docs.yml` installs `mkdocs-material==9.8.1` and runs `mkdocs build --strict`; it builds on relevant pull requests and deploys for non-pull-request runs. See [Deployment](deployment.md).
