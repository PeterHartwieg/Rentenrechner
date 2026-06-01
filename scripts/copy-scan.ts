/**
 * Copy-coverage scanner — "what text is NOT in the catalog yet?".
 *
 * Run:
 *   npm run copy:scan                         # full report, busiest files first
 *   npm run copy:scan -- --surface=vergleich  # one surface only
 *   npm run copy:scan -- src/features/kapital  # path-prefix filter
 *   npm run copy:scan -- --json                # machine-readable
 *
 * Walks src/*.ts(x), parses each file, and reports hardcoded German string
 * literals / JSX text that are not yet a catalog `de` value — migration
 * candidates for `entries/<surface>.copy.json`. Detection is a heuristic biased
 * toward recall (see `src/content/copy/scan.ts`); the report is advisory and
 * always exits 0 (un-migrated copy is expected progress, not a failure).
 *
 * All logic lives in `src/content/copy/scan.ts` (typed + unit-tested); this
 * script is just the fs walk + arg parsing + printing. It is the only consumer
 * of `scan.ts` besides its test, keeping the `typescript` parser dependency out
 * of the app's barrel and bundle.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadRawCopyEntries } from '../src/content/copy/sources'
import {
  buildScanReport,
  filterReport,
  formatScanReport,
  type ScanInputFile,
} from '../src/content/copy/scan'

const ROOT = 'src'

/** Directories / files never worth scanning for un-migrated UI copy. */
function isExcluded(relPath: string): boolean {
  const path = relPath.replace(/\\/g, '/')
  return (
    path.startsWith('src/content/copy/') || // the catalog system itself (and this scanner's wordlist)
    path.startsWith('src/test/') || // shared test fixtures / oracle goldens, not UI copy
    path.includes('/__snapshots__/') ||
    path === 'src/vitest.setup.ts' ||
    /\.test\.tsx?$/.test(path) ||
    /\.d\.ts$/.test(path)
  )
}

function collectFiles(dir: string, acc: ScanInputFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = full.replace(/\\/g, '/')
    if (entry.isDirectory()) {
      if (!isExcluded(`${rel}/`)) collectFiles(full, acc)
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    if (isExcluded(rel)) continue
    acc.push({ file: rel, text: readFileSync(full, 'utf8') })
  }
}

const argv = process.argv.slice(2)

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    [
      'Usage: npm run copy:scan -- [path-prefix] [--surface=<id>] [--json]',
      '',
      '  path-prefix      only files whose path starts with this (e.g. src/features/kapital)',
      '  --surface=<id>   only candidates on this surface (e.g. vergleich)',
      '  --json           machine-readable output',
      '',
      'Finds hardcoded German copy not yet in the catalog. Heuristic, advisory,',
      'always exits 0. Migrate a surface into entries/<surface>.copy.json, then',
      're-run to watch the count drop.',
    ].join('\n'),
  )
  process.exit(0)
}

const json = argv.includes('--json')
let surface: string | undefined
let pathPrefix: string | undefined
for (const arg of argv) {
  if (arg === '--json') continue
  if (arg.startsWith('--surface=')) surface = arg.slice('--surface='.length)
  else if (!arg.startsWith('-')) pathPrefix = arg
}

const files: ScanInputFile[] = []
collectFiles(ROOT, files)

const knownDe = new Set(
  loadRawCopyEntries()
    .map((entry) => (typeof entry.de === 'string' ? entry.de.trim() : ''))
    .filter((value) => value.length > 0),
)

const full = buildScanReport(files, { isTracked: (text) => knownDe.has(text) })
const report = surface || pathPrefix ? filterReport(full, { surface, pathPrefix }) : full

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(formatScanReport(report))
}
