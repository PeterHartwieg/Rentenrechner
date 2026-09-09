// Conservative impact mapping: changed file paths -> review scope.
//
// The mapping errs toward breadth. Two tiers only:
//
// - 'broad'   — the change can move computed numbers, alter executable
//               logic/defaults, shift oracle baselines, or touch security
//               and the review gates themselves. All five calculation
//               domains are in scope when calculation is plausible, because
//               the shared engine feeds every product and both simulation
//               modes. Worker/API, tooling, and assurance-scope changes are
//               broad WITHOUT being called cosmetic: their rationale names
//               the meaningful category instead.
// - 'narrow'  — presentational-only paths: styling, prose docs, static
//               assets. No executable logic in scope.
//
// PRECEDENCE: meaningful-path rules are checked FIRST and always beat the
// cosmetic extension allowlist. `workers/**`, `scripts/**`, `.github/**`,
// `public/**`, `src/**` (including src/content/), and the assurance/config
// files listed below are meaningful regardless of extension — a .yml, .mjs,
// or .json file can carry rules, defaults, oracle baselines, or review-gate
// logic, and must never be narrowed away by its extension alone. The single
// carve-out is pure styling (`.css` et al.) inside those prefixes: styles
// carry no logic, and they are the narrow case the classifier exists to find.
//
// Anything NOT classified is broad. That fallback is the whole point: an
// unclassified path must never silently shrink the review.
//
// Domain ids are shared with the source-freshness catalog (sourceCatalog.mjs)
// so a stale research source and the PRs it affects speak the same language.
// The catalogued statutory sources themselves are imported from that catalog
// rather than re-listed here: a source that is worth tracking for freshness is
// by definition able to move a statutory interpretation, so it must never be
// classified as prose — and a source added to the catalog tomorrow must not be
// able to become cosmetic here by omission.

import { RESEARCH_DOCS } from '../sourceCatalog.mjs'

export const REVIEW_DOMAINS = [
  'tax-payroll',
  'kv-pv',
  'funding-eligibility',
  'investment-insurance',
  'household-interactions',
]

export const DOMAIN_LABELS = {
  'tax-payroll': 'Tax / payroll (ESt tariff, Lohnsteuer, Vorsorgepauschale)',
  'kv-pv': 'KV/PV (retirement health insurance, BBG apportionment)',
  'funding-eligibility': 'Funding / eligibility (bAV §3 Nr. 63, §10 Abs. 3, Riester, AVD)',
  'investment-insurance': 'Investment / insurance (accumulation, fees, Vorabpauschale, payouts)',
  'household-interactions': 'Household interactions (combine mode, transfers, statutory pension)',
}

// Meaningful prefixes, checked before any extension rule. Order within the
// list is irrelevant; the precedence over cosmetic extensions is absolute.
const MEANINGFUL_PREFIXES = [
  'src/', // engine, rules, app, features, domain, content, test — all executable or default-bearing
  'workers/', // worker/API executable logic and their configs
  'scripts/', // dev tooling — including this review toolchain itself
  '.github/', // workflows = review gates and CI behavior
  'public/', // redirects, manifests, prerendered route surface
  'docs/automation/', // review-gate and pipeline design docs
  'docs/adr/', // architectural decisions the review bar leans on
  'docs/agents/', // agent process docs (review bar mirror)
]

// Every catalogued statutory research/legal source, by path. Catalog-driven
// on purpose: the freshness catalog and the impact map must never disagree
// about which documents carry statutory interpretation.
export const CATALOGUED_SOURCE_PATHS = RESEARCH_DOCS.map((doc) => doc.path)

// Single files whose change is never presentational: assurance docs, the
// review bar itself, and build/security config.
const MEANINGFUL_FILES = new Set([
  ...CATALOGUED_SOURCE_PATHS,
  'AGENTS.md',
  'CLAUDE.md',
  'CONTEXT.md',
  'README.md',
  'BACKLOG.md',
  'LICENSE.md',
  'COMMERCIAL_LICENSE.md',
  'docs/validation.md',
  // Domain assurance maps: they route a change to the statutory rule file,
  // engine function, and research doc that own it (rules-and-tax/products),
  // define what the rule-year metadata promises, and enumerate which oracle
  // pins which number. Drift here mis-routes a later statutory change.
  'docs/context/rules-and-tax.md',
  'docs/context/products.md',
  'docs/rules-versioning.md',
  'docs/golden-coverage-audit.md',
  'package.json',
  'package-lock.json',
  'eslint.config.js',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'wrangler.jsonc',
  'vercel.json',
  'netlify.toml',
])

