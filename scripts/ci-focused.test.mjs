import { describe, expect, it } from 'vitest'
import { parseCLI } from 'vitest/node'
import { planChecks } from './ci-focused.mjs'

const plan = (files, options = {}) => planChecks(files, { exists: () => true, ...options })

describe('focused CI selection', () => {
  it.each([[], ['README.md'], ['docs/design.md', 'AGENTS.md', '.github/pull_request_template.md']].map((files) => [files]))('skips documentation or empty diffs: %j', (files) => {
    expect(plan(files).commands).toEqual([])
  })

  it('lints and typechecks a single engine change and runs its related tests', () => {
    expect(plan(['src/engine/altersvorsorgedepot.ts']).commands).toEqual([
      ['eslint', ['--max-warnings=0', '--', 'src/engine/altersvorsorgedepot.ts']],
      ['tsc', ['-b']],
      ['vitest', ['related', '--run', '--passWithNoTests', 'src/engine/altersvorsorgedepot.ts']],
    ])
  })

  it('runs changed tests directly, including when no source changed', () => {
    expect(plan(['src/engine/tax.test.ts']).commands).toContainEqual(['vitest', ['run', 'src/engine/tax.test.ts']])
  })

  it('passes filenames to the Vitest 4 parser instead of its ignored double-dash bucket', () => {
    const sources = plan(['src/engine/altersvorsorgedepot.ts']).commands.find(([command]) => command === 'vitest')
    expect(parseCLI(`vitest ${sources[1].join(' ')}`).options.related).toEqual(['src/engine/altersvorsorgedepot.ts'])
    const tests = plan(['src/engine/tax.test.ts']).commands.find(([command]) => command === 'vitest')
    expect(parseCLI(`vitest ${tests[1].join(' ')}`).filter).toEqual(['src/engine/tax.test.ts'])
  })

  it('keeps removed source paths for related tests but never lints deleted files', () => {
    const commands = plan(['src/engine/removed.ts'], { exists: () => false }).commands
    expect(commands.map(([command]) => command)).toEqual(['tsc', 'vitest'])
    expect(commands[1][1]).toContain('src/engine/removed.ts')
  })

  it.each(['package.json', 'package-lock.json', 'workers/simulate/package-lock.json', 'tsconfig.app.json',
    'workers/qa-submit/tsconfig.json', 'vite.config.ts', 'vitest.stryker.config.ts', 'workers/simulate/vitest.config.ts', 'eslint.config.js',
    'src/vitest.setup.ts', 'src/test/fixture.ts', 'src/rules/de2026.ts', 'src/domain/index.ts', '.github/workflows/pr-verify.yml'])('escalates high-risk input %s', (file) => {
    expect(plan([file])).toMatchObject({ mode: 'full', commands: [['npm', ['run', 'verify']]] })
    expect(plan([file]).reasons.join()).toContain(file)
  })

  it('escalates broad diffs, explicit full requests, and full-ci labels', () => {
    expect(plan(Array.from({ length: 41 }, (_, i) => `docs/${i}.md`)).mode).toBe('full')
    expect(plan(['README.md'], { labels: ['full-ci'] }).mode).toBe('full')
    expect(plan([], { full: true }).mode).toBe('full')
    expect(plan(['README.md'], { labels: ['other'] }).mode).toBe('focused')
  })

  it.each(['src/app/useRoute.ts', 'src/app/useRoute.test.ts', 'src/seo/publicRouteRegistry.ts', 'scripts/prerender.mjs'])('covers routes only for route inputs: %s', (file) => {
    expect(plan([file]).commands).toContainEqual(['npm', ['run', 'test:route-coverage']])
  })

  it.each(['public/robots.txt', 'src/seo/routes.ts', 'index.html', 'wrangler.jsonc', 'scripts/check-dist.mjs', 'scripts/generate-og-images.mjs'])('builds only for build inputs: %s', (file) => {
    expect(plan([file]).commands.slice(-2)).toEqual([['npm', ['run', 'build']], ['npm', ['run', 'check:dist']]])
  })

  it('selects only the changed worker or the simulate API consumer', () => {
    for (const file of ['workers/simulate/src/index.ts', 'src/api/simulate.ts']) {
      const commands = plan([file]).commands
      expect(commands).toContainEqual(['npm', ['--prefix', 'workers/simulate', 'run', 'typecheck']])
      expect(commands).toContainEqual(['npm', ['--prefix', 'workers/simulate', 'run', 'test']])
      expect(JSON.stringify(commands)).not.toContain('qa-submit')
    }
    const commands = plan(['workers/qa-submit/src/index.ts']).commands
    expect(commands).toContainEqual(['npm', ['--prefix', 'workers/qa-submit', 'run', 'test']])
    expect(commands.some(([command]) => command === 'vitest')).toBe(false)
  })
})
