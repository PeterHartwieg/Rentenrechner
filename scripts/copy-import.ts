/**
 * Copy bulk-import — stage every un-migrated hardcoded German string as a
 * catalog entry so the local copy editor (`npm run copy:editor`) can show and
 * translate them in one place.
 *
 * Run:
 *   npm run copy:import                  # write all surfaces
 *   npm run copy:import -- --dry-run     # report only, write nothing
 *   npm run copy:import -- --surface=results
 *   npm run copy:import -- --no-dedup    # one entry per occurrence
 *                                        # (default: merge identical de within a surface)
 *
 * This is a STAGING dump, not a wiring step:
 *  - It writes `entries/<surface>.copy.json` files via the canonical serializer
 *    (`editorFormat.serializeEntries`) so diffs stay clean and the editor reads
 *    them back identically.
 *  - It does NOT register the new files in `sources.ts` and does NOT touch any
 *    source call site, so the app catalog/bundle and `npm run copy:scan` stay
 *    truthful — the strings are still hardcoded until each surface is reviewed
 *    and wired to `copy(...)` during its own migration slice.
 *  - Keys are auto-generated placeholders (`<surface>.<file>.<NNN>`); rename them
 *    to stable hand-authored keys when you actually migrate the surface. The
 *    German text lives in `de`, `en` is left blank for translation, and every
 *    occurrence (file:line) is recorded in `description` so wiring later is easy.
 *
 * The candidate source (`scan.ts`) is recall-biased, so expect some false
 * positives (short fragments, template-literal static parts) to weed in the
 * editor. Interpolated candidates are flagged in their description because they
 * need a parameterised key, not a flat string.
 *
 * All catalog logic is reused from `src/content/copy/*` (validators + serializer)
 * so the importer, the editor, and the app never drift. This script is just the
 * fs walk + arg parsing + entry synthesis.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadRawCopyEntries } from '../src/content/copy/sources'
import { buildScanReport, type ScanInputFile } from '../src/content/copy/scan'
import { parseEntriesFile, serializeEntries } from '../src/content/copy/editorFormat'
import { structuralIssues, COPY_KEY_PATTERN } from '../src/content/copy/validate'
import type { CopyEntry } from '../src/content/copy/types'

const ROOT = 'src'
const ENTRIES_DIR = 'src/content/copy/entries'

// ── Source walk (kept identical to copy-scan.ts so the candidate set matches) ─

/** Directories / files never worth scanning for un-migrated UI copy. */
function isExcluded(relPath: string): boolean {
  const path = relPath.replace(/\\/g, '/')
  return (
    path.startsWith('src/content/copy/') ||
    path.startsWith('src/test/') ||
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

// ── Entry-file discovery (mirrors copyEditorPlugin.listEntryFiles) ────────────

function listEntryFiles(): string[] {
  if (!existsSync(ENTRIES_DIR)) return []
  return readdirSync(ENTRIES_DIR)
    .filter((name) => name.endsWith('.copy.json'))
    .sort()
    .map((name) => `${ENTRIES_DIR}/${name}`)
}

function slugOfEntryFile(file: string): string {
  const base = file.split('/').pop() ?? file
  return base.replace(/\.copy\.json$/, '')
}

// ── Surface / key derivation ──────────────────────────────────────────────────

/** A scanner surface ("vertrag-detail", "App.tsx") → a clean file/grouping slug. */
function surfaceSlug(surface: string): string {
  const slug = surface
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'other'
}

/** First key segment: lowercase ASCII letters/digits only (no hyphens), must start with a letter. */
function keyPrefix(slug: string): string {
  const prefix = slug.replace(/-/g, '')
  return /^[a-z]/.test(prefix) ? prefix : `s${prefix}`
}

/** Middle key segment from a source file basename, e.g. "PrintReport.tsx" → "printreport". */
function fileSlug(file: string): string {
  const base = file.split('/').pop() ?? file
  const noExt = base.replace(/\.(tsx?|jsx?)$/, '')
  return noExt.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'file'
}

// ── Generated-entry model ─────────────────────────────────────────────────────

interface Occurrence {
  file: string
  line: number
  context: string
}

interface GeneratedEntry {
  key: string
  de: string
  surface: string
  description: string
  occ: Occurrence[]
  repFile: string
  repLine: number
  interpolated: boolean
}

const MAX_LOCATIONS = 8

function buildDescription(entry: GeneratedEntry): string {
  const locations = entry.occ.slice(0, MAX_LOCATIONS).map((o) => `${o.file}:${o.line}`)
  const more = entry.occ.length > MAX_LOCATIONS ? ` +${entry.occ.length - MAX_LOCATIONS} more` : ''
  const flag = entry.interpolated ? '⚠ interpolated — needs parameterised key · ' : ''
  return `${flag}auto-import · ${entry.occ[0].context} · ${locations.join(', ')}${more}`
}

// ── Arg parsing ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    [
      'Usage: npm run copy:import -- [--surface=<id>] [--no-dedup] [--dry-run]',
      '',
      '  --surface=<id>   only this surface (raw scanner surface or slug)',
      '  --no-dedup       one entry per occurrence (default merges identical de within a surface)',
      '  --dry-run        report what would be written; write nothing',
      '',
      'Stages un-migrated hardcoded German as catalog entries under',
      `${ENTRIES_DIR}/<surface>.copy.json so the local copy editor can show them.`,
      'Does not register the files in sources.ts and does not touch source call',
      'sites — copy:scan stays truthful until you wire each surface.',
    ].join('\n'),
  )
  process.exit(0)
}

