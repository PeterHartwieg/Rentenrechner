/**
 * Copy-coverage scanner — the pure core behind `npm run copy:scan`.
 *
 * Finds hardcoded German user-facing string literals (and JSX text) in the
 * source that are NOT yet in the copy catalog, so they can be migrated into
 * `entries/<surface>.copy.json` and surfaced in the local editor. This is the
 * "find the un-migrated text" counterpart to `inventory.ts` ("what is already
 * tracked") and `bilingual.ts` ("what still needs translating").
 *
 * Parsing uses the TypeScript compiler's parser (a devDependency) rather than a
 * regex so JSX text, attributes, imports and object keys are classified by AST
 * node — far fewer false positives than line-based grep. Detection of "German
 * copy" is still a heuristic (umlauts / ß / German typographic quotes / a small
 * strong-word list): it is biased toward precision, so it will MISS some
 * umlaut-free German (e.g. a bare "Start"); those are picked up by eyeballing a
 * surface during its migration slice. The report is advisory, never a gate.
 *
 * IMPORTANT — bundle hygiene: this module imports `typescript`, so it must never
 * be re-exported from `index.ts` (the barrel the app imports) or the compiler
 * would be pulled into the client bundle. It is consumed only by the CLI
 * (`scripts/copy-scan.ts`) and its unit test, neither of which the app reaches.
 * The fs/glob walk lives in the CLI; this core is pure (text in, report out) so
 * it stays unit-testable with synthetic snippets and free of Node typings
 * (tsconfig.app does not include `["node"]`).
 */
import * as ts from 'typescript'

/** One hardcoded-copy candidate found in the source. */
export interface ScanCandidate {
  /** Source file, repo-root-relative (forward slashes). */
  file: string
  /** 1-based line of the literal. */
  line: number
  /** The German text, whitespace-collapsed and trimmed. */
  text: string
  /**
   * Where the string sits, for triage:
   * `jsx-text`, `attr:<name>`, `call-arg`, `template-expr`, or `string`.
   */
  context: string
  /** Surface derived from the path (e.g. `vergleich`, `legal`, `content`). */
  surface: string
  /** True when the value came from a template literal with `${…}` holes. */
  hasInterpolation: boolean
}

export interface ScanGroup {
  /** File or surface id. */
  name: string
  count: number
}

export interface ScanReport {
  candidates: ScanCandidate[]
  total: number
  filesScanned: number
  filesWithCandidates: number
  /** German strings skipped because they already exist as a catalog `de` value. */
  alreadyTracked: number
  byFile: ScanGroup[]
  bySurface: ScanGroup[]
}

export interface ScanInputFile {
  /** Repo-root-relative path (forward slashes). */
  file: string
  /** Full file contents. */
  text: string
}

export interface ScanOptions {
  /** True if the trimmed German string is already a catalog `de` value (skip it). */
  isTracked?: (text: string) => boolean
}

// ── German detection ────────────────────────────────────────────────────────

/** Umlauts, ß, and German typographic quotes — a strong copy signal. */
const GERMAN_HINT = /[äöüÄÖÜß„“”]/

/**
 * Common German words used to catch umlaut-free German ("Du entscheidest
 * informiert."). Curated to avoid English collisions: ambiguous tokens that are
 * also English words (`was`, `war`, `man`, `will`, `an`, `am`, `in`, `die`,
 * `bald`, …) are deliberately excluded so English source strings don't trip the
 * scanner. Matched as whole, lowercased word tokens. The list errs toward recall
 * (a human reviews each surface during its migration slice); a handful of false
 * positives is cheaper than silently missing real copy.
 */
