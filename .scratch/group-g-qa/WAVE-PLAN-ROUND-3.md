# Group G QA Round 3 — Earlier QA items (#19–#24)

6 QA items filed before the Round-2 external review. All wait until Round-2 is fully merged to `main` — several depend on Round-2 fixes (#22 on #25, #24 on #27+#28) and others share files with Round-2 work (#21 on #36, #19/#23 on `App.tsx` combine branch).

**Models:** Sonnet for everything except #20 (Opus — scoped redesign with product-design judgement). Reviewers always Opus.

---

## Single wave — parallel after Round-2 merged (6 agents)

All independent of each other once Round-2 has landed. Dispatch concurrently.

| Agent | Issue | Title | Model | Primary files |
|-------|-------|-------|-------|---------------|
| W3-A | [#19](issues/19-cannot-add-new-vertraege-after-onboarding.md) | Add "Vertrag hinzufügen" affordance to combine dashboard | Sonnet | `src/App.tsx` (combine branch), `src/app/portfolioState.ts`, reuse step components from `src/features/inventory/` |
| W3-B | [#20](issues/20-vergleich-overview-confusing-needs-dashboard.md) | Vergleich overview → dashboard with Rentenlücke + "Mehr sparen" CTA | **Opus** | `src/App.tsx` (compare branch overview region), new `src/features/dashboard/` component(s), `simulationSelectors.ts` for figures. New target-retirement-income state on `CalcAssumptions` (or workspace) with sensible default. |
| W3-C | [#21](issues/21-personal-details-step-ui-incoherent.md) | Personal-details step UI matches rest of wizard | Sonnet | `src/features/inventory/InventoryWizard.tsx` PersonalDetailsStep + co-located CSS. Reuse `<NumberField>` and existing form-row primitives. |
| W3-D | [#22](issues/22-eigenes-szenario-only-works-in-vergleich.md) | Verify "eigenes Szenario" works in Mein Plan | Sonnet | Verify after Round-2 #25 — likely already fixed. If covered, mark done with a regression test pinning custom-scenario propagation through `simulatePortfolio`. If not, finish the propagation. |
| W3-E | [#23](issues/23-assumptions-for-unfilled-products-not-visible.md) | Provenance for unfilled product cards | Sonnet | `src/features/inputs/InputsPanel.tsx`, comparison-card components, `src/features/results/provenance.tsx`. Add "uses defaults" signal + "Werte eingeben" affordance + summary of current defaults on each empty product card. |
| W3-F | [#24](issues/24-details-and-export-tab-empty-in-mein-plan.md) | Audit details/export parity in Mein Plan | Sonnet | Verify after Round-2 #27 + #28 — likely largely fixed. If parity gaps remain (per-instance breakdowns, CSV instance rows, PDF sections), close them. |

---

## Notes

- **#22 and #24 are verification-leaning agents.** Their issue files describe the original bugs; Round-2 #25/#27/#28 directly address the same surfaces. Brief these agents to **first verify the bug is gone**, then either close the issue with a regression test or finish whatever remains. Don't dispatch them blindly to "implement" — they may have nothing left to do beyond the regression test.
- **#20 is the only Opus pick** in this round. Reasoning: it's a designed feature (new visualization, new CTA, new copy, new state for target retirement income), not a bug fix. Needs product-design judgement on layout and copy that benefits from Opus. Spec the target-income default explicitly in the prompt (suggest `assumptions.salary.gross × 0.5` as a starting point) so the agent doesn't re-decide it.
- **#19 and #20 both create dashboard surfaces** but in different modes (combine vs. compare) — no file collision in the new code; possible minor collision in `App.tsx` mode-branch JSX. Resolve in merge order.
- **#21 must run after Round-2 #36 merges** since both touch the same component. Round-2 surfaces validation errors; #21 restyles the step. If Round-2 #36 leaves the layout broken in any way, #21's agent should fix that as part of its scope.

---

## Done criteria

- All 6 issues green on `main`; `Status:` line updated to `done` (or `wontfix` for #22/#24 if Round-2 fully covered them — note the regression test in the issue's Comments section).
- The Vergleich overview from #20 reads as a dashboard, not a sparse summary, and the Rentenlücke is the headline figure.