const dryRun = argv.includes('--dry-run')
const dedup = !argv.includes('--no-dedup')
let surfaceFilter: string | undefined
for (const arg of argv) {
  if (arg.startsWith('--surface=')) surfaceFilter = surfaceSlug(arg.slice('--surface='.length))
}

// ── Scan ──────────────────────────────────────────────────────────────────────

const files: ScanInputFile[] = []
collectFiles(ROOT, files)

const knownDe = new Set(
  loadRawCopyEntries()
    .map((entry) => (typeof entry.de === 'string' ? entry.de.trim() : ''))
    .filter((value) => value.length > 0),
)

const report = buildScanReport(files, { isTracked: (text) => knownDe.has(text) })

// ── Group candidates → generated entries ──────────────────────────────────────

const candidates = report.candidates
  .slice()
  .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

/** slug → (dedupKey → GeneratedEntry) */
const bySlug = new Map<string, Map<string, GeneratedEntry>>()

for (const candidate of candidates) {
  const slug = surfaceSlug(candidate.surface)
  if (surfaceFilter && slug !== surfaceFilter) continue

  let group = bySlug.get(slug)
  if (!group) {
    group = new Map()
    bySlug.set(slug, group)
  }

  const dedupKey = dedup ? candidate.text : `${candidate.file}:${candidate.line}:${candidate.text}`
  let generated = group.get(dedupKey)
  if (!generated) {
    generated = {
      key: '',
      de: candidate.text,
      surface: slug,
      description: '',
      occ: [],
      repFile: candidate.file,
      repLine: candidate.line,
      interpolated: false,
    }
    group.set(dedupKey, generated)
  }
  generated.occ.push({ file: candidate.file, line: candidate.line, context: candidate.context })
  generated.interpolated = generated.interpolated || candidate.hasInterpolation
}

// ── Seed existing keys + per-surface existing de (so we merge, never clobber) ──

const usedKeys = new Set<string>()
const existingBySlug = new Map<string, CopyEntry[]>()

for (const file of listEntryFiles()) {
  const entries = parseEntriesFile(readFileSync(file, 'utf8'))
  existingBySlug.set(slugOfEntryFile(file), entries)
  for (const entry of entries) {
    if (typeof entry.key === 'string' && entry.key.length > 0) usedKeys.add(entry.key)
  }
}

