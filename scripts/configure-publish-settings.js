import { appendFileSync } from 'node:fs'

const MAX_DOCKER_TAG_LENGTH = 128

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
const prereleaseSuffix = prerelease
  ? branch.toLowerCase().replace('/', '-')
  : ''

// Tags include a version and build number; 0.0.0 and 0 need the fewest characters.
const shortestPossibleImageTag = `0.0.0-${prereleaseSuffix}.0`

if (prerelease && shortestPossibleImageTag.length > MAX_DOCKER_TAG_LENGTH) {
  throw new Error(
    'Publish branch is too long: the prerelease suffix must not exceed 120 characters. Docker image tags are limited to 128 characters including the version and build number; the actual version may require a shorter branch name.'
  )
}

const pushToDockerHub = !prerelease

appendFileSync(
  outputFile,
  `prerelease=${prerelease}\nprerelease-suffix=${prereleaseSuffix}\npush-dockerhub=${pushToDockerHub}\n`
)
