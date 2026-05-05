# Group G QA Round 2 — Parallel implementation waves

13 issues from the second external review (#25–#37). Three sequential waves plus a pre-flight. Within each wave, items are independent unless flagged.

**Models:** Sonnet for everything except #28 (Opus). Reviewers always Opus.

---

## Wave 0 — Pre-flight (do first, blocks everything)

| Issue | Title | Model | Notes |
|-------|-------|-------|-------|
| [#37](issues/37-risk-dirty-dependency-metadata-needs-resolution.md) | Clean dirty deps + restore eslint.cmd | Sonnet | `npm run verify` must be green before any later wave dispatches. May resolve self-side without an agent. |

---

## Wave 1 — Parallel low-collision (7 agents, after Wave 0)

No App.tsx collisions, no inter-dependencies. Dispatch concurrently. **#29 is gated on a brand-name decision from the user — don't dispatch until the name is supplied.**

| Agent | Issue | Title | Model | Primary files |
|-------|-------|-------|-------|---------------|
| W1-A | [#29](issues/29-blocker-todo-brand-name-placeholder-in-launch-surfaces.md) | Replace TODO_BRAND_NAME placeholders | Sonnet | `index.html`, `src/App.tsx:562`, `src/features/results/PrintReport.tsx:100+357`, `src/app/useDerivedViews.ts:141+155`, `README.md:1`, `COMMERCIAL_LICENSE.md:3` |
| W1-B | [#30](issues/30-blocker-landing-page-overclaims-fair-comparison-invariant.md) | Landing page fair-comparison copy | Sonnet | `src/features/landing/LandingPage.tsx:131` |
| W1-C | [#32](issues/32-risk-recommender-confidence-ignores-private-insurance.md) | Add `wsa.insurance` to confidence array | Sonnet | `src/features/dashboard/RecommenderCard.tsx:105–109` + test |
| W1-D | [#34](issues/34-risk-stale-sparerpauschbetrag-comments.md) | Stale Sparerpauschbetrag comments | Sonnet | `src/engine/portfolioCombine.ts:47`, `src/engine/portfolioAdapter.test.ts:11` |
| W1-E | [#36](issues/36-risk-personal-details-validation-fails-silently.md) | Surface personal-details validation errors | Sonnet | `src/features/inventory/InventoryWizard.tsx:116+130` |
| W1-F | [#33](issues/33-risk-byte-identity-tests-assert-cents-closeness.md) | Tighten adapter equivalence tests | Sonnet | `src/engine/portfolioAdapter.test.ts:1974+2029+2087` (extend to Basisrente + Riester) |
| W1-G | [#31](issues/31-risk-legacy-single-sided-transfer-events-half-applied.md) | Single-sided legacy transfer migration | Sonnet | `src/engine/portfolioAdapter.ts:951+978`, test fixture at `:2154`. **Bake migration policy decision into prompt** (see issue's Fix direction); do not let agent re-decide. |

**No file collisions** between W1 issues. #29 and Wave 2 both touch `App.tsx`, but #29's edits are header-string only — different region from Wave 2.

---

## Wave 2a — Combine state boundary, parallel (after Wave 1, 3 agents)

All three touch `App.tsx` combine-mode branch in different sub-areas. Pre-create worktrees manually from current `main` (gotcha #1) and instruct each agent to early-check base SHA.

| Agent | Issue | Title | Model | Primary files |
|-------|-------|-------|-------|---------------|
| W2a-A | [#25](issues/25-blocker-combine-toolbar-mutates-singleton-scenario.md) | Scenario toolbar reads/writes workspace in combine | Sonnet | `src/App.tsx:247+262`, `src/features/workspace/ScenarioToolbar.tsx` |
| W2a-B | [#35](issues/35-risk-guided-setup-post-hint-reads-singleton-in-combine.md) | Post hint sources from combine simulation | Sonnet | `src/App.tsx:307` |
| W2a-C | [#26](issues/26-blocker-combine-share-link-exports-singleton.md) | Disable share link in combine mode | Sonnet | `src/App.tsx:402`, `src/features/results/DetailComparisonTable.tsx:38`. **Orchestrator decision: ship the small fix (hide button) for publication, not v2 portfolio share serialization.** |

Rebase each branch onto main before dispatching reviewers (gotcha #9). Conflict-likely surface: the combine-mode JSX block in `App.tsx`. If two of these conflict, resolve in merge order: #25 → #35 → #26.

---

## Wave 2b — Combine export surfaces (after Wave 2a, 2 agents)

Need 2a's combine-workspace data sources in place. #28 is the largest issue in the batch — dispatch first so it has runway.

| Agent | Issue | Title | Model | Primary files |
|-------|-------|-------|-------|---------------|
| W2b-A | [#28](issues/28-blocker-combine-details-tab-empty-product-table.md) | Build real combine details view | **Opus** | `src/App.tsx:406`, `src/features/results/DetailComparisonTable.tsx` (refactor to accept `PortfolioResult`, or build sibling `CombineDetailView`). Per-instance breakdown for accumulation, payout, fee drag, tax/KV-PV. Reuse `provenance.tsx` primitives. |
| W2b-B | [#27](issues/27-blocker-combine-print-report-uses-singleton-profile-grv.md) | Print report sources combine profile/GRV/scenarios | Sonnet | `src/App.tsx:616`, `src/features/results/PrintReport.tsx:309`, `src/app/useCombineSimulation.ts:74` |

**Disclaimer-first invariant** (CLAUDE.md "Critical guardrails" #1): both must keep the disclaimer as literal first child of `#print-report` and first section of CSV.

---

## Done criteria

- All 13 issues have a passing `npm run verify` on their branch.
- All branches merged to `main`; `npm run verify` green on `main`.
- Each issue file's `Status:` line updated to `done` (or `ready-for-human` for items requiring user follow-up — currently only #29 if the brand name is still TBD at dispatch time).
