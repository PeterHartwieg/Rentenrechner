/**
 * Writes the frozen synthetic scenario inputs to
 * `src/test/scenarioReports/inputs/<familyId>.json` (issue #377).
 *
 * Run ONCE when adding or changing a scenario family:
 *
 *     npm run scenario:inputs
 *
 * Routine test execution never calls this — the suite reads the committed
 * JSON, so it cannot drift with `defaultScenario` at runtime. Every input is
 * SYNTHETIC (no real-person data).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAllInputs } from '../src/test/scenarioReports/inputs/buildInputs'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'test', 'scenarioReports', 'inputs')

const inputs = buildAllInputs()
mkdirSync(outDir, { recursive: true })

for (const [familyId, cases] of Object.entries(inputs)) {
  const file = join(outDir, `${familyId}.json`)
  writeFileSync(file, `${JSON.stringify(cases, null, 2)}\n`)
  console.log(`wrote ${familyId}.json (${Object.keys(cases).length} cases)`)
}

console.log(`\n${Object.keys(inputs).length} input files written to src/test/scenarioReports/inputs/`)
