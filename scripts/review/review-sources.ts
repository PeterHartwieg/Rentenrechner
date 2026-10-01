/**
 * npm run review:sources [-- --json] [-- --fail-on-stale]
 *
 * Deterministic source-freshness report over the source-review catalog:
 * golden sources reused from src/test/externalGoldenFixtures.ts
 * (validationSources) plus the root research docs. Runs under vite-node so
 * the fixture file is imported directly instead of duplicated.
 *
 * Exit codes: 0 = report rendered; 1 = --fail-on-stale and at least one
 * source needs attention (usable by the operator's local heartbeat).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { validationSources } from '../../src/test/externalGoldenFixtures'
import { assessFreshness, buildCatalog, parseResearchDocHeaders, renderFreshnessReport, DEFAULT_POLICY } from './lib/sources.mjs'
import { GOLDEN_SOURCE_AREAS, GOLDEN_SOURCE_REVIEWS, RESEARCH_DOCS } from './sourceCatalog.mjs'
import { repoRootFromArgv } from './lib/repoRoot.mjs'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const failOnStale = args.includes('--fail-on-stale')
const root = repoRootFromArgv(args)

const researchDocEntries = RESEARCH_DOCS.map((doc) => {
  let text = ''
  try {
    text = readFileSync(join(root, doc.path), 'utf8')
  } catch {
    // A missing doc surfaces as an entry with no dates rather than crashing
    // the whole report — absence of evidence is exactly what should be shown.
  }
  return { ...doc, headers: parseResearchDocHeaders(text) }
})

const catalog = buildCatalog({
  goldenSources: validationSources,
  researchDocEntries,
  goldenAreas: GOLDEN_SOURCE_AREAS,
  goldenReviews: GOLDEN_SOURCE_REVIEWS,
})

const now = new Date()
const assessment = assessFreshness(catalog, { now, policy: DEFAULT_POLICY })

if (asJson) {
  console.log(JSON.stringify({ generatedAt: now.toISOString(), policy: DEFAULT_POLICY, sources: assessment }, null, 2))
} else {
  console.log(renderFreshnessReport(assessment, { now, policy: DEFAULT_POLICY }))
}

if (failOnStale && assessment.some((entry) => entry.needsAttention)) {
  process.exit(1)
}
