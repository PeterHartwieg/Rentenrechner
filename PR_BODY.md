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

Inline entry now records answer metadata, and insurance activation clears provenance for the replaced contribution.

- The inline Brutto-Umwandlung callback now stamps `inputStatus.monthlyGrossConversion: 'entered'` and matching user-confirmed evidence, preserving neighbouring metadata. The panel passes this through its existing patch path. Entering zero on an active bAV with €100/month fixed employer funding keeps the household result displayable; the round-2 blocker for an assumed active zero remains unchanged.
- Activating an offered insurance contract removes only `monthlyContribution` from `inputStatus` and `evidenceMap` before assigning the generated amount. Both prior `document` and `unknown` statuses now resolve to truthful `assumed` provenance without blocking the what-if total.
- `buildWhatIfFromCandidate` persists `origin: 'recommender'`. Legacy alternatives keep their stored conversion; offered bAVs are still normalised across baseline, what-ifs, and snapshots.

## Review round 4

The offer resolver, employer-contribution helper, and saved-plan patch share the React-free `recommenderCandidates/bavOffer.ts` module. Both recommender call sites retain the same offer terms and total.

## Review round 5

Removed the legacy recommender what-if repair entirely. The original candidate's employer cap (`monthlyCapEUR`) and modal offer terms were never persisted, so reconstructing them from a snapshot is lossy. For example, an €80 cap that still binds after correcting the conversion cannot be recovered. A repair could silently change employer funding, fees, payout mode, or Rentenfaktor.

Old recommender alternatives stay as saved. Users regenerate them by applying the recommendation again on the repaired baseline; the fixed apply path handles this correctly. Storage retains offered-bAV normalisation across baseline, what-ifs, and snapshots, and no longer imports the shared recommender offer helper.

Removed the load-path assertions for conversion subtraction, employer-field re-derivation, and repair idempotence. The new regression first failed with €200 instead of €400; it now pins that an activated recommender bAV loads unchanged at €400 while its snapshot's offered bAV is normalised to zero. Existing offer-normalisation tests remain.

## Validation

- `npm run verify`: lint clean (`--max-warnings=0`); 276 frontend test files, 5208 passed + 1 skipped; both Worker typechecks passed; Worker suites passed (26 + 11 tests); production build and prerender succeeded.
- All 121 tests across storage load paths, the recommender, and bAV candidate generation pass.
- No oracle or baseline updates. Generated `public/og/` output discarded. No GitHub access or push.

## Not done

- Legacy recommender what-ifs saved between PR #347 and this fix keep their stored conversion. The original employer cap and modal offer terms were not persisted, so automatic repair would be lossy; users regenerate the alternative by applying the recommendation again on the repaired baseline.
- The dedicated “Angebot erfassen” UX remains deferred.

Activation does not restore a previous conversion: the user enters the real amount. Engine calculations, statutory rules, and rounding are unchanged.

Refs #349
