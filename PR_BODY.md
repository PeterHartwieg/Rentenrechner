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

## Validation

- `npm run verify`: lint clean (`--max-warnings=0`); 276 frontend test files, 5187 passed + 1 skipped; both Worker typechecks passed; Worker suites passed (26 + 11 tests); production build and prerender succeeded.
- Targeted creation/activation regressions: 6 passed.
- No oracle or baseline updates. Generated `public/og/` output discarded. No GitHub access or push.

## Scope

The dedicated “Angebot erfassen” UX remains deferred. Activation does not restore a previous conversion: the user enters the real amount. Engine calculations, statutory rules, and rounding are unchanged.

Refs #349
