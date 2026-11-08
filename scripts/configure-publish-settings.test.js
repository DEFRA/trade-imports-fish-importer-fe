import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(
  new URL('./configure-publish-settings.js', import.meta.url)
)
const RUN_ID = '1658821493'
const RUN_ATTEMPT = '1'
const RUN_SUFFIX = `-run-${RUN_ID}-attempt-${RUN_ATTEMPT}`
let directory
let outputFile

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'configure-publish-settings-'))
  outputFile = join(directory, 'output')
  writeFileSync(outputFile, '')
  git('init', '--quiet')
  git('commit', '--allow-empty', '--quiet', '-m', 'Initial commit')
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

function git(...args) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Publishing test',
      '-c',
      'user.email=publishing-test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'tag.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args
    ],
    {
      cwd: directory,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1'
      },
      encoding: 'utf8'
    }
  )
}

function runScript(
  branch,
  output = outputFile,
  { runId = RUN_ID, runAttempt = RUN_ATTEMPT, cwd = directory } = {}
) {
  const env = { ...process.env }
  delete env.GITHUB_REF_NAME
  delete env.GITHUB_OUTPUT
  delete env.GITHUB_RUN_ID
  delete env.GITHUB_RUN_ATTEMPT
  if (branch !== undefined) {
    env.GITHUB_REF_NAME = branch
  }
  if (output !== undefined) {
    env.GITHUB_OUTPUT = output
  }
  if (runId) {
    env.GITHUB_RUN_ID = runId
  }
  if (runAttempt) {
    env.GITHUB_RUN_ATTEMPT = runAttempt
  }
  return spawnSync(process.execPath, [script], { env, cwd, encoding: 'utf8' })
}

test('preserves normal releases and Docker Hub publishing for main', () => {
  git('tag', '1.6.0')
  const result = runScript('main')

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(readFileSync(outputFile, 'utf8')).toBe(
    'prerelease=false\nprerelease-suffix=\npush-dockerhub=true\n'
  )
})

test.each([
  ['feature/FISB-1234-upload-documents', '1.6.0', false],
  ['feature/FISB-1234-upload-documents', 'v1.6.0', true],
  ['bugfix/FISB-1234-fix-upload', '1.6.0', true],
  ['bugfix/FISB-1234-fix-upload', 'v1.6.0', false],
  ['ci/FISB-1234-build-image', '1.6.0', false],
  ['ci/FISB-1234-build-image', 'v1.6.0', true]
])(
  'rejects released HEAD on %s with stable tag %s (annotated: %s)',
  (branch, tag, annotated) => {
    git('tag', ...(annotated ? ['-a', '-m', 'Stable release'] : []), tag)
    git('checkout', '--quiet', '-b', branch)

    const result = runScript(branch)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('already-released commit')
    expect(result.stderr).toContain(tag)
    expect(result.stderr).toContain('Add a new commit after the stable release')
    expect(readFileSync(outputFile, 'utf8')).toBe('')
  }
)

test('rejects a stable tag even when HEAD also has a prerelease tag', () => {
  git('tag', '1.6.0')
  git('tag', `1.7.0-feature-fisb-139-upload${RUN_SUFFIX}.0`)

  const result = runScript('feature/FISB-139-upload')

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('already-released commit (1.6.0)')
  expect(readFileSync(outputFile, 'utf8')).toBe('')
})

test.each([
  '1.7.0-feature-fisb-139-upload-run-123-attempt-1.0',
  'v1.7.0-beta.0',
  'deployment-marker'
])('allows HEAD carrying only a non-stable tag: %s', (tag) => {
  git('tag', tag)

  const result = runScript('feature/FISB-139-upload')

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(readFileSync(outputFile, 'utf8')).toBe(
    `prerelease=true\nprerelease-suffix=feature-fisb-139-upload${RUN_SUFFIX}\npush-dockerhub=false\n`
  )
})

test('allows a new commit after a stable release with detached HEAD', () => {
  git('tag', '-a', '-m', 'Stable release', '1.6.0')
  git('commit', '--allow-empty', '--quiet', '-m', 'Feature changes')
  git('checkout', '--quiet', '--detach')

  const result = runScript('feature/FISB-139-upload')

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(readFileSync(outputFile, 'utf8')).toBe(
    `prerelease=true\nprerelease-suffix=feature-fisb-139-upload${RUN_SUFFIX}\npush-dockerhub=false\n`
  )
})

