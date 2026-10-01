/**
 * CLI: report the effective property-suite run configuration (issue #378).
 *
 * Validates PROPERTY_RUNS_MULTIPLIER / PROPERTY_SEED exactly the way the
 * property suites do (same helper) and prints both the PR-suite defaults and
 * the effective values, so any run — local or in the weekly property-sweep
 * workflow — records in its log which multiplier and seed produced a result.
 * A failing property is replayed by re-running with the printed values.
 *
 * Run: npm run properties:config
 * Exit codes: 0 = valid configuration (defaults or overrides); 1 = invalid
 * override (message on stderr).
 */
import {
  DEFAULT_SEED,
  MAX_RUNS_MULTIPLIER,
  MAX_SEED,
  resolvePropertyRunConfig,
} from '../src/utils/propertyRunConfig'

const PROPERTIES_GLOB = 'src/engine/*.property.test.ts'

function describeOverride(raw: string | undefined, name: string): string | undefined {
  const value = raw?.trim()
  return value ? `${name}=${value}` : undefined
}

function main(): void {
  const env = process.env
  const config = resolvePropertyRunConfig(env)
  const overrides = [
    describeOverride(env.PROPERTY_RUNS_MULTIPLIER, 'PROPERTY_RUNS_MULTIPLIER'),
    describeOverride(env.PROPERTY_SEED, 'PROPERTY_SEED'),
  ].filter((entry): entry is string => entry !== undefined)

  console.log('Property run configuration (issue #378)')
  console.log(`  source:          ${overrides.length > 0 ? overrides.join(', ') : 'defaults (no overrides set)'}`)
  console.log(`  seed base:       ${config.seed}`)
  console.log(`  runs multiplier: ${config.runsMultiplier}`)
  console.log(`  mode:            ${config.runsMultiplier === 1 ? 'PR suite (bounded)' : 'scheduled sweep (broader than PR)'}`)
  console.log(`  PR defaults:     seed base ${DEFAULT_SEED}, multiplier 1 (bounded sweep max ${MAX_RUNS_MULTIPLIER}, seed max ${MAX_SEED})`)
  console.log('  Run:             npx vitest run ' + PROPERTIES_GLOB)
  if (overrides.length > 0) {
    console.log(`  Replay:          ${overrides.join(' ')} npx vitest run ${PROPERTIES_GLOB}`)
  }
}

try {
  main()
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
