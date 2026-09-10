# Issue #349 — Combine: bAV offers retain a hidden default conversion

## Summary

Recording a bAV Angebot could retain €200/month Entgeltumwandlung while the inline editor hid that field. Activating the offer could then consume funding headroom using the hidden amount, and accepting a recommender candidate could add its contribution on top of that stale value.

Offered bAV instances now store `monthlyGrossConversion: 0` on creation and update. One pure normaliser owns the rule; switching back to active preserves zero until the user enters the real amount. The existing recommender apply guard uses a zero base for offered bAV and private-insurance targets. The orphaned `bavOfferDraftToInstance` helper is removed.

## Review round 1

The review correctly identified that transition-only zeroing missed creation and re-saving an already-offered contract. Regressions reproduced seven failures with €200 stored instead of zero before the repair.

- `normaliseOfferedBav` replaces `bavOfferedTransitionPatch`. It lives in the domain layer to avoid a circular dependency between `workspaceIdentity.ts` and the inventory registry.
- The registry draft converter, contract draft patch/new-instance adapters, `addPopulatedInstance`, `updateInstance`, and inline instance editor apply the same rule. In this checkout, onboarding's `buildWorkspaceFromDraft` lives in `inventoryHelpers.ts` and delegates to the registry converter; `onboardingDraft.ts` creates no contracts.
- The existing v2 migrate+validate load pipeline repairs offered bAV conversions in the baseline, every what-if, and every saved baseline snapshot.
- Creation-to-activation regressions cover the registry, onboarding, new-contract draft, draft patch, and populated-instance routes. Update regressions cover status flips and repeated writes with or without an explicit status. Storage tests cover legacy offers, active-value preservation, snapshot repair, and idempotence.

## Review round 2

The review correctly identified that zeroing the numeric conversion retained confirmation/document provenance for the discarded value. Tests first reproduced seven failures across draft creation, v2 load repair, manual activation, recommender activation, metadata-bearing updates, and readiness.

- `normaliseOfferedBav` now removes the bare `monthlyGrossConversion` key from both `inputStatus` and `evidenceMap`, without mutating the caller or neighbouring metadata. This also repairs already-zeroed offers carrying stale provenance.
- Contract draft patches normalise values and derived metadata together. Add/update mutations normalise after merging the separate status argument, so it cannot restore discarded provenance. The existing v2 load pipeline applies this full normaliser to the baseline, what-ifs, and saved baseline snapshots.
- Recommender activation normalises the offered target before assigning its generated amount. Regressions cover both legacy €200 offers and offers already repaired on load.
- Readiness uses the existing `instance-contribution-unknown` blocker for an active bAV with an assumed zero. Entered/documented zero remains a valid answer; paid-up contracts remain exempt.

## Review round 3

The three findings reproduced as four failing tests: inline entry omitted answer metadata, insurance activation retained metadata for a replaced contribution, and v2 load repair normalised the snapshot before recovering an old recommender addition.

- The inline Brutto-Umwandlung callback now stamps `inputStatus.monthlyGrossConversion: 'entered'` and matching user-confirmed evidence, preserving neighbouring metadata. The panel passes this through its existing patch path. Entering zero on an active bAV with €100/month fixed employer funding keeps the household result displayable; the round-2 blocker for an assumed active zero remains unchanged.
- Activating an offered insurance contract removes only `monthlyContribution` from `inputStatus` and `evidenceMap` before assigning the generated amount. Both prior `document` and `unknown` statuses now resolve to truthful `assumed` provenance without blocking the what-if total.
- `buildWhatIfFromCandidate` persists `origin: 'recommender'`; v2 load repair uses this explicit marker before normalising snapshots. For a matching active bAV whose conversion is at least the positive offered snapshot amount, it subtracts that stale amount once. The legacy €400 alternative loads at €200 and applying it yields €200; repeated loads are idempotent.
- Manual alternatives remain untouched because their larger amount may be intentional. Controls also cover zero or active snapshots, smaller conversions, paid-up instances, and mismatched instance IDs. Recommendation-like labels alone never trigger repair.

## Review round 4

The load-path regression reproduced the remaining employer-funding error: subtracting the stale €200 conversion left the €150 fixed employer amount that the old application materialised at €400. The corrected €200 conversion should receive a 50% match (€100/month), with no fixed contribution.

- Moved the existing offer resolver, employer-contribution helper, and saved-plan patch into the React-free `recommenderCandidates/bavOffer.ts`. Storage and the recommender now share the patch without importing the recommender orchestrator into storage. Both recommender call sites retain the same offer terms and total.
- After subtracting the stale conversion, load repair resolves the snapshot's stored offer terms and reapplies every saved-plan patch field: employer match/fixed funding, statutory subsidy flag, payout terms, confirmation, and fees. The instance schema does not persist the modal employer maximum; this repair uses the available snapshot terms.
- The exact €200 offer + €200 candidate / 50% match / €0 fixed / €150 maximum case now loads with €200 conversion, 50% match, €0 fixed, and €100 employer funding. The whole repaired instance and `buildPortfolioFunding` result equal fresh application. The regression also pins fresh application on both sides of the employer maximum, manual-what-if preservation, and repeated-load idempotence; existing conservative repair controls remain.

## Validation

- `npm run verify`: lint clean (`--max-warnings=0`); 276 frontend test files, 5211 passed + 1 skipped; both Worker typechecks passed; Worker suites passed (26 + 11 tests); production build and prerender succeeded.
- Round 4 added 2 load-path regression cases. All 124 tests across storage load paths, the recommender, and bAV candidate generation pass.
- No oracle or baseline updates. Generated `public/og/` output discarded. No GitHub access or push.

## Scope

The dedicated “Angebot erfassen” UX remains deferred. Activation does not restore a previous conversion: the user enters the real amount. Engine calculations, statutory rules, and rounding are unchanged.

Refs #349
