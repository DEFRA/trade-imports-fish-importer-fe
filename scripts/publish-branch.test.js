import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./publish-branch.js', import.meta.url))
let directory
let outputFile

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'publish-branch-'))
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
  ['feature/FISB-1234', 'fisb-1234'],
  ['feature/FISB-1234-upload-documents', 'fisb-1234'],
  ['bugfix/FISB-1234', 'fisb-1234'],
  ['bugfix/FISB-1234-fix-upload', 'fisb-1234'],
  ['ci/FISB-1234', 'fisb-1234'],
  ['ci/FISB-1234-build-image', 'fisb-1234'],
  ['feature/FISB-1', 'fisb-1'],
  ['bugfix/FISB-1234567-fix-2-errors', 'fisb-1234567']
])('uses an ECR-only Jira prerelease for %s', (branch, suffix) => {
  const result = runScript(branch)

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(readFileSync(outputFile, 'utf8')).toBe(
    `prerelease=true\nprerelease-suffix=${suffix}\npush-dockerhub=false\n`
  )
})

test.each([
  'develop',
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
    expect(result.stderr).toContain(`${prefix}/FISB-<digits>`)
  }
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
