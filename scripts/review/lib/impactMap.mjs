// Conservative impact mapping: changed file paths -> review scope.
//
// The mapping errs toward breadth. Two tiers only:
//
// - 'broad'   — the change can move computed numbers or the rules they come
//               from. All five calculation domains are in scope, because the
//               shared engine feeds every product and both simulation modes.
// - 'narrow'  — cosmetic-only surfaces (CSS, content copy, docs, static
//               assets, dev tooling, tests). No calculation domain in scope;
//               reviewers are told the change is presentational.
//
// Anything NOT matched by the narrow table is broad. That fallback is the
// whole point: an unclassified path must never silently shrink the review.
//
// Domain ids are shared with the source-freshness catalog (sourceCatalog.mjs)
// so a stale research source and the PRs it affects speak the same language.

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

// Files where a change cannot alter computed output. Paths are prefix-matched
// exactly as written; extension rules are matched on the file name.
const NARROW_PREFIXES = [
  'docs/',
  'public/',
  'scripts/',
  'workers/', // worker scopes are separate npm workspaces with their own tests
  'src/content/',
]

const NARROW_EXTENSIONS = ['.css', '.md', '.mdx', '.html', '.json', '.yml', '.yaml', '.mjs']

// Files that identify WHICH domains a broad change most affects. Focus hints
// never reduce scope; they only order the reviewer prompt.
const DOMAIN_FOCUS_MATCHERS = [
  {
    domain: 'tax-payroll',
    patterns: [
      'src/engine/tax.ts',
      'src/engine/salary.ts',
      'src/rules/',
      'src/engine/salaryPhaseFunding.ts',
      'TAX_SOCIAL_SECURITY_2026_RESEARCH.md',
    ],
  },
  {
    domain: 'kv-pv',
    patterns: ['src/engine/retirementPayout.ts', 'src/engine/retirementTax.ts', 'src/engine/salary.ts'],
  },
  {
    domain: 'funding-eligibility',
    patterns: [
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
      'src/engine/accumulation.ts',
      'src/engine/fees.ts',
      'src/engine/marketReturns.ts',
      'src/engine/monteCarlo.ts',
      'src/engine/portfolioAllowance.ts',
      'src/engine/productPayout.ts',
      'src/engine/products/',
    ],
  },
  {
    domain: 'household-interactions',
    patterns: [
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

function matchesPrefix(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix))
}

function matchesExtension(path, extensions) {
  return extensions.some((ext) => path.endsWith(ext))
}

export function isNarrowPath(path) {
  if (matchesExtension(path, NARROW_EXTENSIONS)) return true
  return matchesPrefix(path, NARROW_PREFIXES)
}

export function isUntrustedContextPath(path) {
  return UNTRUSTED_CONTEXT_PATTERNS.some((pattern) => pattern.test(path))
}

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

// Main entry: map changed file paths to review scope.
// Returns { breadth, domains, focusDomains, rationale, untrustedContextPaths }.
export function mapImpact(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('impact mapping requires at least one changed file')
  }

  const untrustedContextPaths = files.filter(isUntrustedContextPath)
  const narrow = files.every(isNarrowPath)
  const focusDomains = focusDomainsForPaths(files)
  const domains = narrow ? [] : [...REVIEW_DOMAINS]

  const rationale = narrow
    ? 'all changed paths are cosmetic-only (CSS, copy, docs, static assets, dev tooling); no calculation domain in scope'
    : focusDomains.length > 0
      ? `calculation-bearing paths detected (focus: ${focusDomains.join(', ')}); shared engine means all domains are in scope`
      : 'unclassified path(s) present; conservative fallback treats the change as calculation-bearing across all domains'

  return {
    breadth: narrow ? 'narrow' : 'broad',
    domains,
    focusDomains,
    rationale,
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
