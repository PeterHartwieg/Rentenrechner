# Orchestrator handoff — Group G QA fixes

You are orchestrating parallel implementation of 18 QA-identified bugs and risks in the **Rentenrechner** codebase (React + TypeScript + Vite, frontend-only). The work is pre-planned into three sequential waves. Within each wave every item is independent and must run in its own git worktree to avoid conflicts.

---

## Repo and verification

Working directory: `C:/Users/Peter/Coding_Projects/Rentenrechner`

After every agent completes, run the standard verify pipeline in their worktree before merging:

```bash
npm run verify    # lint + tests + build — must be clean
```

A wave is not done until every item in it passes `npm run verify` and is merged to `main`. Do not start the next wave until the current wave is fully merged.

---

## Issue files

All issue briefs live at `.scratch/group-g-qa/issues/NN-slug.md` in the repo. Read the relevant file before briefing each implementer — it contains diagnosis, affected lines, and fix direction. Do not paraphrase; pass the file content verbatim as part of each agent's brief.

---

## Critical guardrails — tell every implementer

1. **No rounding inside the engine.** Statutory rounding (e.g. `floorEuro`) is surgical and law-driven. Display rounding lives only at `formatCurrency` / `formatPercent` in the render layer.
2. **`calculateRetirementTax` and `calculateMonthlyRetirementPayout` are the single pipelines** for retirement-phase tax and payout math. No implementer may bypass them or duplicate their logic.
3. **`DisclaimerBanner` uses `sessionStorage`, never `localStorage`.** Regressing this is a compliance issue.
4. **`simulatePortfolio` reads `portfolioState.workspace`.** Combine-mode fixes must write to `portfolioState`, not to the singleton `useCalculatorState` state.
5. **`ProductId` is derived from `PRODUCT_REGISTRY`.** Never hardcode the union or add local color/order maps.
6. **Engine code is React-free.** No implementer may import React into any file under `src/engine/`.
7. **`migrateAndValidateState` is the single migrate+validate pipeline.** Any new storage key must be handled through it; do not add ad-hoc parsing elsewhere.

---

## Wave A — Run all in parallel (Sonnet)

8 agents (7 single-issue + 1 two-issue). No prerequisites. Start immediately.

| Agent | Issue(s) | Issue file(s) | Primary files to touch | Notes |
|-------|----------|--------------|------------------------|-------|
| A1 | #04 | `issues/04-number-field-backspace-cannot-delete-zero.md` | `src/ui/NumberField.tsx` | Track raw string state internally; commit to engine value on blur/valid parse only. Do not round in the engine. |
| A2 | #05 | `issues/05-fee-einzelposten-overrides-fondskosten.md` | `src/features/inputs/sections/FeeSection.tsx` | When user edits `fundAssetFee`, residual goes to `wrapperAssetFee` so wrapper+fund = total. Verify Effektivkosten all-in toggle re-derives correctly after the split. |
| A3 | #08 | `issues/08-naechster-euro-scenario-change-no-update.md` | marginal-analysis panel + `src/app/simulationSelectors.ts` | Find where the panel reads the selected scenario; ensure the memo dependency list includes the scenario selector. |
| A4 | #12 | `issues/12-blocker-datenschutz-missing-v2-storage-keys.md` | `src/features/legal/DatenschutzPage.tsx` | Import storage-key constants from `src/storage.ts` and `src/app/useWorkspace.ts` rather than hardcoding strings. |
| A5 | #13 | `issues/13-blocker-rebrand-live-in-public-surfaces.md` | `index.html:7`, `src/App.tsx:487`, `src/features/results/PrintReport.tsx:70+255`, `src/features/legal/LegalLayout.tsx:32`, `src/app/useDerivedViews.ts:130` | The public brand name is not yet decided. Replace the six occurrences with a clearly marked `TODO_BRAND_NAME` placeholder so the rename pass is a single grep. Internal identifiers (npm package, code symbols) stay as-is. |
| A6 | #15 | `issues/15-risk-equal-input-compare-skips-bav-basisrente.md` | `src/engine/equalInputComparator.ts` + the equal-input toggle UI | Audit user-facing copy for "gleicher Beitrag" or equivalent. Scope it explicitly to ETF + pAV. Add an `InfoTip` (see `src/ui/`) next to the toggle naming which products are equalized. No engine logic change. |
| A7 | #16 | `issues/16-risk-transfer-event-ownership-inconsistent.md` | `src/app/contractDecisions.ts:786–831` | Standardise: source instance carries "capital left" event, target instance carries "capital received" event. Apply to both surrender-reinvestment and manual-transfer code paths. |
| A8 | #17 + #18 | `issues/17-risk-stale-sparerpauschbetrag-warning-pinned-by-test.md` and `issues/18-risk-adapter-equivalence-coverage-too-thin.md` | `src/engine/portfolioAdapter.ts`, `src/engine/portfolioAdapter.test.ts` | Do #17 first (fix the misleading test assertion), then #18 (add length-1 equivalence goldens for ETF, pAV, and one certified-pension product). Both issues touch the same test file — do not split across agents. |

---

## Wave B — Run all in parallel (Sonnet)

