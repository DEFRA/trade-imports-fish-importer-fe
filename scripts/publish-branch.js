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

appendFileSync(
  outputFile,
  `prerelease=${prerelease}\nprerelease-suffix=${prerelease ? match[2].toLowerCase() : ''}\npush-dockerhub=${!prerelease}\n`
)