const GERMAN_WORDS = new Set<string>([
  // pronouns / possessives
  'du', 'dein', 'deine', 'deinen', 'deiner', 'deinem', 'dich', 'dir',
  'wir', 'uns', 'unser', 'unsere', 'unseren', 'ihr', 'euch', 'euer',
  'mein', 'meine', 'sein', 'seine', 'ihre', 'ihren',
  // conjunctions / function words (non-colliding)
  'und', 'oder', 'aber', 'sondern', 'sowie',
  'nicht', 'kein', 'keine', 'keinen', 'keiner', 'nichts',
  'wenn', 'dann', 'weil', 'dass', 'damit', 'sodass', 'obwohl', 'falls',
  'für', 'über', 'unter', 'ohne', 'gegen', 'zwischen', 'durch', 'nach', 'vor', 'seit', 'während',
  'zur', 'zum', 'vom', 'beim', 'ins',
  'auch', 'noch', 'schon', 'sehr', 'mehr', 'immer', 'nie', 'oft', 'etwa', 'rund',
  'jede', 'jeder', 'jedes', 'alle', 'alles', 'viele', 'wenige', 'manche', 'einige',
  'hier', 'dort', 'jetzt', 'heute', 'morgen', 'gestern',
  'wie', 'wer', 'wem', 'wen', 'warum', 'wieso', 'weshalb', 'wohin', 'woher',
  // verbs / auxiliaries (non-colliding)
  'werden', 'wird', 'wurde', 'wurden', 'worden',
  'haben', 'hatte', 'hatten', 'waren', 'gewesen',
  'können', 'kann', 'könnte', 'sollen', 'soll', 'sollte', 'müssen', 'muss', 'dürfen', 'darf',
  // domain vocabulary
  'rente', 'renten', 'rentner', 'vorsorge', 'altersvorsorge',
  'beitrag', 'beiträge', 'beitragsfrei', 'steuer', 'steuern', 'steuerfrei',
  'vertrag', 'verträge', 'auszahlung', 'auszahlungen', 'einzahlung', 'einzahlungen',
  'vergleich', 'vergleichen', 'angabe', 'angaben', 'rechner', 'beispiel',
  'jahr', 'jahre', 'jahren', 'jährlich', 'monat', 'monate', 'monaten', 'monatlich',
  'brutto', 'netto', 'gesetzlich', 'gesetzliche', 'privat', 'private', 'betrieblich', 'betriebliche',
  'kosten', 'gewinn', 'verlust', 'sparen', 'anlegen', 'rendite', 'kapital', 'vermögen',
  'gesamt', 'ungefähr', 'mindestens', 'höchstens', 'jeweils',
  // common UI action verbs (umlaut-free; umlaut forms like löschen/ändern/öffnen
  // /schließen/auswählen/zurück are already caught by the hint character)
  'erstellen', 'speichern', 'abbrechen', 'bearbeiten', 'starten', 'zeigen', 'anzeigen',
  'weiter', 'fertig', 'senden', 'laden', 'berechnen', 'eingeben', 'beschreiben', 'entscheiden',
  'hinzufügen', 'auswählen',
])

/** Collapse internal whitespace and trim — JSX text is full of newlines/indent. */
export function normalizeCopy(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Heuristic: does this look like a German user-facing string worth migrating?
 * Requires a letter and a minimum length, then accepts on a German hint
 * character (umlaut / ß / „ “) or a whole-word match against {@link GERMAN_WORDS}.
 * Biased toward recall — see {@link GERMAN_WORDS}.
 */
export function looksLikeGermanCopy(value: string): boolean {
  const text = normalizeCopy(value)
  if (text.length < 3) return false
  if (!/[A-Za-zäöüÄÖÜß]/.test(text)) return false
  // A single token containing an underscore is a code identifier
  // (`pre2005_steuerfrei`, `KEY_NAME`), never user copy.
  if (!/\s/.test(text) && text.includes('_')) return false
  if (GERMAN_HINT.test(text)) return true
  const tokens = text.toLowerCase().match(/[a-zäöüß]+/g) ?? []
  return tokens.some((token) => GERMAN_WORDS.has(token))
}

// ── AST context classification ──────────────────────────────────────────────

/** JSX attributes whose VALUE is user-facing copy (everything else is skipped). */
const COPY_ATTRS = new Set([
  'alt',
  'title',
  'placeholder',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
])

function jsxAttrContext(attr: ts.JsxAttribute, sf: ts.SourceFile): string | null {
  const name = attr.name.getText(sf)
  return COPY_ATTRS.has(name) ? `attr:${name}` : null
}

/**
 * Classify a string literal by its parent context. Returns a context label, or
 * `null` to skip (module specifiers, object keys, className/etc. attributes,
 * console.* / require() arguments).
 */
function classifyStringContext(node: ts.StringLiteralLike, sf: ts.SourceFile): string | null {
  const parent = node.parent
  if (!parent) return 'string'

  // import './x' / export … from './x' / import = require('x')
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return null
  if (ts.isExternalModuleReference(parent)) return null
  if (ts.isImportTypeNode(parent)) return null

  // Type-level string literal — a union member / literal type, never runtime
  // copy (e.g. `type Mode = 'vergleich' | 'kombinieren'`).
  if (ts.isLiteralTypeNode(parent)) return null

  // Object literal key (the value is reached separately).
  if (ts.isPropertyAssignment(parent) && parent.name === node) return null
  if (ts.isComputedPropertyName(parent)) return null

  // Call arguments: drop require()/import() specifiers and console.* noise.
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression
    if (ts.isIdentifier(callee) && callee.text === 'require') return null
    if (callee.kind === ts.SyntaxKind.ImportKeyword) return null
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'console'
    ) {
      return null
    }
    return 'call-arg'
  }

  // JSX attribute value — attr="string".
  if (ts.isJsxAttribute(parent) && parent.initializer === node) {
    return jsxAttrContext(parent, sf)
  }
  // JSX attribute value wrapped in an expression — attr={'string'}.
  if (ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
    return jsxAttrContext(parent.parent, sf)
  }

  return 'string'
}

