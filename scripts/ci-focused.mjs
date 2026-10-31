import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const code = /\.(?:ts|tsx|js|mjs)$/
const test = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const docs = (file) => file.startsWith('docs/') || (!file.startsWith('src/') && file.endsWith('.md'))
const highRisk = /^(?:package(?:-lock)?\.json$|workers\/[^/]+\/package[^/]*\.json$|(?:.*\/)?tsconfig[^/]*\.json$|vite\.config\.ts$|(?:.*\/)?vitest[^/]*\.config\.ts$|eslint\.config\.js$|src\/vitest\.setup\.ts$|src\/(?:test|rules|domain)\/|\.github\/workflows\/)/
const buildInput = /^(?:scripts\/(?:prerender|check-dist|generate-og-images)\.mjs$|src\/seo\/|public\/|vite\.config\.ts$|wrangler\.jsonc$|index\.html$)/
const routeInput = /^(?:src\/app\/useRoute|src\/seo\/|scripts\/prerender\.mjs$)/

export function planChecks(files, { full = false, labels = [], exists = existsSync } = {}) {
  const reasons = []
  if (full) reasons.push('explicit full suite request')
  if (labels.includes('full-ci')) reasons.push('full-ci label (explain the manual choice in the PR body)')
  if (files.length > 40) reasons.push(`broad diff: ${files.length} files (>40)`)
  const risky = files.filter((file) => highRisk.test(file))
  if (risky.length) reasons.push(`high-risk inputs: ${risky.join(', ')}`)
  if (reasons.length) return { mode: 'full', reasons, commands: [['npm', ['run', 'verify']]] }
  if (files.every(docs)) return { mode: 'focused', reasons: ['documentation-only or empty diff; nothing to run'], commands: [] }

  const commands = []
  const changedCode = files.filter((file) => code.test(file) && exists(file))
  if (changedCode.length) commands.push(['eslint', ['--max-warnings=0', '--', ...changedCode]])
  commands.push(['tsc', ['-b']])
  // Keep deleted paths as related inputs: surviving importers must still be checked.
  const sources = files.filter((file) => !file.startsWith('workers/') && (/\.(?:ts|tsx|js|mjs|mdx)$/.test(file) || (file.startsWith('src/') && file.endsWith('.json'))) && !test.test(file))
  // Snapshot changes (including removals) must run their surviving owning test.
  const tests = [...new Set(files
    .map((file) => file.startsWith('src/') ? file.replace(/\/__snapshots__\/([^/]+)\.snap$/, '/$1') : file)
    .filter((file) => !file.startsWith('workers/') && test.test(file) && exists(file)))]
  if (sources.length) commands.push(['vitest', ['related', '--run', '--passWithNoTests', ...sources]])
  // `related` is not guaranteed to include the changed test itself.
  if (tests.length) commands.push(['vitest', ['run', ...tests]])
  if (files.some((file) => routeInput.test(file))) commands.push(['npm', ['run', 'test:route-coverage']])
  const workers = new Set(files.flatMap((file) => file.match(/^workers\/([^/]+)\//)?.[1] ?? []))
  if (files.some((file) => file.startsWith('src/api/'))) workers.add('simulate')
  for (const worker of [...workers].sort()) {
    if (!exists(`workers/${worker}/package.json`)) continue
    commands.push(['npm', ['--prefix', `workers/${worker}`, 'run', 'typecheck']])
    commands.push(['npm', ['--prefix', `workers/${worker}`, 'run', 'test']])
  }
  if (files.some((file) => buildInput.test(file))) {
    commands.push(['npm', ['run', 'build']], ['npm', ['run', 'check:dist']])
  }
  return { mode: 'focused', reasons: ['checks selected from changed files'], commands }
}

function spawn(command, args, options) {
  // Invoke npm's JS entrypoint on Windows, keeping filenames out of cmd.exe.
  if (process.platform === 'win32' && command === 'npm') {
    const cli = process.env.npm_execpath || resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
    return spawnSync(process.execPath, [cli, ...args], options)
  }
  return spawnSync(command, args, options)
}

function run(command, args, capture = false) {
  const result = spawn(command, args, { stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}: ${result.stderr ?? ''}`)
  return result.stdout
}

function main() {
  const args = process.argv.slice(2)
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
  const base = option('--base', 'origin/main')
  const head = option('--head', 'HEAD')
  const files = run('git', ['diff', '--name-only', '-z', `${base}...${head}`], true).split('\0').filter(Boolean)
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {}
  const labels = event.pull_request?.labels?.map((label) => label.name) ?? []
  const plan = planChecks(files, { full: args.includes('--full'), labels })
  const summary = [`### CI: ${plan.mode}`, `Base: ${base}; head: ${head}; changed files: ${files.length}`, ...plan.reasons.map((reason) => `- ${reason}`), ...plan.commands.map(([command, params]) => `- ${command} ${params.join(' ')}`), ''].join('\n')
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `suite=${plan.mode}\n`)
  if (args.includes('--plan')) return
  if (plan.mode === 'full' && process.env.CI) {
    // Informational full audit belongs only to full runs. Production audit is a workflow gate.
    const audit = spawn('npm', ['audit'], { encoding: 'utf8' })
    if (audit.error) console.warn(audit.error.message)
    const report = `### Full npm audit (informational)\n\n\`\`\`text\n${audit.stdout ?? ''}${audit.stderr ?? ''}\n\`\`\`\n`
    console.log(report)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)
  }
  const bins = { eslint: 'eslint/bin/eslint.js', tsc: 'typescript/bin/tsc', vitest: 'vitest/vitest.mjs' }
  for (const [command, params] of plan.commands) {
    console.log(`> ${command} ${params.join(' ')}`)
    if (bins[command]) run(process.execPath, [resolve('node_modules', bins[command]), ...params])
    else run(command, params)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
