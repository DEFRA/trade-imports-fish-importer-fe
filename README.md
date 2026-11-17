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
  - [Temporary sign-in](#temporary-sign-in)
  - [Signed Commits](#signed-commits)
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

Before making your first commit, follow the [Signed Commits](#signed-commits) setup.

Install application dependencies:

```bash
npm install
```

### Temporary sign-in

Temporary sign-in is an authentication foundation for local development, not real
identity verification. It is independent of backend selection and does not create
notifications. The transport page and notification API integration are separate
work.

Run `npm run dev` or `npm run dev:debug`. Both commands explicitly set
`TEMPORARY_SIGN_IN_ENABLED=true`; no `.env` file is needed to enable it. A startup
warning explains that no identity provider is contacted. These script-set values
take precedence over `.env`. To run without temporary sign-in, use
`TEMPORARY_SIGN_IN_ENABLED=false npm run server:watch`.

Visit <http://localhost:3000/dev/identity>. You will be redirected to a clearly
labelled temporary sign-in page. Clicking **Continue as test user** submits a
CSRF-protected POST and returns to the identity page, showing:

| Field           | Default value |
| --------------- | ------------- |
| User ID         | `stub-user-1` |
| Name            | `Stub User`   |
| Organisation ID | `stub-org-1`  |
| Identity source | `temporary`   |

`TEST_ORGANISATION_ID` can override the non-secret organisation default, for
example in your optional local `.env`. Agreement on a backend-accepted ID is part
of the later notification integration. The default alone does not create an
organisation in the backend.

The identity page reads the authenticated session, not the current configuration,
and shows no tokens, cookies or session references. Its **Sign out** button also
uses a CSRF-protected POST. Signing in again renews the session and invalidates
the previous authenticated session. Separate browsers have separate sessions,
even though they use the same test identity.

Authentication uses `@hapi/cookie`. Its protected, HttpOnly, SameSite=Strict cookie
contains only a random session reference. Identity is held in the existing
memory/Redis cache under the `auth-sessions` segment. Yar remains unchanged for
general session state. Session and cookie lifetimes use the existing
`SESSION_CACHE_TTL` and `SESSION_COOKIE_TTL` settings (four hours by default).
Memory-backed sessions are lost when the frontend restarts. Session and
authorization headers are redacted from default logs, including locally.

**Shared deployments are intentionally not enabled yet.** Startup rejects
temporary sign-in when `NODE_ENV=production` or CDP has injected a
`SERVICE_VERSION`. Confirmation of the CDP deployment-environment identifier and
an explicit dev/test allowlist is deferred; do not change deployed runtime
settings to bypass this guard. Production runtime mode is not used to distinguish
deployed dev/test from live: all deployed enablement remains blocked for now.
With temporary sign-in disabled, its routes are absent and the authentication
strategy denies unauthenticated protected requests rather than bypassing login.

#### Using the authentication foundation

Home, guidance, health, cookie pages and assets remain public. Mark each route
that handles organisation-owned data as requiring the `session` strategy:

```js
server.route({
  method: 'GET',
  path: '/your-protected-page',
  options: { auth: 'session' },
  handler(request, h) {
    const { userId, organisationId, identitySource } = request.auth.credentials
    return h.view('your-template', { userId, organisationId, identitySource })
  }
})
```

Authenticated credentials also include `name` and an internal `sessionId`; do not
send the session reference to the browser or log it. Use the organisation from
credentials when constructing backend requests, never an organisation ID from a
form, URL or browser storage. The backend's authentication and authorisation
contract must still be agreed; an organisation ID by itself is not proof of
authority.

Unauthenticated protected GETs redirect to
`/auth/sign-in?returnTo=<encoded internal path>`. The return path is validated to
prevent external redirects. Unauthenticated protected POSTs receive 401 rather
than a redirect that would lose submitted data. GET sign-in displays a form only;
POST `/auth/sign-in` establishes the identity. POST `/auth/sign-out` invalidates
the cached identity and clears its cookie. Existing CSRF protection applies to
both POSTs.

The unlinked `/dev/identity` route is a temporary, non-cacheable verification page,
not part of the importer journey. It can be removed after verification without
removing sign-in or the automated authentication tests.

When implementing real DEFRA SSO, remove the hardcoded temporary-sign-in flag from
**both** development commands in the same change. Replace temporary identity
creation with verified SSO identity and organisation membership, preserve the
credentials contract, invalidate temporary sessions, and remove temporary routes,
fixtures and configuration. Verify the real local SSO round-trip; the startup
warning is deliberately present to prevent silently bypassing it.

### Signed Commits

Commits to this repository must be signed.

> 🔑 **We prefer signing commits with SSH keys.** This guide covers SSH only. GitHub also supports GPG; see
> [GPG alternative](#gpg-alternative) if you prefer to use it instead.

Steps 1 to 3 are required. Step 4 is optional.

#### 1. Prerequisites

- Git 2.34 or later is required for SSH signing. Check your version:

  ```bash
  git --version
  ```

- You already have an SSH key pair. Key creation is outside this guide;
  see [GitHub's SSH key generation documentation](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).
- Find the filename of your public key (it ends in `.pub`):

  ```bash
  ls ~/.ssh/*.pub
  ```

  The commands in this guide use `~/.ssh/id_ed25519.pub` as an example. **If your key has a different name** (for example
  `~/.ssh/github_signing.pub`), replace `id_ed25519` with your key's name in every command. Otherwise you will get a
  `No such file or directory` error.

- Use a Bash-compatible terminal, such as Terminal on macOS/Linux or Git Bash on Windows.

#### 2. Configure Git to sign with SSH

These settings apply globally to all your repositories. Repository-local settings can override them.

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```

- `gpg.format ssh` selects SSH instead of GPG for signing.
- `user.signingkey` points to your SSH public key. The matching private key must be available to your SSH agent;
  if needed, load it into your running agent with `ssh-add ~/.ssh/id_ed25519`.
- `commit.gpgsign true` signs new commits automatically. The setting keeps its name even when signing with SSH.

Optionally, sign tags automatically too:

```bash
git config --global tag.gpgsign true
```

Check the email Git will use from inside this repository:

```bash
git config --get user.email
```

It must match a verified email on your GitHub account under **Settings > Emails**; otherwise commits can show as **Unverified**.
If necessary, set it for this repository, replacing the example with your verified email:

```bash
git config user.email "your-verified-email@example.com"
```

#### 3. Add your SSH key to GitHub as a signing key

1. Display your public key and copy the entire output:

   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

2. Go to **GitHub > Settings > SSH and GPG keys > New SSH key**.
3. Give it a descriptive title, set **Key type** to **Signing Key**, paste the public key and select **Add SSH key**.
   Only ever share the `.pub` file; never paste your private key.

> ⚠️ **Important: authentication keys and signing keys are separate.**
>
> A key added as an **Authentication Key** (used for cloning, pushing and pulling) does **not** verify commits.
> If you use the same key for both, add it to GitHub twice: once with **Key type** set to **Authentication Key**
> and once with it set to **Signing Key**.

That's it: your commits will now be signed automatically.

#### Already working on a ticket branch?

Signing applies to new commits only; commits made before this setup stay unsigned. You don't need to switch branches.
To sign your latest commit as well, if it is your own and no one else is working from it, run:

```bash
git commit --amend --no-edit --only -S
```

This changes the commit ID. If you have already pushed that commit, coordinate with your team before updating the remote;
rewriting a shared branch can disrupt other people's work. For multiple earlier commits, agree with your team on how to
rewrite the branch history before proceeding.

#### 4. Optional: check your commits are signed

You don't need to do this. Use these checks if you want to confirm your setup or are troubleshooting.

**On GitHub:** push a commit, then open it on GitHub (in the branch's commit history or the pull request's **Commits**
tab) and confirm it shows **Verified**. Select the badge to see the signature details.

**Locally:** Git can't check SSH signatures on your machine until you set up an allowed signers file. Without it,
`git log --show-signature` reports a `gpg.ssh.allowedSignersFile` error. This only affects local checks; GitHub checks
signatures against the signing keys on your account. To set it up, run these once from inside this repository, so the
email matches your commits:

```bash
echo "$(git config --get user.email) $(cat ~/.ssh/id_ed25519.pub)" >> ~/.ssh/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
git log --show-signature -1
```

The last command should show `Good "git" signature for <your-email>` for a signed commit. See Git's
[`gpg.ssh.allowedSignersFile` documentation](https://git-scm.com/docs/git-config#Documentation/git-config.txt-gpgsshallowedSignersFile)
for the file format.

#### GPG alternative

GitHub also supports signing with GPG. If you prefer GPG, skip the SSH-specific parts of this guide: the SSH key and
Git 2.34 requirements in step 1, the SSH commands in steps 2 and 3, and the local check in step 4. Instead, follow
GitHub's guides to [tell Git about your GPG key](https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key#telling-git-about-your-gpg-key)
and [add it to your GitHub account](https://docs.github.com/en/authentication/managing-commit-signature-verification/adding-a-gpg-key-to-your-github-account).
The email check in step 2 still applies, and you can still check for **Verified** on GitHub. See
[About commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)
for how the options compare.

#### Troubleshooting

- **Commit shows Unverified:** check that the key is registered as a **Signing Key**, not just an **Authentication Key**,
  and that the commit email matches a verified email on your GitHub account. Inspect the commit's email with
  `git log -1 --format='%ae %ce'` (author and committer).
- **Commit fails with a signing or key error:** check that the `user.signingkey` path exists
  (`git config --get user.signingkey`) and that your key is loaded in the SSH agent (`ssh-add -l`; load it with
  `ssh-add ~/.ssh/id_ed25519`).
- **`gpg.ssh.allowedSignersFile` error:** this only affects local checks such as `git log --show-signature`, not GitHub.
  See [step 4](#4-optional-check-your-commits-are-signed).
- **Older Git version:** [upgrade Git](https://git-scm.com/downloads) to 2.34 or later.

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

The [Publish workflow](.github/workflows/publish.yml) automatically publishes stable releases on pushes to `main`,
including to public Docker Hub. Branch prereleases are published manually to ECR for deployment through the CDP Portal,
not to Docker Hub.

#### Publishing a prerelease

Use one of these branch formats:

- `feature/FISB-1234-upload-documents`
- `bugfix/FISB-1234-fix-upload`
- `ci/FISB-1234-build-image`
- `chore/FISB-1234-update-dependencies`

Ticket numbers can have any number of digits; descriptions must use lowercase letters and numbers separated by single hyphens.
Keep names short: Docker image tags have a 128-character limit, including version and run/attempt details.

In GitHub Actions, open **Publish**, select **Run workflow**, choose your branch and run it.
Branch pushes do not trigger the Publish workflow. After publishing succeeds, select the resulting version in the CDP Portal.

#### Understanding prerelease versions

For example:

```text
1.6.0-feature-fisb-1234-upload-documents-run-1658821493-attempt-1.0
```

CDP determines the base version (`1.6.0`). The suffix contains the full branch name, lowercased with `/` replaced by `-`,
so branches sharing a ticket remain distinguishable. `run` is the GitHub Actions run ID; each new workflow run gets a new ID.
`attempt` starts at `1` and increases on reruns of that same run.

Together, run and attempt prevent version reuse, including after rebases, when earlier tagged commits may no longer
be reachable. Each attempt has a unique suffix and starts a new prerelease sequence, so the final counter is always `.0`,
not an incrementing build number.

#### When publishing is blocked

These safeguards prevent CDP from reusing a stable ECR image tag:

- **Stable-tagged commit:** if the branch's latest commit carries a stable release tag (such as `1.6.0` or `v1.6.0`),
  add a new commit before publishing. Prerelease tags alone do not block publishing.
- **`#none` without an explicit bump:** commit messages, including bodies, since the latest reachable stable release
  must not contain `#none` unless that history also contains `#major`, `#minor` or `#patch`.
  Add an intentional bump token or remove `#none` from the unreleased history. Bump tokens also affect the eventual stable release.
  Earlier prerelease tags do not reset this check.

Unsupported branch names fail validation. These safeguards do not change publishing on `main`.

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