function surfaceOf(file: string): string {
  const path = file.replace(/\\/g, '/')
  const feature = path.match(/^src\/features\/([^/]+)\//)
  if (feature) return feature[1]
  if (path.startsWith('src/content/')) return 'content'
  const segments = path.split('/')
  // src/<area>/… → the area (app, ui, seo, engine, …); otherwise the first segment.
  return segments[1] ?? segments[0] ?? 'other'
}

// ── Scanning ────────────────────────────────────────────────────────────────

/** Scan a single source file's text for un-tracked German copy candidates. */
export function scanSourceText(
  file: string,
  text: string,
  options: ScanOptions = {},
): { candidates: ScanCandidate[]; tracked: number } {
  const isTracked = options.isTracked ?? (() => false)
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, /* setParentNodes */ true, scriptKind)
  const surface = surfaceOf(file)

  const candidates: ScanCandidate[] = []
  let tracked = 0

  const consider = (node: ts.Node, raw: string, context: string, hasInterpolation: boolean): void => {
    const value = normalizeCopy(raw)
    if (!looksLikeGermanCopy(value)) return
    if (isTracked(value)) {
      tracked += 1
      return
    }
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    candidates.push({ file, line, text: value, context, surface, hasInterpolation })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) {
      const context = classifyStringContext(node, sf)
      if (context) consider(node, node.text, context, false)
    } else if (ts.isJsxText(node)) {
      consider(node, node.text, 'jsx-text', false)
    } else if (ts.isTemplateExpression(node)) {
      // Static parts only — the German lives in the literal head/spans, not the
      // interpolated expressions. Flagged so the migrator knows it needs a
      // parameterised key, not a flat string.
      const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)]
      consider(node, parts.join(' '), 'template-expr', true)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  return { candidates, tracked }
}

function groupCounts(values: string[]): ScanGroup[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Aggregate per-file scan results into a single report. */
export function buildScanReport(files: readonly ScanInputFile[], options: ScanOptions = {}): ScanReport {
  const candidates: ScanCandidate[] = []
  let alreadyTracked = 0
  const filesWithCandidates = new Set<string>()

  for (const { file, text } of files) {
    const result = scanSourceText(file, text, options)
    alreadyTracked += result.tracked
    if (result.candidates.length > 0) filesWithCandidates.add(file)
    candidates.push(...result.candidates)
  }

  return {
    candidates,
    total: candidates.length,
    filesScanned: files.length,
    filesWithCandidates: filesWithCandidates.size,
    alreadyTracked,
    byFile: groupCounts(candidates.map((candidate) => candidate.file)),
    bySurface: groupCounts(candidates.map((candidate) => candidate.surface)),
  }
}

// ── Filtering + rendering ───────────────────────────────────────────────────

export interface ScanFilter {
  /** Restrict to one surface. */
  surface?: string
  /** Restrict to files whose path starts with this prefix. */
  pathPrefix?: string
}

export function filterReport(report: ScanReport, filter: ScanFilter): ScanReport {
  const prefix = filter.pathPrefix?.replace(/\\/g, '/')
  const candidates = report.candidates.filter((candidate) => {
    if (filter.surface && candidate.surface !== filter.surface) return false
    if (prefix && !candidate.file.startsWith(prefix)) return false
    return true
  })
  return {
    ...report,
    candidates,
    total: candidates.length,
    filesWithCandidates: new Set(candidates.map((candidate) => candidate.file)).size,
    byFile: groupCounts(candidates.map((candidate) => candidate.file)),
    bySurface: groupCounts(candidates.map((candidate) => candidate.surface)),
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/** Render the report as a human-readable, surface-grouped listing + summary. */
export function formatScanReport(report: ScanReport): string {
  const lines: string[] = []

  if (report.total === 0) {
    lines.push('No un-tracked German copy found. 🎉')
  } else {
    const byFile = new Map<string, ScanCandidate[]>()
    for (const candidate of report.candidates) {
      const list = byFile.get(candidate.file) ?? []
      list.push(candidate)
      byFile.set(candidate.file, list)
    }
    // Files ordered by candidate count (busiest first) — migrate those first.
    const orderedFiles = [...byFile.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    )
    for (const [file, list] of orderedFiles) {
      lines.push(`\n${file}  (${list.length})  [${list[0].surface}]`)
      for (const candidate of list.sort((a, b) => a.line - b.line)) {
        const tag = candidate.hasInterpolation ? ' ⟨tmpl⟩' : ''
        lines.push(
          `  ${String(candidate.line).padStart(4)}  ${candidate.context.padEnd(12)}  ${truncate(candidate.text, 64)}${tag}`,
        )
      }
    }
    lines.push('')
  }

  lines.push(
    `${report.total} candidate(s) · ${report.filesWithCandidates}/${report.filesScanned} file(s) · ` +
      `${report.bySurface.length} surface(s) · ${report.alreadyTracked} already in catalog`,
  )
  if (report.bySurface.length > 0) {
    lines.push(`by surface: ${report.bySurface.map((group) => `${group.name} ${group.count}`).join(', ')}`)
  }

  return lines.join('\n')
}
