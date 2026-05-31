/**
 * Copy inventory — "where is this text?" for the public-copy catalog.
 *
 * Run:
 *   npm run copy:inventory                  # full table
 *   npm run copy:inventory -- rente         # rows whose key/de/en/surface match
 *   npm run copy:inventory -- --surface=landing
 *   npm run copy:inventory -- --risk=legal
 *   npm run copy:inventory -- --high-risk    # legal / disclaimer / export only
 *   npm run copy:inventory -- --json        # machine-readable
 *
 * Works without starting the app (reads the catalog JSON via vite-node). Exits
 * nonzero only on hard failures (structural errors); warnings are allowed.
 *
 * All logic lives in `src/content/copy/inventory.ts` (typed + unit-tested);
 * this script is just the shell. It imports that module directly rather than
 * the `copy` singleton so a broken catalog is *reported*, not thrown on.
 */
import {
  buildInventoryReport,
  formatInventoryTable,
} from '../src/content/copy/inventory'

const argv = process.argv.slice(2)

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    [
      'Usage: npm run copy:inventory -- [search] [--surface=<id>] [--risk=<tier>] [--json]',
      '',
      '  search           case-insensitive substring across key / de / en / surface',
      '  --surface=<id>   restrict to one surface (e.g. landing)',
      '  --risk=<tier>    restrict to one risk tier (normal|brand|legal|disclaimer|export)',
      '  --high-risk      restrict to legal / disclaimer / export entries',
      '  --json           machine-readable output',
    ].join('\n'),
  )
  process.exit(0)
}

const json = argv.includes('--json')
const highRisk = argv.includes('--high-risk')
let surface: string | undefined
let risk: string | undefined
let search: string | undefined

for (const arg of argv) {
  if (arg === '--json' || arg === '--high-risk') continue
  if (arg.startsWith('--surface=')) surface = arg.slice('--surface='.length)
  else if (arg.startsWith('--risk=')) risk = arg.slice('--risk='.length)
  else if (!arg.startsWith('-')) search = arg
}

const report = buildInventoryReport(undefined, {
  search,
  surface,
  highRisk,
  // The filter type wants a CopyRisk; an unknown value simply matches nothing.
  risk: risk as never,
})

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(formatInventoryTable(report))
}

// Hard failures (structural errors) → nonzero. Warnings never block.
if (report.summary.errors > 0) {
  console.error(`\n✗ ${report.summary.errors} structural error(s) — catalog is broken.`)
  process.exitCode = 1
}
