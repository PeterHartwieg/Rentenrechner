# Group G QA — Parallel implementation waves

Three sequential waves. Within each wave every item is independent and can run on its own worktree in parallel.

---

## Wave A — Isolated fixes (9 issues, fully parallel)

No shared files, no logical prerequisites. Safe to hand to 9 concurrent agents.

| Issue | Title | Primary file(s) |
|-------|-------|-----------------|
| [#04](issues/04-number-field-backspace-cannot-delete-zero.md) | Backspace can't delete 0 in NumberField | `src/ui/NumberField.tsx` |
| [#05](issues/05-fee-einzelposten-overrides-fondskosten.md) | Einzelposten writes to wrong fee field | `src/features/inputs/sections/FeeSection.tsx` |
| [#08](issues/08-naechster-euro-scenario-change-no-update.md) | nächsten-Euro panel doesn't react to scenario change | marginal-analysis panel + selectors |
| [#12](issues/12-blocker-datenschutz-missing-v2-storage-keys.md) | Datenschutz missing v2 localStorage keys | `src/features/legal/DatenschutzPage.tsx` |
| [#13](issues/13-blocker-rebrand-live-in-public-surfaces.md) | Rebrand "Rentenrechner" in 6 public surfaces | `index.html`, `App.tsx:487`, `PrintReport.tsx:70+255`, `LegalLayout.tsx:32`, `useDerivedViews.ts:130` |
| [#15](issues/15-risk-equal-input-compare-skips-bav-basisrente.md) | Equal-input copy audit + tooltip | `src/engine/equalInputComparator.ts` + UI copy |
| [#16](issues/16-risk-transfer-event-ownership-inconsistent.md) | Transfer-event ownership inconsistency | `src/app/contractDecisions.ts` |
| [#17+#18](issues/17-risk-stale-sparerpauschbetrag-warning-pinned-by-test.md) | Sparerpauschbetrag test + adapter equivalence tests | `src/engine/portfolioAdapter.ts` + `portfolioAdapter.test.ts` |

> **#17 and #18 share `portfolioAdapter.test.ts`** — assign both to one agent to avoid merge conflicts.

---

## Wave B — Onboarding wiring (5 agents, after Wave A lands or independently)

No prerequisite on Wave A. Items are mutually independent but some touch overlapping files — notes below.

| Issue | Title | Primary file(s) | Conflict note |
|-------|-------|-----------------|---------------|
| [#01](issues/01-onboarding-product-checkbox-unclickable.md) | Checkbox click targets broken | onboarding wizard component | — |
| [#02](issues/02-onboarding-etf-not-a-vertrag.md) | ETF Sparplan shown as Vertrag | onboarding copy / conditional rendering | — |
| [#03](issues/03-onboarding-schaetzung-hint-persists.md) | Schätzung hint stays after edit | provenance state in onboarding fields | — |
| [#07](issues/07-onboarding-inputs-not-persisted.md) | Onboarding inputs not saved | onboarding wizard → `useCalculatorState` / `portfolioState` | May overlap with #09+#10 at the state commit layer — resolve conflicts on merge |
| [#09+#10](issues/09-blocker-wizard-workspace-lost-on-complete.md) | Combine-mode state wiring in App.tsx (wizard `onComplete` + `GuidedSetup.onApply`) | `src/App.tsx:159–204`, `src/App.tsx:546–549` | **Two adjacent fixes in one file — assign both to one agent** |

---

## Wave C — Structural combine + engine modeling (after Wave B)

These have hard prerequisites in Wave B.

| Issue | Title | Prerequisite | Primary file(s) |
|-------|-------|-------------|-----------------|
| [#06](issues/06-onboarding-missing-personal-details-section.md) | Add personal-details step to onboarding | #07 (inputs must save first) | onboarding wizard, `src/content/triggers.ts` |
| [#11](issues/11-blocker-combine-mode-renders-exports-singleton-data.md) | Combine mode render/export pipeline uses portfolio data | #09+#10 (state must be wired first) | `src/App.tsx`, `PrintReport.tsx`, `useDerivedViews.ts` |
| [#14](issues/14-risk-combine-grv-kv-undermodeled-multi-bav.md) | GRV + KV from all bAV instances, not just `bav[0]` | #11 (need working combine pipeline to verify) | `src/app/useCombineSimulation.ts`, `src/app/recommender.ts` |

> #06 and #11 are independent of each other within Wave C and can run in parallel. #14 should follow #11.
