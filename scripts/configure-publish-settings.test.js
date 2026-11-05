import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(
  new URL('./configure-publish-settings.js', import.meta.url)
)
let directory
let outputFile

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'configure-publish-settings-'))
  outputFile = join(directory, 'output')
  writeFileSync(outputFile, '')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

function runScript(branch, output = outputFile) {
  const env = { ...process.env }
  delete env.GITHUB_REF_NAME
  delete env.GITHUB_OUTPUT
  if (branch !== undefined) {
    env.GITHUB_REF_NAME = branch
  }
  if (output !== undefined) {
    env.GITHUB_OUTPUT = output
  }
  return spawnSync(process.execPath, [script], { env, encoding: 'utf8' })
}

test('preserves normal releases and Docker Hub publishing for main', () => {
  const result = runScript('main')

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(readFileSync(outputFile, 'utf8')).toBe(
    'prerelease=false\nprerelease-suffix=\npush-dockerhub=true\n'
  )
})

test.each([
  ['feature/FISB-1234-upload-documents', 'feature-fisb-1234-upload-documents'],
  ['bugfix/FISB-1234-fix-upload', 'bugfix-fisb-1234-fix-upload'],
  ['ci/FISB-1234-build-image', 'ci-fisb-1234-build-image'],
  ['feature/FISB-1-a', 'feature-fisb-1-a'],
  ['feature/FISB-1234-123', 'feature-fisb-1234-123'],
  ['bugfix/FISB-1234567-fix-2-errors', 'bugfix-fisb-1234567-fix-2-errors']
])('uses an ECR-only full-branch prerelease for %s', (branch, suffix) => {
  const result = runScript(branch)

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(readFileSync(outputFile, 'utf8')).toBe(
    `prerelease=true\nprerelease-suffix=${suffix}\npush-dockerhub=false\n`
  )
})

test('keeps suffixes distinct for branches sharing the same Jira ticket', () => {
  const branches = [
    'feature/FISB-139-upload',
    'bugfix/FISB-139-upload',
    'ci/FISB-139-upload',
    'feature/FISB-139-download'
  ]
  const suffixes = branches.map((branch) => {
    writeFileSync(outputFile, '')
    expect(runScript(branch).status).toBe(0)
    const suffix = readFileSync(outputFile, 'utf8')
      .split('\n')
      .find((line) => line.startsWith('prerelease-suffix='))
      .slice('prerelease-suffix='.length)
    expect(suffix).toBe(branch.toLowerCase().replace('/', '-'))
    expect(suffix).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    return suffix
  })

  expect(new Set(suffixes).size).toBe(branches.length)
})

test('preserves a 120-character suffix without truncation', () => {
  const branch = 'feature/FISB-139-'.padEnd(120, 'a')
  const result = runScript(branch)

  expect(result.status).toBe(0)
  expect(readFileSync(outputFile, 'utf8')).toBe(
    `prerelease=true\nprerelease-suffix=${branch.toLowerCase().replace('/', '-')}\npush-dockerhub=false\n`
  )
})

test('rejects a suffix that cannot fit even the shortest Docker version tag', () => {
  const result = runScript('feature/FISB-139-'.padEnd(121, 'a'))

  expect(result.status).toBe(1)
  expect(result.stderr).toContain(
    'prerelease suffix must not exceed 120 characters'
  )
  expect(result.stderr).toContain(
    'actual version may require a shorter branch name'
  )
  expect(readFileSync(outputFile, 'utf8')).toBe('')
})

test.each([
  'develop',
  'feature/FISB-1234',
  'bugfix/FISB-1234',
  'ci/FISB-1234',
  'hotfix/FISB-1234-fix-upload',
  'Feature/FISB-1234',
  'feature/fisb-1234',
  'feature/OTHER-1234',
  'feature/FISB-',
  'feature/FISB-abc',
  'feature/FISB-1234abc',
  'feature/FISB-1234-',
  'feature/FISB-1234-Upload',
  'feature/FISB-1234-upload_documents',
  'feature/FISB-1234-upload--documents',
  'feature/FISB-1234/upload-documents',
  'feature/nested/FISB-1234',
  'feature/FISB-1234-$(echo-injected)'
])('rejects %s without writing publishing outputs', (branch) => {
  const result = runScript(branch)

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Invalid publish branch')
  for (const prefix of ['feature', 'bugfix', 'ci']) {
    expect(result.stderr).toContain(`${prefix}/FISB-<digits>-<description>`)
  }
  expect(result.stderr).toContain('description is required')
  expect(readFileSync(outputFile, 'utf8')).toBe('')
})

test('fails explicitly when the branch environment variable is missing', () => {
  const result = runScript(undefined)

  expect(result.status).toBe(1)
  expect(result.stderr).toContain(
    'GITHUB_REF_NAME and GITHUB_OUTPUT are required'
  )
  expect(readFileSync(outputFile, 'utf8')).toBe('')
})

test('fails explicitly when the output environment variable is missing', () => {
  const result = runScript('main', '')

  expect(result.status).toBe(1)
  expect(result.stderr).toContain(
    'GITHUB_REF_NAME and GITHUB_OUTPUT are required'
  )
  expect(readFileSync(outputFile, 'utf8')).toBe('')
})

test('fails explicitly when the output file cannot be written', () => {
  const result = runScript('main', join(directory, 'missing', 'output'))

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('ENOENT')
  expect(readFileSync(outputFile, 'utf8')).toBe('')
})
