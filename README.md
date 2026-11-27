# trade-imports-fish-importer-fe

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-imports-fish-importer-fe&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-imports-fish-importer-fe)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-imports-fish-importer-fe&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-imports-fish-importer-fe)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-imports-fish-importer-fe&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-imports-fish-importer-fe)

Core delivery platform Node.js Frontend Template.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Notification journey](#notification-journey)
- [Server-side Caching](#server-side-caching)
- [Redis](#redis)
- [Local Development](#local-development)
  - [Setup](#setup)
  - [Test user sign-in](#test-user-sign-in)
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

## Notification journey

The [guidance page](src/server/routes/notification/guidance/index.njk)
**Start now** action submits a CSRF-protected POST to `/notification/guidance`,
which creates a session draft and redirects to `/notification/transport-details`.
Visiting transport details without an active draft redirects to guidance. Saving
a selected transport mode persists the draft through the notification API before
redirecting to `/notification/consignment-details`.
The consignment form collects a port of entry and an expected arrival date and
time. Its Back link returns to transport details with the saved transport mode
selected; the transport page's Back link returns to guidance. Port options are
temporary seeded data in [ports.json](src/server/routes/notification/consignment-details/ports.json),
not a live port directory.

Validation runs on the frontend server using the
[GOV.UK date-input guidance](https://design-system.service.gov.uk/components/date-input/),
including real dates, four-digit years and numeric, full or abbreviated English
months. Hours are 0-23 and minutes are 0-59; both accept one or two digits.
Expected arrival is interpreted in UK local time (`Europe/London`) and must be
at least 2 elapsed hours and no more than 1 calendar year after the server time
captured at submission. Both limits are inclusive; validation retains submission
seconds and milliseconds when checking these bounds.

Entered consignment values are redisplayed on validation errors. A successful
consignment POST saves arrival details onto the existing draft notification
through the notification API using PATCH, then redirects with 303 to
`/notification/next-step`, an unregistered URL that returns the normal 404 page.
It does not create a new draft notification. Revisiting consignment details
pre-fills the saved port of entry and expected arrival date and time.
Additional details, country of export and CHED fields are not implemented.

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

### Test user sign-in

DEFRA SSO is not implemented yet. Test user sign-in lets developers and testers
use predefined identities without contacting an identity provider.

- **Local development:** `npm run dev` and `npm run dev:debug` enable it for
  convenience by setting `ENVIRONMENT=local` and `TEST_USER_SIGN_IN_ENABLED=true`.
  No `.env` setup is required.
- **Deployed dev/test:** Disabled by default. To enable it, set
  `TEST_USER_SIGN_IN_ENABLED=true` in the service's environment-specific
  [dev](https://github.com/DEFRA/cdp-app-config/blob/main/services/trade-imports-fish-importer-fe/dev/trade-imports-fish-importer-fe.env)
  or [test](https://github.com/DEFRA/cdp-app-config/blob/main/services/trade-imports-fish-importer-fe/test/trade-imports-fish-importer-fe.env)
  configuration and redeploy. Do not add it to shared defaults or production.

Test user sign-in is only allowed when `ENVIRONMENT` is `local`, `dev` or `test`.
Enabling it in any other environment, including production, prevents startup.

When enabled, opening a protected page (such as <http://localhost:3000/>) without
a valid session redirects to the test user sign-in page. Choose a user and click
**Continue** to return to the requested page.

Users, roles and organisations are defined in the server-only
[test user catalogue](src/server/common/helpers/test-users.json). Edit this file
and restart/redeploy the frontend to change them. It contains two importers
(`importer`) and one importer agent (`importer-agent`), with fictional organisations.
Inspector/PHA/PHI users belong to the separate inspector journey and are not included.
Roles are mock identity data, not role-based access rules. Use synthetic data only.

Visit `/dev/identity` to check the signed-in user, role and organisation, or **Sign out**
to switch users.

When test user sign-in is disabled, its pages are unavailable and protected
application pages return HTTP 401 until another authentication provider is implemented.

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
