/**
 * Numeric bounds shared by the persisted-schema validators and every editor
 * that writes into them.
 *
 * Why this file exists: the contract editor validates a draft against its own
 * `ContractFieldSpec` min/max, and the load path validates the persisted
 * instance against the product validators in `src/engine/products/*.validation.ts`.
 * When those two sets of literals were authored independently they drifted, and
 * a value the editor accepted was rejected on the next load — which discarded
 * the instance. The bounds below are the single source both sides import, so
 * the drift cannot reappear.
 *
 * Only bounds that appear on **both** sides belong here. A validator range that
 * no editor field feeds (engine-internal allocations, return ranges) stays a
 * local literal in its validator.
 *
 * Rules of use:
 *  - The editor spec may be *narrower* than the validator (a UI may refuse a
 *    value the schema tolerates), never wider.
 *  - `integer: true` means the validator uses `intInRange`, so the editor must
 *    reject fractional input too.
 */

export interface NumericBound {
  readonly min: number
  readonly max: number
  /** `true` when the persisted validator requires an integer (`intInRange`). */
  readonly integer?: boolean
}

/** €/month per €10 000 capital. bAV, pAV, Basisrente, Riester, AVD. */
export const RENTENFAKTOR_BOUNDS: NumericBound = { min: 0, max: 100 }

/** Zeitrente runtime in years. bAV, pAV, Riester. */
export const ZEITRENTE_YEARS_BOUNDS: NumericBound = { min: 1, max: 50, integer: true }

/** Beitragsdynamik (`annualContributionGrowthRate`). bAV, pAV, ETF. */
export const CONTRIBUTION_GROWTH_BOUNDS: NumericBound = { min: 0, max: 0.1 }

/** bAV employer match as a share of the Entgeltumwandlung. */
export const CONTRACTUAL_MATCH_PERCENT_BOUNDS: NumericBound = { min: 0, max: 1 }

/** Storno-Abzug on surrender (`surrenderHaircutPct`). */
export const SURRENDER_HAIRCUT_BOUNDS: NumericBound = { min: 0, max: 1 }

/** `contractStartYear` on `InstanceCommon` (the insurance validator is stricter). */
export const CONTRACT_START_YEAR_BOUNDS: NumericBound = { min: 1900, max: 2100, integer: true }

/** `eligibility.ageAtContractStart` (Riester, AVD). */
export const AGE_AT_CONTRACT_START_BOUNDS: NumericBound = { min: 0, max: 120, integer: true }

/** `eligibility.eligibleChildren` (AVD). */
export const ELIGIBLE_CHILDREN_BOUNDS: NumericBound = { min: 0, max: 20, integer: true }

/** AVD certified payout-plan end age. */
export const PAYOUT_PLAN_END_AGE_BOUNDS: NumericBound = { min: 60, max: 120, integer: true }

/** `fees.acquisitionCostSpreadYears` — see `validateFees`. */
export const ACQUISITION_COST_SPREAD_YEARS_BOUNDS: NumericBound = {
  min: 1,
  max: 50,
  integer: true,
}

/** Optional contract return, matching the shared scenario return range. */
export const EXPECTED_RETURN_BOUNDS: NumericBound = { min: -0.5, max: 0.5 }