function uniqueKey(prefix: string, fslug: string): string {
  let n = 1
  let key = `${prefix}.${fslug}.${String(n).padStart(3, '0')}`
  while (usedKeys.has(key)) {
    n += 1
    key = `${prefix}.${fslug}.${String(n).padStart(3, '0')}`
  }
  usedKeys.add(key)
  return key
}

// ── Assign keys + descriptions (stable order: representative file, then line) ──

for (const [slug, group] of bySlug) {
  const prefix = keyPrefix(slug)
  const generated = [...group.values()].sort(
    (a, b) => a.repFile.localeCompare(b.repFile) || a.repLine - b.repLine,
  )
  for (const entry of generated) {
    entry.key = uniqueKey(prefix, fileSlug(entry.repFile))
    entry.description = buildDescription(entry)
  }
}

// ── Compose final files, validate, write ──────────────────────────────────────

function toCopyEntry(entry: GeneratedEntry): CopyEntry {
  return { key: entry.key, de: entry.de, surface: entry.surface, risk: 'normal', description: entry.description }
}

const slugs = [...bySlug.keys()].sort()
let totalNew = 0
let totalSkipped = 0
let totalInterpolated = 0
const writes: { file: string; count: number; added: number }[] = []
const allWritten: CopyEntry[] = []

for (const slug of slugs) {
  const existing = existingBySlug.get(slug) ?? []
  const existingDe = new Set(existing.map((entry) => entry.de))
  const generated = [...bySlug.get(slug)!.values()].sort(
    (a, b) => a.repFile.localeCompare(b.repFile) || a.repLine - b.repLine,
  )

  const added: CopyEntry[] = []
  for (const entry of generated) {
    if (entry.interpolated) totalInterpolated += 1
    if (existingDe.has(entry.de)) {
      totalSkipped += 1
      continue
    }
    added.push(toCopyEntry(entry))
  }

  const finalEntries = [...existing, ...added]
  allWritten.push(...finalEntries)
  totalNew += added.length

  const file = `${ENTRIES_DIR}/${slug}.copy.json`
  writes.push({ file, count: finalEntries.length, added: added.length })

  if (!dryRun && added.length > 0) {
    writeFileSync(file, serializeEntries(finalEntries), 'utf8')
  }
}

// Fail loud if anything we generated is structurally invalid (would break the
// editor's catalog read) — better to abort than write a broken file.
const errors = structuralIssues(allWritten).filter((issue) => issue.level === 'error')
if (errors.length > 0) {
  console.error(`\n✖ Aborting — ${errors.length} structural error(s) in generated entries:`)
  for (const error of errors.slice(0, 20)) console.error(`  - [${error.code}] ${error.message}`)
  process.exit(1)
}

// Belt-and-braces: every generated key must match the stable-key pattern.
const badKeys = allWritten.filter((entry) => !COPY_KEY_PATTERN.test(entry.key))
if (badKeys.length > 0) {
  console.error(`\n✖ Aborting — ${badKeys.length} generated key(s) fail COPY_KEY_PATTERN:`)
  for (const entry of badKeys.slice(0, 20)) console.error(`  - ${entry.key}`)
  process.exit(1)
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(dryRun ? '\nDRY RUN — no files written.\n' : '\nWrote catalog entries:\n')
for (const write of writes) {
  if (write.added === 0) continue
  console.log(`  ${String(write.added).padStart(4)} +  ${write.file}  (file now ${write.count})`)
}
console.log(
  `\n${totalNew} new entr(y/ies) across ${writes.filter((w) => w.added > 0).length} surface(s) · ` +
    `${report.total} occurrence(s) scanned · ${totalSkipped} skipped (de already in catalog) · ` +
    `${totalInterpolated} interpolated (flagged)`,
)
console.log(
  dryRun
    ? '\nRe-run without --dry-run to write. Then reload the copy editor to see them.'
    : '\nReload the copy editor (npm run copy:editor) to see the new entries.\n' +
        'Next: review/rename keys + translate per surface, then wire call sites to copy(...).',
)