// Extension-only allowlist. Only reachable for paths that matched NO
// meaningful rule above.
const COSMETIC_EXTENSIONS = ['.css', '.md', '.mdx', '.html', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp']

// Styling is presentational even when it lives inside a meaningful prefix
// (src/features/*.css). Deliberately narrow: the meaningful rules still beat
// this carve-out for anything executable — .mjs, .json, .yml, src/content/.
const STYLING_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.styl']

// Files where a change cannot alter computed output AND carry none of the
// meaningful categories above.
const COSMETIC_PREFIXES = ['docs/']

export const MEANINGFUL_CATEGORIES = {
  'engine-rules': 'engine/rules/statutory values',
  'worker-api': 'worker/API executable logic',
  'tooling-review-gates': 'dev tooling / review gates / CI',
  'statutory-sources': 'catalogued statutory research / legal source',
  'assurance-config': 'assurance docs or build/security config',
  'application-code': 'application code (UI/state/display logic)',
}

function matchesPrefix(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix))
}

function matchesExtension(path, extensions) {
  return extensions.some((ext) => path.endsWith(ext))
}

// Classifies one path. 'meaningful' beats 'cosmetic' unconditionally — the
// only exception is pure styling inside a meaningful prefix, which carries no
// logic and is the narrow case the two-tier mapping exists for.
export function classifyPath(path) {
  if (MEANINGFUL_FILES.has(path)) return 'meaningful'
  if (matchesPrefix(path, MEANINGFUL_PREFIXES)) {
    if (matchesExtension(path, STYLING_EXTENSIONS)) return 'cosmetic'
    return 'meaningful'
  }
  if (matchesPrefix(path, COSMETIC_PREFIXES) || matchesExtension(path, COSMETIC_EXTENSIONS)) return 'cosmetic'
  return 'unclassified'
}

export function isUntrustedContextPath(path) {
  return UNTRUSTED_CONTEXT_PATTERNS.some((pattern) => pattern.test(path))
}

// Files that identify WHICH domains a broad change most affects. Focus hints
// never reduce scope; they only order the reviewer prompt.
//
// ALL_DOMAIN_PATTERNS covers paths that feed every calculation domain at
// once: the year rule files (BBGs feed tax/payroll AND KV/PV AND the bAV
// caps, Basiszins feeds Vorabpauschale, Rechengrößen feed GRV
// Entgeltpunkte), the shared accumulation→payout pipeline, and the captured
// statutory oracle fixtures. Mapping them to all five domains keeps the
// prompt honest: a broad change to one of these must NOT be presented as
// unfocused-but-cosmetic.
const ALL_DOMAIN_PATTERNS = [
  'src/rules/',
  'src/engine/buildResult.ts',
  'src/engine/simulate.ts',
  'src/test/externalGoldenFixtures.ts',
]

// Payout-channel engines at the engine root (they sit OUTSIDE
// src/engine/products/ and were previously unmapped, so e.g.
// `src/engine/etfPayout.ts` surfaced as "cosmetic-only" in the prompt while
// being a broad, tax-bearing change).
const PAYOUT_ENGINE_PATTERNS = [
  'src/engine/etfPayout.ts',
  'src/engine/insurancePayout.ts',
  'src/engine/bavPayout.ts',
  'src/engine/certifiedPensionPayout.ts',
  'src/engine/payoutMath.ts',
]

// Catalogued statutory sources focus the domains the catalog says they
// underpin — the same `areas` the freshness report uses, so a doc never
// focuses one thing here and another there.
function cataloguedSourcesForDomain(domain) {
  return RESEARCH_DOCS.filter((doc) => doc.areas.includes(domain)).map((doc) => doc.path)
}

