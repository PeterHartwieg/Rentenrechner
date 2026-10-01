# Implementation handoff — simplification (9 September 2026)

Branch `codex/fix-comparison-input-reset`, commits after `1786fc2`. Not deployed, not merged.

## What shipped

- Two-step start journey in the reworked `InventoryWizard` (profile, then pension with document / career / years / points / skip paths). Contracts are optional and added afterwards.
- Plan overview (`PlanOverview`) as the default Mein Plan surface: one scoped net total in today's euros, source rows with duration, provenance and contribution, readiness reasons with links, optional depth in disclosures. Payout-duration view (`PlanDurationSummary`).
- Contract picker (`/vorsorge/neu`) and editor (`/vertrag/:id/bearbeiten`) with explicit unknown fields; read-only detail keeps `/vertrag/:id`.
- Independent comparison journey at `/vergleich` (setup + result, selected products only, own-money anchor through the existing sync path, seeding from the plan only on request).
- Alternatives at `/alternativen`: before/after preview from real simulations, saved alternatives that survive reload, rebase on stale, apply with undo, remove with undo.
- State layer: input-status metadata (unknown / assumed / entered / document) at the scenario boundary, union-key `mergeDeep`, readiness and plan-summary selectors, shared workspace store with synchronous write-through and one-level undo, rules-backed EP estimate, export suppression of a blocked household total.

## Model use

- UI packages: Astra (`gpt-6-astra` via `codex exec`; the CLI reported model `gpt-6`).
- Mechanical packages and the source review: Opus 5 subagents (`claude-opus-5[1m]` as reported by each agent).
- Novice reviews: Astra (codex + Playwright MCP, headless) and Fable 5.1 (`claude -p --model claude-fable-5-1`, canonical model `claude-fable-5-1`, Playwright MCP). Both received only the running UI and the task list (`scratchpad/review/novice-task.md`), no source. Reports: `docs/redesign/simplification/reviews/`.

## Verification evidence

- `npm run verify` green on the final tree (lint, 233 test files, worker checks, build + prerender). See the commit messages for per-commit gates.
- Lead browser checks (desktop 1280/1024, phone 390/320): onboarding, unknown-capital contract, readiness gating, edit, alternatives preview/save/reload/apply/undo, remove/undo, comparison setup/result, no horizontal overflow. Production preview (`npm run preview`): `/vergleich` prerendered (200), dynamic routes hydrate from the 404 shell like the pre-existing `/kapital`.
- Opus numeric cross-check: `netMonthlyTotalReal = monthlyNetIncome × realDeflator`, rows sum to `monthlyNetIncome` within 0.00.

## Known limitations

- The app has no dark theme; new components use tokens only (pre-existing).
- Readiness: any contract without confirmed fees is `estimated`; `available` is rarely reachable.
- A blocked household total suppresses all row amounts (policy); the reviews found this surprising, an explanatory line was added.
- Comparison shows nominal amounts, the plan shows today's euros; both are labelled, not unified.
- `employment` is not persisted (reconstructed from the pension baseline type); provenance for Versorgungswerk contributions and retirement health status is not carried.
- Unknown saved-only keys now survive `mergeDeep` and are re-persisted (validators reject values, not keys).
- Share links (`?s=`) stay compare-only; the plan surface has no copy-link.
- Dev server returns 404 for direct loads of non-root paths (pre-existing; production serves prerendered/fallback HTML).
- Astra's `npx tsc --noEmit` checks were no-ops in this repo (root tsconfig has no files); `tsc -b` was run by the lead and Opus agents before each commit.

## Final surface sweep (Astra, Playwright, all routes)

Report: `docs/redesign/simplification/reviews/final-surface-sweep.md`. Every route rendered with an H1; no JavaScript errors, no missing assets; all six product editors, persistence after reload, alternatives, comparison with 0/1/2/6 products, exports and share link worked. Findings F1–F8 were fixed in commit "Fix final-sweep findings" (compare-only visitors saw a plan built from migration-derived instances; `/vergleich/details` and `/kapital` lost the comparison context; legacy product page removal had no undo; false DRV/PDF provenance copy; overflow at 320 px; Recharts mount warning; contradictory limit/return copy; English residues). Finding L (article body links do a full document load, 404 on the Vite dev server only) is a dev-server artefact; the production preview served those pages.

## Re-check after the sweep fixes

Report: `docs/redesign/simplification/reviews/final-surface-recheck.md` (HEAD `ddfc203`). F1a, F1b, F2, F4, F6, F7, F8 confirmed fixed; full smoke (onboarding, ETF, alternative preview/save/apply/undo, comparison) with zero console warnings, errors or page errors. Residuals (footer source footnote, one "realer Median" explanation, 320 px overflow on the contract detail and on `/methode`) fixed in commit `0abaf77`; the lead re-measured `/methode` at 320 px (scrollWidth 320) and the footer no longer names a DRV-Renteninformation.

## Phantom instances from the v1 fallback (found during the lead's final check)

`migrateV1ToV2` synthesises `*-singleton` instances for a compare-only (v1) visitor. They were hidden at render time but still lived in the store, so the first real contract was persisted next to them. `loadInitialWorkspace` now strips migration-derived instances when the source is v1 (`src/app/portfolioState.v1Fallback.test.tsx`).

## Final verification state

HEAD `2e33ba4`, `npm run verify` green (238 test files, 4293 tests). Lead's final browser pass on the dev server: compare-only visitor lands on the not-started plan; onboarding with a v1 key present yields empty instance arrays; adding an ETF yields one instance with a generated id; `/methode` and the contract detail fit at 320 px; charts mount without the Recharts warning; footer no longer names a DRV-Renteninformation. One "Should have a queue" React error was seen once in a long-lived tab that had received many Vite hot updates; it did not recur after a fresh load across plan, alternatives, picker and editor, and the isolated Astra re-check recorded zero console errors. Recommended: one hosting smoke test on the deployed Worker (article body links and share links) before announcing.
