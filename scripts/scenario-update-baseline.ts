/**
 * Captures the scenario-suite baselines and provenance file (issue #377).
 *
 *     npm run scenario:update -- --reason "<why the new output is correct>"
 *
 * CLEAN-SOURCE WORKFLOW: capture must run against COMMITTED calculation
 * sources (src/engine, src/rules, src/domain, src/app, src/utils, src/data).
 * A dirty tree refuses to capture — otherwise the baseline would silently pin
 * numbers no commit ever produced. The documented escape hatch is
 *
 *     npm run scenario:update -- --reason "..." --allow-dirty-reason "why"
 *
 * which records the dirty paths, the engine-source digest and the reason
 * verbatim in provenance.json.
 *
 * The reason is mandatory. Baselines are NEVER auto-accepted and captured
 * values are NEVER legal proof — they are INTERNAL REGRESSION anchors only.
 * Independent anchors live in `src/test/externalGoldenFixtures.ts` and must be
 * updated by hand, with a source, when the underlying law changes.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StageMap } from '../src/test/scenarioReports/types'
import { extractStages } from '../src/test/scenarioReports/stages'
import {
  loadFrozenInputs,
  rulesIdentityJson,
  suiteCaseMeta,
} from '../src/test/scenarioReports/suite'
import { activeRules } from '../src/rules'
import {
  contentSha256,
  engineSourceState,
  gitHeadSha,
  printEngineSourceDiff,
} from './scenarioGitState'

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseReason(argv: readonly string[]): string {
  const value = argValue(argv, '--reason')
  if (!value || value.trim().length < 8) {
    console.error(
      'Refusing to update baselines without a reason.\n' +
        'Usage: npm run scenario:update -- --reason "why the new output is correct"',
    )
    process.exit(2)
  }
  return value.trim()
}

const reason = parseReason(process.argv)
const allowDirtyReason = argValue(process.argv, '--allow-dirty-reason')
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'test', 'scenarioReports', 'baselines')
const inputs = loadFrozenInputs()

// --- clean-source gate -------------------------------------------------------

const engineState = engineSourceState()
if (engineState.dirty && !allowDirtyReason) {
  console.error(
    'Refusing to capture baselines: the calculation sources are DIRTY.\n' +
      'A baseline must be attributable to a committed engine state.\n' +
      'Dirty files:\n' +
      engineState.paths.map((p) => `  - ${p}`).join('\n'),
  )
  printEngineSourceDiff()
  console.error(
    '\nCommit (or stash) the changes first, or pass an explicit override:\n' +
      '  npm run scenario:update -- --reason "..." --allow-dirty-reason "why this is safe"\n' +
      'The override is recorded verbatim in baselines/provenance.json.',
  )
  process.exit(3)
}

// --- capture -----------------------------------------------------------------

const byFamily = new Map<string, Record<string, StageMap>>()
let stageCount = 0

for (const meta of suiteCaseMeta()) {
  const input = inputs[meta.familyId]?.[meta.caseId]
  if (!input) {
    console.error(
      `No frozen input for case "${meta.familyId}/${meta.caseId}". ` +
        'Run `npm run scenario:inputs` first.',
    )
    process.exit(2)
  }
  const { stages } = extractStages(input, activeRules)
  stageCount += Object.keys(stages).length
  const family = byFamily.get(meta.familyId) ?? {}
  family[meta.caseId] = stages
  byFamily.set(meta.familyId, family)
}

mkdirSync(outDir, { recursive: true })
for (const [familyId, cases] of byFamily) {
  const file = join(outDir, `family-${familyId}.json`)
  writeFileSync(file, `${JSON.stringify(cases, null, 2)}\n`)
  console.log(`wrote baselines/family-${familyId}.json (${Object.keys(cases).length} cases)`)
}

const rulesJson = rulesIdentityJson(activeRules)
const provenance = {
  label: 'INTERNAL REGRESSION' as const,
  baseSha: gitHeadSha(),
  baseShaCapturedAt: new Date().toISOString(),
  engineSources: {
    digestSha: engineState.digestSha,
    dirty: engineState.dirty,
    paths: engineState.paths,
    ...(allowDirtyReason ? { allowDirtyReason: allowDirtyReason.trim() } : {}),
  },
  rulesIdentity: JSON.parse(rulesJson) as Record<string, unknown>,
  notes:
    `Erfasst mit: npm run scenario:update -- --reason "${reason}"` +
    (engineState.dirty ? ` --allow-dirty-reason "${allowDirtyReason?.trim()}"` : '') +
    '. rulesIdentity friert activeRules (Jahreswerte) UND legalConstants (Kohortentabellen, ' +
    'Fünftelregelung, 1/120 SGB V) als kanonisches JSON ein; engineSources.digestSha identifiziert ' +
    'den Rechenwerktcode der Basis-Revision (sha256-Präfix). ' +
    'Rules-Identität dieser Erfassung: ' + contentSha256(rulesJson) + '. ' +
    'Alle Werte sind INTERNE REGRESSIONSANKER, keine Rechtsnachweise.',
}
writeFileSync(
  join(outDir, 'provenance.json'),
  `${JSON.stringify(provenance, null, 2)}\n`,
)
console.log(
  `wrote baselines/provenance.json (base ${provenance.baseSha}, ` +
    `engine digest ${provenance.engineSources.digestSha}, ` +
    `rules identity ${contentSha256(rulesJson)})`,
)
if (provenance.engineSources.dirty) {
  console.warn(
    `⚠️  captured against DIRTY calculation sources: ${provenance.engineSources.paths.join(', ')}`,
  )
}
console.log(`\n${stageCount} stage values captured across ${byFamily.size} families.`)
console.log('These are INTERNAL REGRESSION anchors — not legal or external validation.')
