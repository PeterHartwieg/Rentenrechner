/**
 * Shared run configuration for the four constrained property suites
 * (issue #378).
 *
 * The PR suite (`npm run test:properties`, also inside `npm run verify` via
 * `npm test`) runs every property with its authored `numRuns` and the fixed
 * seed base `DEFAULT_SEED = 378`, so a failure reproduces exactly and
 * fast-check shrinking reports a minimal counterexample. A broader sweep —
 * the weekly `property-sweep` workflow, or any manual run — scales the same
 * properties through two validated environment variables:
 *
 *   PROPERTY_RUNS_MULTIPLIER  integer 1..8 (default 1). Multiplies every
 *                             property's authored run count. 1 is exactly the
 *                             PR suite; 8 is the bounded scheduled maximum.
 *   PROPERTY_SEED             integer 0..2^31−1 (default 378). Replaces the
 *                             seed base for an independently reproducible
 *                             sweep.
 *
 * Both are validated here — the single place the test files, the CLI
 * (`npm run properties:config`) and the workflow read them — and invalid
 * values fail loudly instead of being silently ignored, so a sweep never
 * runs with a configuration nobody intended.
 */

/** Default seed base; each property pins `seed = base + n`. */
export const DEFAULT_SEED = 378

/** Inclusive upper bound for PROPERTY_RUNS_MULTIPLIER. Keeps any sweep bounded. */
export const MAX_RUNS_MULTIPLIER = 8

/** Inclusive upper bound for PROPERTY_SEED (fits fast-check's 32-bit seed domain). */
export const MAX_SEED = 2 ** 31 - 1

/** Resolved configuration for a whole suite run. */
export interface PropertyRunConfig {
  /** Seed base; property n runs with `seed + n`. */
  seed: number
  /** Factor applied to every property's authored run count. */
  runsMultiplier: number
}

/** fast-check params object for a single property. */
export interface PropertyRunParams {
  seed: number
  numRuns: number
}

function readIntEnv(value: string | undefined, name: string): number | undefined {
  const raw = value?.trim()
  if (raw === undefined || raw === '') return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer, got "${raw}"`)
  }
  return parsed
}

/**
 * Resolve the run configuration from raw environment values. Unset or empty
 * variables fall back to the PR-suite defaults; out-of-domain values throw
 * with the accepted range in the message.
 */
export function resolvePropertyRunConfig(
  env: {
    PROPERTY_RUNS_MULTIPLIER?: string | undefined
    PROPERTY_SEED?: string | undefined
  } = {},
): PropertyRunConfig {
  const multiplier = readIntEnv(env.PROPERTY_RUNS_MULTIPLIER, 'PROPERTY_RUNS_MULTIPLIER')
  if (multiplier !== undefined && (multiplier < 1 || multiplier > MAX_RUNS_MULTIPLIER)) {
    throw new Error(
      `PROPERTY_RUNS_MULTIPLIER must be an integer between 1 and ${MAX_RUNS_MULTIPLIER}, got ${multiplier}`,
    )
  }
  const seed = readIntEnv(env.PROPERTY_SEED, 'PROPERTY_SEED')
  if (seed !== undefined && (seed < 0 || seed > MAX_SEED)) {
    throw new Error(`PROPERTY_SEED must be an integer between 0 and ${MAX_SEED}, got ${seed}`)
  }
  return { seed: seed ?? DEFAULT_SEED, runsMultiplier: multiplier ?? 1 }
}

/**
 * fast-check params for one property: the authored PR-suite run count scaled
 * by the configured multiplier, seeded at the configured base plus the
 * property's offset (preserving the per-property fixed seeds the suites pin).
 */
export function propertyRunParams(
  authoredNumRuns: number,
  seedOffset: number,
  config: PropertyRunConfig = resolvePropertyRunConfig(process.env),
): PropertyRunParams {
  return { seed: config.seed + seedOffset, numRuns: authoredNumRuns * config.runsMultiplier }
}