5 agents. No hard prerequisite on Wave A, but merge Wave A first to reduce conflict surface. Wave B can start as soon as Wave A is complete.

| Agent | Issue(s) | Issue file(s) | Primary files to touch | Notes |
|-------|----------|--------------|------------------------|-------|
| B1 | #01 | `issues/01-onboarding-product-checkbox-unclickable.md` | Onboarding wizard component | Fix hit-target: ensure `<label>` wraps `<input>`, check for overlapping positioned elements. |
| B2 | #02 | `issues/02-onboarding-etf-not-a-vertrag.md` | Onboarding wizard component, `src/content/triggers.ts` | Per-product conditional: hide Vertragsbeginn for ETF and use depot/plan copy instead of Vertrag copy. |
| B3 | #03 | `issues/03-onboarding-schaetzung-hint-persists.md` | Provenance/estimation state in onboarding | The onChange handler must clear the `isEstimated` flag alongside updating the value. See `src/features/results/provenance.tsx` for ProvLabel primitives. |
| B4 | #07 | `issues/07-onboarding-inputs-not-persisted.md` | Onboarding wizard → `useCalculatorState` or `portfolioState` | Trace whether the wizard holds its own local state and never calls the global setter, or calls the wrong setter / wrong key. Ensure `migrateAndValidateState` does not drop new fields. |
| B5 | #09 + #10 | `issues/09-blocker-wizard-workspace-lost-on-complete.md` and `issues/10-blocker-clean-slate-guided-setup-writes-singleton.md` | `src/App.tsx:159–204`, `src/App.tsx:546–549`, `src/app/portfolioState.ts` | Fix both together: (1) `onComplete` from `InventoryWizard` must call `usePortfolioState`'s setter with the returned workspace *before* `setMode('combine')`. (2) `GuidedSetup.onApply` in the combine-new path must also write to `portfolioState`, not only to singleton `useCalculatorState`. Getting the ordering wrong causes the stale-default overwrite described in issue #09. |

**Merge conflict warning for B4 + B5:** both touch the state-commit layer. If they conflict, resolve manually — do not auto-squash, since both fixes must land intact.

---

## Wave C — Sequential within wave (mixed models)

Start after Wave B is fully merged. #06 and #11 can run in parallel; #14 must follow #11.

### C1 — #06 (Sonnet)

| | |
|-|-|
| Issue | `issues/06-onboarding-missing-personal-details-section.md` |
| Prerequisite | #07 merged (inputs must persist before adding a new step) |
| Primary files | Onboarding wizard component, `src/content/triggers.ts` |
| Notes | Add a wizard step 0 that collects: birth year, gross annual income, Steuerklasse, optional partner/Ehegattensplitting, target retirement age. Write directly to the corresponding `CalcAssumptions` personal fields via the same setter that #07 established. Do not invent new state shape. |

### C2 — #11 (**Opus**)

| | |
|-|-|
| Issue | `issues/11-blocker-combine-mode-renders-exports-singleton-data.md` |
| Prerequisite | #09 + #10 merged (portfolio state must be wired before the rendering fix is meaningful) |
| Primary files | `src/App.tsx`, `src/features/results/PrintReport.tsx`, `src/app/useDerivedViews.ts` |
| Notes | This is the largest structural change in the batch. Approach: (1) Gate all singleton-compare UI sections (`ComparisonPicker`, `DecisionSummary`, singleton charts/metrics) behind `mode !== 'combine'`. (2) In combine mode, drive charts and metrics from `portfolioState` / `simulatePortfolio` output rather than singleton `assumptions`/simulation. (3) Pass `portfolioResult` to `PrintReport` and the CSV builder when `mode === 'combine'`. Do not break the existing compare-mode path — it must remain byte-identical after this change. Run `npm run verify` and manually verify that (a) compare mode is unchanged, (b) combine mode no longer leaks singleton data into exports. Use Opus for this task. |

### C3 — #14 (**Opus**, after C2 merged)

| | |
|-|-|
| Issue | `issues/14-risk-combine-grv-kv-undermodeled-multi-bav.md` |
| Prerequisite | #11 merged (correct combine pipeline required to verify this fix) |
| Primary files | `src/app/useCombineSimulation.ts:63–107`, `src/app/recommender.ts:397` |
| Notes | Two targeted fixes: (1) GRV reduction: aggregate salary-sacrifice contributions across **all** active bAV instances, not only `bav[0]`. (2) KV/PV retirement health status: read from the workspace's global `retirementHealthStatus` field (matching how `src/engine/simulationContext.ts:256` works), not from `bav[0]?.kvdrMember`. Apply the same correction to `recommender.ts:397`. Add regression tests for a two-bAV workspace and a no-bAV freiwillig workspace. Use Opus for this task. |

---

## Done criteria

The batch is complete when:
- All 18 issues have a passing `npm run verify` on their branch.
- All branches are merged to `main`.
- `npm run verify` is green on `main`.
- The `Status:` line in each `.scratch/group-g-qa/issues/NN-*.md` file is updated to `ready-for-human` (for the two design decisions: #13 brand name and #15 copy scope) or `wontfix`/closed as appropriate.
