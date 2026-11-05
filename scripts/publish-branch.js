import { appendFileSync } from 'node:fs'

const branch = process.env.GITHUB_REF_NAME
const outputFile = process.env.GITHUB_OUTPUT

if (!branch || !outputFile) {
  throw new Error('GITHUB_REF_NAME and GITHUB_OUTPUT are required')
}

const match =
  /^(feature|bugfix|ci)\/(FISB-[0-9]+)(-[a-z0-9]+(-[a-z0-9]+)*)?$/.exec(branch)

if (branch !== 'main' && !match) {
  throw new Error(
    'Invalid publish branch. Expected main or feature/FISB-<digits>, bugfix/FISB-<digits>, or ci/FISB-<digits>, optionally followed by a lowercase, hyphen-separated description (for example feature/FISB-1234-upload-documents).'
  )
}

const prerelease = branch !== 'main'
const prereleaseSuffix = prerelease
  ? branch.toLowerCase().replace('/', '-')
  : ''

// Even the shortest version needs eight characters beyond the suffix.
if (prerelease && `0.0.0-${prereleaseSuffix}.0`.length > 128) {
  throw new Error(
    'Publish branch is too long: the prerelease suffix must not exceed 120 characters. Docker image tags are limited to 128 characters including the version and build number; the actual version may require a shorter branch name.'
  )
}

appendFileSync(
  outputFile,
  `prerelease=${prerelease}\nprerelease-suffix=${prereleaseSuffix}\npush-dockerhub=${!prerelease}\n`
)