const DOMAIN_FOCUS_MATCHERS = [
  {
    domain: 'tax-payroll',
    patterns: [
      ...ALL_DOMAIN_PATTERNS,
      ...cataloguedSourcesForDomain('tax-payroll'),
      'src/engine/tax.ts',
      'src/engine/salary.ts',
      'src/engine/salaryPhaseFunding.ts',
      // The single retirement-tax pipeline: cohort Besteuerungsanteil,
      // Versorgungsfreibetrag, Werbungskosten/Sonderausgaben and
      // Ehegattensplitting live here alongside the KV/PV apportionment, so
      // the file focuses BOTH domains (see calculateRetirementTax).
      'src/engine/retirementTax.ts',
    ],
  },
  {
    domain: 'kv-pv',
    patterns: [
      ...ALL_DOMAIN_PATTERNS,
      ...cataloguedSourcesForDomain('kv-pv'),
      'src/engine/retirementPayout.ts',
      'src/engine/retirementTax.ts',
      'src/engine/salary.ts',
    ],
  },
  {
    domain: 'funding-eligibility',
    patterns: [
      ...ALL_DOMAIN_PATTERNS,
      ...cataloguedSourcesForDomain('funding-eligibility'),
      'src/engine/simulationContext.ts',
      'src/engine/portfolioFunding.ts',
      'src/engine/portfolioTransfer.ts',
      'src/engine/salaryPhaseFunding.ts',
      'src/app/recommenderCandidates/',
      'src/engine/products/basisrente',
      'src/engine/products/riester',
      'src/engine/products/bav',
      'src/engine/products/altersvorsorgedepot',
    ],
  },
  {
    domain: 'investment-insurance',
    patterns: [
      ...ALL_DOMAIN_PATTERNS,
      ...cataloguedSourcesForDomain('investment-insurance'),
      ...PAYOUT_ENGINE_PATTERNS,
      'src/engine/accumulation.ts',
      'src/engine/fees.ts',
      'src/engine/marketReturns.ts',
      'src/engine/monteCarlo.ts',
      'src/engine/portfolioAllowance.ts',
      'src/engine/productPayout.ts',
      'src/engine/riester.ts',
      'src/engine/basisrente.ts',
      'src/engine/altersvorsorgedepot.ts',
      'src/engine/products/',
    ],
  },
  {
    domain: 'household-interactions',
    patterns: [
      ...ALL_DOMAIN_PATTERNS,
      ...cataloguedSourcesForDomain('household-interactions'),
      'src/engine/portfolioCombine.ts',
      'src/engine/combineContext.ts',
      'src/engine/portfolioAdapter.ts',
      'src/engine/portfolioProjection.ts',
      'src/engine/grv.ts',
      'src/engine/portfolio.ts',
      'src/app/recommender.ts',
      'src/app/contractDecisions.ts',
      'src/app/optimiereVorsorge.ts',
      'src/domain/workspace.ts',
      'src/domain/instances.ts',
      'src/storage.ts',
    ],
  },
]

// Context files reviewers receive per domain, in addition to the diff. Kept
// deliberately short: the diff plus these should fit comfortably in context.
export const DOMAIN_CONTEXT_FILES = {
  'tax-payroll': ['src/engine/tax.ts', 'src/rules/de2026.ts', 'docs/validation.md'],
  'kv-pv': ['src/engine/retirementPayout.ts', 'src/engine/retirementTax.ts'],
  'funding-eligibility': [
    'src/engine/simulationContext.ts',
    'src/engine/portfolioFunding.ts',
    'src/engine/salaryPhaseFunding.ts',
  ],
  'investment-insurance': ['src/engine/accumulation.ts', 'src/engine/fees.ts', 'src/engine/productRegistry.ts'],
  'household-interactions': ['src/engine/combineContext.ts', 'src/engine/portfolioCombine.ts', 'CONTEXT.md'],
}

// Always included so reviewers apply the repo's own P0/P1 bar, regardless of
// mapped domains.
export const BASE_CONTEXT_FILES = ['AGENTS.md', 'docs/validation.md']