test('fails without publishing outputs when Git cannot resolve HEAD', () => {
  git('init', '--quiet', 'empty-repository')

  const result = runScript('feature/FISB-139-upload', outputFile, {
    cwd: join(directory, 'empty-repository')
  })

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('git tag --points-at HEAD')
  expect(readFileSync(outputFile, 'utf8')).toBe('')
})

test.each([
  ['feature/FISB-139-upload', '1.6.0', false],
  ['bugfix/FISB-139-upload', 'v1.6.0', true],
  ['ci/FISB-139-build', '1.6.0', true]
])(
  'rejects #none history for %s after %s (annotated: %s)',
  (branch, tag, annotated) => {
    git('tag', ...(annotated ? ['-a', '-m', 'Stable release'] : []), tag)
    for (const message of [
      'First change',
      'Second change',
      'Third change',
      'Documentation update\n\n#none',
      'Fifth change'
    ]) {
      git('commit', '--allow-empty', '--quiet', '-m', message)
    }

    const result = runScript(branch)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      `commit history since ${tag} contains #none`
    )
    expect(result.stderr).toContain('CDP would reuse the stable ECR image tag')
    expect(readFileSync(outputFile, 'utf8')).toBe('')
  }
)

test('a prior prerelease tag does not reset the #none comparison history', () => {
  git('tag', '1.6.0')
  git('commit', '--allow-empty', '--quiet', '-m', 'First change')
  expect(runScript('feature/FISB-139-upload').status).toBe(0)
  git('tag', `1.7.0-feature-fisb-139-upload${RUN_SUFFIX}.0`)
  writeFileSync(outputFile, '')
  git('commit', '--allow-empty', '--quiet', '-m', 'Documentation update #none')
  git('tag', '1.7.0-feature-fisb-139-upload-run-123-attempt-1.0')
  git('commit', '--allow-empty', '--quiet', '-m', 'Further changes')

  const result = runScript('feature/FISB-139-upload', outputFile, {
    runId: '1658821500'
  })

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('commit history since 1.6.0 contains #none')
  expect(readFileSync(outputFile, 'utf8')).toBe('')
})

test.each(['#major', '#minor', '#patch'])(
  'allows %s to override #none anywhere in the compared history',
  (token) => {
    git('tag', '1.6.0')
    git('commit', '--allow-empty', '--quiet', '-m', `Explicit bump ${token}`)
    git(
      'commit',
      '--allow-empty',
      '--quiet',
      '-m',
      'Documentation update #none'
    )
    git('commit', '--allow-empty', '--quiet', '-m', 'Further changes')

    const result = runScript('feature/FISB-139-upload')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(readFileSync(outputFile, 'utf8')).toBe(
      `prerelease=true\nprerelease-suffix=feature-fisb-139-upload${RUN_SUFFIX}\npush-dockerhub=false\n`
    )
  }
)

test('uses the newest reachable stable commit rather than the highest version', () => {
  git('tag', '9.0.0')
  git('commit', '--allow-empty', '--quiet', '-m', 'Documentation update #none')
  vi.stubEnv('GIT_COMMITTER_DATE', '2030-01-01T00:00:00Z')
  git('commit', '--allow-empty', '--quiet', '-m', 'Later release')
  git('tag', '1.6.0')
  git('commit', '--allow-empty', '--quiet', '-m', 'Further changes')

  const result = runScript('feature/FISB-139-upload')

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(readFileSync(outputFile, 'utf8')).toBe(
    `prerelease=true\nprerelease-suffix=feature-fisb-139-upload${RUN_SUFFIX}\npush-dockerhub=false\n`
  )
})

test('a later explicit bump unblocks a previously rejected #none history', () => {
  git('tag', '1.6.0')
  git('commit', '--allow-empty', '--quiet', '-m', 'Documentation update #none')
  expect(runScript('feature/FISB-139-upload').status).toBe(1)
  expect(readFileSync(outputFile, 'utf8')).toBe('')
  git('commit', '--allow-empty', '--quiet', '-m', 'Release changes #patch')

  const result = runScript('feature/FISB-139-upload')

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(readFileSync(outputFile, 'utf8')).toBe(
    `prerelease=true\nprerelease-suffix=feature-fisb-139-upload${RUN_SUFFIX}\npush-dockerhub=false\n`
  )
})

