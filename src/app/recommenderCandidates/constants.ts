/**
 * Shared constants for candidate generators.
 */

/**
 * Lifetime longevity assumption for `lifetimeCash` — uses the workspace's
 * `retirementEndAge` minus retirementAge. Capped at 35 years for sanity.
 */
export const MAX_LIFETIME_YEARS = 35

/**
 * Number of Monte Carlo paths run per candidate to compute `riskScoreP10`.
 * 200 keeps the total recommender cost (4 candidates × 200 paths × ~30 yr
 * each = 24k cheap FV iterations) under the 500 ms budget on the dashboard
 * render; the loop is plain arithmetic, no engine reentrancy. If profiling
 * regresses, drop to 100 here and revisit.
 */
export const MC_PATHS = 200

/**
 * Maximum number of candidates returned to the UI. Group-G QA decision
 * (issue 66) extends the recommender beyond the original 3-4 cards: bAV +
 * insurance + ETF + Basisrente + AVD + Riester are now all candidate-class
 * primitives and the modal must show every product class with a present
 * offer / instance side-by-side. We cap the slice at the number of product
 * generators so dropping a candidate is always due to it returning null
 * (e.g. no eligible instance, no remaining cap), never silent ranking
 * elimination.
 */
export const MAX_CANDIDATES = 6