// Approval-shaped files must never reach a reviewer as context: the toolchain
// treats review verdicts as earned per-run, and a diff that carries a file
// *named* like an approval must not be able to vouch for itself.
export const UNTRUSTED_CONTEXT_PATTERNS = [
  /review[-_]?receipt/i,
  /approval/i,
  /review[-_]?verdict/i,
  /^\.review\//,
]

export function focusDomainsForPaths(paths) {
  const focused = new Set()
  for (const path of paths) {
    for (const matcher of DOMAIN_FOCUS_MATCHERS) {
      if (matcher.patterns.some((pattern) => path === pattern || path.startsWith(pattern))) {
        focused.add(matcher.domain)
      }
    }
  }
  return REVIEW_DOMAINS.filter((domain) => focused.has(domain))
}

const CATALOGUED_SOURCE_SET = new Set(CATALOGUED_SOURCE_PATHS)

function meaningfulCategory(path) {
  if (CATALOGUED_SOURCE_SET.has(path)) return MEANINGFUL_CATEGORIES['statutory-sources']
  if (path.startsWith('src/engine/') || path.startsWith('src/rules/') || path === 'src/storage.ts') {
    return MEANINGFUL_CATEGORIES['engine-rules']
  }
  if (path.startsWith('workers/')) return MEANINGFUL_CATEGORIES['worker-api']
  if (path.startsWith('scripts/') || path.startsWith('.github/')) return MEANINGFUL_CATEGORIES['tooling-review-gates']
  if (MEANINGFUL_FILES.has(path) || path.startsWith('docs/')) return MEANINGFUL_CATEGORIES['assurance-config']
  return MEANINGFUL_CATEGORIES['application-code']
}

// Main entry: map changed file paths to review scope.
// Returns { breadth, domains, focusDomains, rationale, meaningfulCategories,
// untrustedContextPaths }.
export function mapImpact(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('impact mapping requires at least one changed file')
  }

  const untrustedContextPaths = files.filter(isUntrustedContextPath)
  const classifications = files.map((path) => ({ path, kind: classifyPath(path) }))
  const narrow = classifications.every(({ kind }) => kind === 'cosmetic')
  const focusDomains = focusDomainsForPaths(files)
  const domains = narrow ? [] : [...REVIEW_DOMAINS]

  const meaningfulPaths = classifications.filter(({ kind }) => kind === 'meaningful').map(({ path }) => path)
  const unclassifiedPaths = classifications.filter(({ kind }) => kind === 'unclassified').map(({ path }) => path)
  const meaningfulCategories = [...new Set(meaningfulPaths.map(meaningfulCategory))]

  let rationale
  if (narrow) {
    rationale =
      'all changed paths are presentational (styling, prose docs, static assets); no executable logic, statutory rules, worker/API, or review-gate surface in scope'
  } else {
    const parts = []
    if (meaningfulCategories.length > 0) parts.push(`meaningful scope: ${meaningfulCategories.join(', ')}`)
    if (unclassifiedPaths.length > 0) {
      parts.push(`unclassified path(s) fall back to full scope: ${unclassifiedPaths.join(', ')}`)
    }
    if (focusDomains.length > 0) parts.push(`calculation focus: ${focusDomains.join(', ')}`)
    rationale =
      (parts.join('; ') ||
        'calculation-bearing change') + '; the shared engine means all five domains stay in scope'
  }

  return {
    breadth: narrow ? 'narrow' : 'broad',
    domains,
    focusDomains,
    rationale,
    meaningfulCategories,
    untrustedContextPaths,
  }
}

// Context files for a plan: base + per-domain, filtered to what exists,
// de-duplicated, and stripped of anything that looks like an approval.
export function contextFilesForImpact(impact, exists) {
  const requested = [...BASE_CONTEXT_FILES]
  for (const domain of impact.domains) {
    requested.push(...(DOMAIN_CONTEXT_FILES[domain] ?? []))
  }
  const seen = new Set()
  const result = []
  for (const path of requested) {
    if (seen.has(path)) continue
    seen.add(path)
    if (isUntrustedContextPath(path)) continue
    if (exists(path)) result.push(path)
  }
  return result
}
