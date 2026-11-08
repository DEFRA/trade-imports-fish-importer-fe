import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const MAX_DOCKER_TAG_LENGTH = 128
const STABLE_RELEASE_TAG_PATTERN = /^v?[0-9]+\.[0-9]+\.[0-9]+$/

const branch = process.env.GITHUB_REF_NAME
const outputFile = process.env.GITHUB_OUTPUT

if (!branch || !outputFile) {
  throw new Error('GITHUB_REF_NAME and GITHUB_OUTPUT are required')
}

const isMainBranch = branch === 'main'
const prereleaseBranchPattern =
  /^(feature|bugfix|ci)\/(FISB-[0-9]+)-[a-z0-9]+(-[a-z0-9]+)*$/
const isValidPublishBranch =
  isMainBranch || prereleaseBranchPattern.test(branch)

if (!isValidPublishBranch) {
  throw new Error(
    'Invalid publish branch. Expected main or feature/FISB-<digits>-<description>, bugfix/FISB-<digits>-<description>, or ci/FISB-<digits>-<description>. A lowercase, hyphen-separated description is required (for example feature/FISB-1234-upload-documents).'
  )
}

const prerelease = !isMainBranch
let prereleaseSuffix = ''

if (prerelease) {
  const runId = process.env.GITHUB_RUN_ID
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT
  const positiveIntegerPattern = /^[1-9][0-9]*$/

  if (
    !runId ||
    !runAttempt ||
    !positiveIntegerPattern.test(runId) ||
    !positiveIntegerPattern.test(runAttempt)
  ) {
    throw new Error(
      'GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT must be positive integers for prerelease publishing'
    )
  }

  prereleaseSuffix = `${branch.toLowerCase().replace('/', '-')}-run-${runId}-attempt-${runAttempt}`
}

// Tags include a version and build number; 0.0.0 and 0 need the fewest characters.
const shortestPossibleImageTag = `0.0.0-${prereleaseSuffix}.0`

if (prerelease && shortestPossibleImageTag.length > MAX_DOCKER_TAG_LENGTH) {
  throw new Error(
    'Publish branch is too long: the prerelease suffix, including the run ID and attempt, must not exceed 120 characters. Docker image tags are limited to 128 characters including the version and build number; the actual version may require a shorter branch name.'
  )
}

const pushToDockerHub = !prerelease

if (prerelease) {
  const stableTagsAtHead = execFileSync('git', ['tag', '--points-at', 'HEAD'], {
    encoding: 'utf8'
  })
    .split('\n')
    .filter((tag) => STABLE_RELEASE_TAG_PATTERN.test(tag))

  if (stableTagsAtHead.length > 0) {
    throw new Error(
      `Cannot publish a prerelease from an already-released commit (${stableTagsAtHead.join(', ')}). Add a new commit after the stable release before publishing; CDP would otherwise reuse a stable ECR image tag.`
    )
  }

  // Match CDP's pinned tag action: reachable stable tags ordered by committer date.
  const latestStableTag = execFileSync(
    'git',
    ['tag', '--list', '--merged', 'HEAD', '--sort=-committerdate'],
    { encoding: 'utf8' }
  )
    .split('\n')
    .find((tag) => STABLE_RELEASE_TAG_PATTERN.test(tag))

  if (latestStableTag) {
    const history = execFileSync(
      'git',
      ['log', `${latestStableTag}..HEAD`, '--format=%B'],
      { encoding: 'utf8' }
    )
    const hasExplicitBump = ['#major', '#minor', '#patch'].some((token) =>
      history.includes(token)
    )

    if (history.includes('#none') && !hasExplicitBump) {
      throw new Error(
        `Cannot publish a prerelease: commit history since ${latestStableTag} contains #none without #major, #minor or #patch. CDP would reuse the stable ECR image tag. Add an intentional version-bump token or remove #none from the unreleased history before publishing.`
      )
    }
  }
}

appendFileSync(
  outputFile,
  `prerelease=${prerelease}\nprerelease-suffix=${prereleaseSuffix}\npush-dockerhub=${pushToDockerHub}\n`
)