test('ignores stable tags on unrelated branches', () => {
  git('tag', '1.6.0')
  const base = git('rev-parse', 'HEAD').trim()
  git('checkout', '--quiet', '-b', 'unrelated')
  git('commit', '--allow-empty', '--quiet', '-m', 'Unrelated release')
  git('tag', '9.0.0')
  git('checkout', '--quiet', '--detach', base)
  git('commit', '--allow-empty', '--quiet', '-m', 'Documentation update #none')

  const result = runScript('feature/FISB-139-upload')

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('commit history since 1.6.0 contains #none')
  expect(readFileSync(outputFile, 'utf8')).toBe('')
})

test.each(['Regular change', 'Documentation update none', 'Update #NONE'])(
  'allows history without the literal #none token: %s',
  (message) => {
    git('tag', '1.6.0')
    git('commit', '--allow-empty', '--quiet', '-m', message)

    const result = runScript('feature/FISB-139-upload')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  }
)

test('preserves main publishing when unreleased history contains #none', () => {
  git('tag', '1.6.0')
  git('commit', '--allow-empty', '--quiet', '-m', 'Documentation update #none')

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
    `prerelease=true\nprerelease-suffix=${suffix}${RUN_SUFFIX}\npush-dockerhub=false\n`
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
    expect(suffix).toBe(
      `${branch.toLowerCase().replace('/', '-')}${RUN_SUFFIX}`
    )
    expect(suffix).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    return suffix
  })

  expect(new Set(suffixes).size).toBe(branches.length)
})

test('preserves a 120-character suffix without truncation', () => {
  const branch = 'feature/FISB-139-'.padEnd(120 - RUN_SUFFIX.length, 'a')
  const result = runScript(branch)

  expect(result.status).toBe(0)
  expect(readFileSync(outputFile, 'utf8')).toBe(
    `prerelease=true\nprerelease-suffix=${branch.toLowerCase().replace('/', '-')}${RUN_SUFFIX}\npush-dockerhub=false\n`
  )
  const imageTag = `0.0.0-${branch.toLowerCase().replace('/', '-')}${RUN_SUFFIX}.0`
  expect(imageTag).toHaveLength(128)
})

test('rejects a suffix that cannot fit even the shortest Docker version tag', () => {
  const result = runScript(
    'feature/FISB-139-'.padEnd(121 - RUN_SUFFIX.length, 'a')
  )

  expect(result.status).toBe(1)
  expect(result.stderr).toContain(
    'prerelease suffix, including the run ID and attempt, must not exceed 120 characters'
  )
  expect(result.stderr).toContain(
    'actual version may require a shorter branch name'
  )
  expect(readFileSync(outputFile, 'utf8')).toBe('')
})

test('keeps publishes on the same branch distinct across runs and reruns', () => {
  const branch = 'feature/FISB-139-upload'
  const runs = [
    { runId: RUN_ID, runAttempt: '1' },
    { runId: RUN_ID, runAttempt: '2' },
    { runId: '1658821500', runAttempt: '1' }
  ]
  const suffixes = runs.map((run) => {
    writeFileSync(outputFile, '')
    const result = runScript(branch, outputFile, run)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const suffix = `${branch.toLowerCase().replace('/', '-')}-run-${run.runId}-attempt-${run.runAttempt}`
    expect(readFileSync(outputFile, 'utf8')).toBe(
      `prerelease=true\nprerelease-suffix=${suffix}\npush-dockerhub=false\n`
    )
    return suffix
  })

  expect(new Set(suffixes.map((suffix) => `1.6.0-${suffix}.0`)).size).toBe(3)
})

test.each(['runId', 'runAttempt'])(
  'rejects missing or malformed %s without writing publishing outputs',
  (field) => {
    for (const value of ['', '0', '-1', '1.5', 'abc', '01', '1\n', ' 1']) {
      const result = runScript('feature/FISB-139-upload', outputFile, {
        [field]: value
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        'GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT must be positive integers'
      )
      expect(readFileSync(outputFile, 'utf8')).toBe('')
    }
  }
)

test.each([
  { runId: '', runAttempt: '' },
  { runId: 'invalid', runAttempt: 'invalid' }
])('does not require run identifiers for main: %j', (run) => {
  const result = runScript('main', outputFile, run)

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(readFileSync(outputFile, 'utf8')).toBe(
    'prerelease=false\nprerelease-suffix=\npush-dockerhub=true\n'
  )
})

test('includes longer run IDs and attempts in the suffix length check', () => {
  const branch = 'feature/FISB-139-'.padEnd(120 - RUN_SUFFIX.length, 'a')
  const result = runScript(branch, outputFile, {
    runId: `${RUN_ID}0`,
    runAttempt: '10'
  })

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Publish branch is too long')
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
