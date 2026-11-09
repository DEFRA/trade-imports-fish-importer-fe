import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const MAX_DOCKER_TAG_LENGTH = 128
const STABLE_RELEASE_TAG_PATTERN = /^v?\d+\.\d+\.\d+$/
const PRERELEASE_BRANCH_PATTERN =
  /^(feature|bugfix|ci)\/(FISB-\d+)-[a-z0-9]+(-[a-z0-9]+)*$/
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/

const branch = process.env.GITHUB_REF_NAME
const outputFile = process.env.GITHUB_OUTPUT

validateRequiredEnvironment(branch, outputFile)
validatePublishBranch(branch)

const prerelease = isPrereleaseBranch(branch)
const prereleaseSuffix = prerelease
  ? preparePrereleaseSuffix(
      branch,
      process.env.GITHUB_RUN_ID,
      process.env.GITHUB_RUN_ATTEMPT
    )
  : ''

if (prerelease) {
  validatePrereleaseHistory()
}

appendFileSync(
  outputFile,
  serializePublishingSettings(prerelease, prereleaseSuffix)
)

function validateRequiredEnvironment(branch, outputFile) {
  if (!branch || !outputFile) {
    throw new Error('GITHUB_REF_NAME and GITHUB_OUTPUT are required')
  }
}

function validatePublishBranch(branch) {
  if (isPrereleaseBranch(branch) && !PRERELEASE_BRANCH_PATTERN.test(branch)) {
    throw new Error(
      'Invalid publish branch. Expected main or feature/FISB-<digits>-<description>, bugfix/FISB-<digits>-<description>, or ci/FISB-<digits>-<description>. A lowercase, hyphen-separated description is required (for example feature/FISB-1234-upload-documents).'
    )
  }
}

function isPrereleaseBranch(branch) {
  return branch !== 'main'
}

function preparePrereleaseSuffix(branch, runId, runAttempt) {
  validatePrereleaseRunIdentifiers(runId, runAttempt)
  const suffix = buildPrereleaseSuffix(branch, runId, runAttempt)
  validateDockerTagLength(suffix)
  return suffix
}

function validatePrereleaseRunIdentifiers(runId, runAttempt) {
  if (
    !runId ||
    !runAttempt ||
    !POSITIVE_INTEGER_PATTERN.test(runId) ||
    !POSITIVE_INTEGER_PATTERN.test(runAttempt)
  ) {
    throw new Error(
      'GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT must be positive integers for prerelease publishing'
    )
  }
}

function buildPrereleaseSuffix(branch, runId, runAttempt) {
  return `${branch.toLowerCase().replace('/', '-')}-run-${runId}-attempt-${runAttempt}`
}

function validateDockerTagLength(prereleaseSuffix) {
  // Tags include a version and build number; 0.0.0 and 0 need the fewest characters.
  const shortestPossibleImageTag = `0.0.0-${prereleaseSuffix}.0`

  if (shortestPossibleImageTag.length > MAX_DOCKER_TAG_LENGTH) {
    throw new Error(
      'Publish branch is too long: the prerelease suffix, including the run ID and attempt, must not exceed 120 characters. Docker image tags are limited to 128 characters including the version and build number; the actual version may require a shorter branch name.'
    )
  }
}

function validatePrereleaseHistory() {
  validateUnreleasedHead(readStableTagsAtHead())

  const latestStableTag = findLatestReachableStableTag()
  if (!latestStableTag) {
    return
  }

  validateVersionBumpHistory(readHistorySince(latestStableTag), latestStableTag)
}

function validateUnreleasedHead(stableTagsAtHead) {
  if (stableTagsAtHead.length > 0) {
    throw new Error(
      `Cannot publish a prerelease from an already-released commit (${stableTagsAtHead.join(', ')}). Add a new commit after the stable release before publishing; CDP would otherwise reuse a stable ECR image tag.`
    )
  }
}

function readStableTagsAtHead() {
  return readGitTags(['tag', '--points-at', 'HEAD']).filter((tag) =>
    STABLE_RELEASE_TAG_PATTERN.test(tag)
  )
}

function findLatestReachableStableTag() {
  // Match CDP's pinned tag action: reachable stable tags ordered by committer date.
  return readGitTags([
    'tag',
    '--list',
    '--merged',
    'HEAD',
    '--sort=-committerdate'
  ]).find((tag) => STABLE_RELEASE_TAG_PATTERN.test(tag))
}

function readGitTags(args) {
  return execFileSync('/usr/bin/git', args, { encoding: 'utf8' }).split('\n')
}

function readHistorySince(stableTag) {
  return execFileSync(
    '/usr/bin/git',
    ['log', `${stableTag}..HEAD`, '--format=%B'],
    {
      encoding: 'utf8'
    }
  )
}

function validateVersionBumpHistory(history, latestStableTag) {
  const hasExplicitBump = ['#major', '#minor', '#patch'].some((token) =>
    history.includes(token)
  )

  if (history.includes('#none') && !hasExplicitBump) {
    throw new Error(
      `Cannot publish a prerelease: commit history since ${latestStableTag} contains #none without #major, #minor or #patch. CDP would reuse the stable ECR image tag. Add an intentional version-bump token or remove #none from the unreleased history before publishing.`
    )
  }
}

function serializePublishingSettings(prerelease, prereleaseSuffix) {
  return `prerelease=${prerelease}\nprerelease-suffix=${prereleaseSuffix}\npush-dockerhub=${!prerelease}\n`
}
