/**
 * Candidate-generator registry.
 *
 * `CANDIDATE_GENERATORS` is the ordered list of product-level generators.
 * Order determines the "priority" pass in `recommendNextEuro` — each generator
 * returns at most one candidate (the best for that product class), so the list
 * has at most one candidate per product. The orchestrator in `recommender.ts`
 * iterates this list, collects non-null candidates, then ranks them.
 *
 * Adding a new product's candidate generator:
 *   1. Create `src/app/recommenderCandidates/<product>.ts` exporting a
 *      `CandidateGenerator`-compatible function.
 *   2. Add it here in the appropriate priority slot.
 *
 * Ranking is NOT determined by this order — ranking happens in
 * `rankRecommendedCandidates` after all candidates are scored.
 */

export { makeEtfCandidate } from './etf'
export { makeBavCandidate, monthlyEmployerContributionForOffer } from './bav'
export { makeBasisrenteCandidate } from './basisrente'
export { makeAvdCandidate } from './altersvorsorgedepot'
export { makeInsuranceCandidate } from './insurance'
export { makeRiesterTopUpCandidate } from './riester'
export type { GeneratorContext, CandidateDraft, CandidateGenerator, BasisScenarioInfo, BavEmployerOfferInput, ResolvedBavOffer } from './types'
export {
  projectMonthlyContributionFV,
  basisInstanceResults,
  synthesizeProductResult,
} from './types'
export { MAX_LIFETIME_YEARS, MC_PATHS, MAX_CANDIDATES } from './constants'

import type { CandidateGenerator } from './types'
import { makeEtfCandidate } from './etf'
import { makeBavCandidate } from './bav'
import { makeBasisrenteCandidate } from './basisrente'
import { makeAvdCandidate } from './altersvorsorgedepot'
import { makeRiesterTopUpCandidate } from './riester'
import { makeInsuranceCandidate } from './insurance'

/**
 * Ordered list of candidate generators. Each generator is called once per
 * `recommendNextEuro` invocation. The orchestrator collects all non-null
 * results and then ranks them via `rankRecommendedCandidates`.
 *
 * The order here establishes the "tie-break" for equal-ranked candidates
 * (stable sort preserves this order within tied score buckets).
 */
export const CANDIDATE_GENERATORS: CandidateGenerator[] = [
  makeEtfCandidate,
  makeBavCandidate,
  makeBasisrenteCandidate,
  makeAvdCandidate,
  makeRiesterTopUpCandidate,
  makeInsuranceCandidate,
]
