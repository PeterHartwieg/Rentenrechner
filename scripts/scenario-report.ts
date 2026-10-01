/**
 * Runs the local scenario-report suite and writes the artifacts (issue #377).
 *
 *     npm run scenario:report
 *
 * Emits (ALSO on failure — the report is the diagnostic, not a reward):
 *   artifacts/scenario-report.json — machine-readable report
 *   artifacts/scenario-report.md   — readable report (first divergent stage per case)
 *
 * The report stamps TWO engine identities: the baseline's capture state and
 * the state THIS evaluation ran against (HEAD + calculation-source digest +
 * dirty paths). Exit code 1 on any unexpected divergence, anchor violation,
 * replay drift, rules drift, or missing provenance. The runner never
 * auto-accepts.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EngineIdentity } from '../src/test/scenarioReports/types'
import {
  CAPTURED_PROVENANCE,
  buildRegistry,
  capturedRulesIdentityJson,
  runSuite,
} from '../src/test/scenarioReports/suite'
import { assembleReport, toMarkdownReport } from '../src/test/scenarioReports/report'
import { activeRules } from '../src/rules'
import {
  contentSha256,
  engineSourceState,
  gitHeadSha,
  printEngineSourceDiff,
} from './scenarioGitState'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'artifacts')

const evaluated: EngineIdentity = (() => {
  const state = engineSourceState()
  return {
    sha: gitHeadSha(),
    engineSourcesDigestSha: state.digestSha,
    engineSourcesDirty: state.dirty,
    engineDirtyPaths: state.paths,
  }
})()

const baseline: EngineIdentity & { baseShaCapturedAt: string } = {
  sha: CAPTURED_PROVENANCE?.baseSha ?? '(missing provenance.json)',
  baseShaCapturedAt: CAPTURED_PROVENANCE?.baseShaCapturedAt ?? '(missing provenance.json)',
  engineSourcesDigestSha: CAPTURED_PROVENANCE?.engineSources?.digestSha ?? '(missing)',
  engineSourcesDirty: CAPTURED_PROVENANCE?.engineSources?.dirty ?? false,
  engineDirtyPaths: CAPTURED_PROVENANCE?.engineSources?.paths ?? [],
}

const cases = buildRegistry()
const result = runSuite(cases, activeRules)

const report = assembleReport(
  result,
  {
    baseline,
    evaluated,
    baselineRulesSnapshotSha: capturedRulesIdentityJson()
      ? contentSha256(capturedRulesIdentityJson()!)
      : '(missing)',
    liveRulesSnapshotSha: contentSha256(result.rulesIdentityJson),
  },
  new Date().toISOString(),
)
const markdown = toMarkdownReport(report, result)

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'scenario-report.json'), `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(join(outDir, 'scenario-report.md'), `${markdown}\n`)

console.log(`Scenario suite: ${result.totalCases} cases, ${result.totalStages} stages`)
console.log(`Evaluated engine: ${evaluated.sha}${evaluated.engineSourcesDirty ? ' (DIRTY calculation sources!)' : ''}`)
console.log(`  source digest ${evaluated.engineSourcesDigestSha}, baseline digest ${baseline.engineSourcesDigestSha}`)
console.log(
  `Rules provenance: ${result.rulesProvenanceStatus}` +
    (result.rulesProvenanceStatus === 'match'
      ? ''
      : ` (baseline ${report.generatedFrom.baselineRulesSnapshotSha} vs run ${report.generatedFrom.liveRulesSnapshotSha})`),
)
console.log('Report written to artifacts/scenario-report.md (+ .json)')

if (evaluated.engineSourcesDirty) {
  console.warn('\n⚠️  This evaluation ran against UNCOMMITTED calculation sources:')
  printEngineSourceDiff()
  console.warn('The report stamps this state; it is not a verdict on any committed revision.')
}

if (!result.ok) {
  console.error(`\n❌ ${result.failedCases} case(s) diverge; gate = ${result.rulesProvenanceStatus}:`)
  if (result.rulesProvenanceStatus === 'missing') {
    console.error('  No baselines/provenance.json — the baselines cannot be attributed to an engine state.')
  } else if (result.rulesSnapshotDrift) {
    console.error(
      '  Rules identity changed since capture — stage deltas mix rule changes with model changes.',
    )
  }
  for (const failed of result.cases.filter((c) => !c.ok)) {
    const first = failed.firstDivergence ?? failed.replayDrift
    console.error(
      `  ${failed.caseId}\n` +
        `    first divergent stage: ${first ? first.path : '(anchor/replay failure)'}`,
    )
    if (first) {
      console.error(
        `      expected ${JSON.stringify(first.expected)} · actual ${JSON.stringify(first.actual)} · ` +
          `delta ${first.delta ?? 'n/a'} · tolerance ${first.tolerance}`,
      )
    }
    for (const failure of failed.anchorFailures) {
      console.error(`    external anchor: ${failure}`)
    }
    if (failed.replayDrift) {
      console.error(`    deterministic replay drift at: ${failed.replayDrift.path}`)
    }
  }
  console.error(
    '\nIf (and only if) the new output is intended, update the baseline deliberately:\n' +
      '  npm run scenario:update -- --reason "<why the change is correct>"',
  )
  process.exit(1)
}

console.log('✅ all cases reproduce the captured baseline (INTERNAL REGRESSION anchor)')
