# Rentenrechner Backlog

This file tracks remaining work for accuracy, usability, and future publishing. Completed work is intentionally compact; implementation detail belongs in code, tests, and research notes.

Legal/rules research lives in `LEGAL_REVIEW.md` and `TAX_SOCIAL_SECURITY_2026_RESEARCH.md`. Product-specific research lives in `ETF_RESEARCH.md`, `BAV_RESEARCH.md`, `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md`, `BASISRENTE_RESEARCH.md`, `ALTERSVORSORGEDEPOT_2027_RESEARCH.md`, `RIESTER_RESEARCH.md`, and `GRV_RESEARCH.md`. See `LEGAL_IMPLEMENTATION_AUDIT_2026.md` for the 2026-04-28 legal-vs-implementation audit.

## Priority Legend

- `P0`: Required before results should be treated as decision-support.
- `P1`: Important for a credible personal v1.
- `P2`: Useful for publishing or broader use.
- `P3`: Later expansion.

## Current Focus

**Agent-readability refactor complete.** Future agents should use `AGENTS.md` and `docs/context/*.md` for routing, and run `npm run repo:stats` before large changes when they need a quick file-size/context inventory.

Resume feature work in this order. Each group touches overlapping code paths or creates prerequisites for later groups.

1. **Scenario UX and exports**: saved scenario library and scenario duplication, then `#15`.
2. **Comprehension-first UX pass**: plain-language onboarding, progressive disclosure, explanation surfaces, and decision-focused result summaries.
3. **Retirement-income refinements**: GRV salary growth / Rentenwert indexation, Versorgungswerk / Beamtenpension variants, and Basisrente edge cases.
4. **Later analytical/publishing work**: Monte Carlo, sensitivity heatmap, real estate, cash/bond buffer, bilingual UI, public deployment.

---

## Implementation Groups And Order

### Group B: Investment Allocation Mechanics

Items: `#69`, useful slice of P3 multi-ETF portfolio

Why after the product shell:

- Standarddepot needs allocation/glidepath logic rather than a single annual return.
- A limited multi-sleeve portfolio engine can serve both Standarddepot and later ordinary multi-ETF portfolios.

Suggested order:

1. Implement generic two-sleeve accumulation support for risk/low-risk allocation.
2. Add Standarddepot glidepath and SRI/cost-cap warnings.
3. Generalize only as far as needed for ordinary multi-ETF portfolios later.

Shared code areas: accumulation engine, return scenarios, fee/RIY helpers, product assumptions UI, charts.

### Group D: Scenario UX, Saved Workflows, Reports

Items: useful slice of P3 saved scenario library / duplication, `#15`

Why later:

- Presets and reports are most useful after the product set and retirement-gap model settle.
- Scenario duplication pairs naturally with presets because both touch scenario state and storage.
- PDF/report output should come after calculations and table outputs stop shifting heavily.

Suggested order:

1. Scenario duplication / saved scenario library.
2. ~~`#15` PDF report.~~ ✓

Shared code areas: default scenarios, storage/schema, URL sharing, CSV/report formatting, UI controls.

### Group UX: Comprehension-First Product Experience

Items: `#UX1`-`#UX15`

Why now:

- The calculation engine is already more sophisticated than a typical user expects, but the UI currently asks the user to understand product law, tax abbreviations, and actuarial terms before they can trust the result.
- The left panel exposes many expert controls at once. This is powerful for validation, but it makes a normal user feel the app is harder than the "simple calculator" they expected.
- The result area surfaces correct numbers, but not enough decision framing: what changed the ranking, which assumptions are fragile, and what the user should inspect before acting.

Suggested order:

1. Finish the information architecture work in `#UX9`, `#UX10`, and `#UX11`: the recent UX work added helpful components, but the app still presents too much in one scrolling workspace.
2. Tighten the guided flow with `#UX12` and product-context editing with `#UX13`.
3. Improve result comprehension with `#UX14` and `#UX15`.
4. Keep earlier open items `#UX1`-`#UX6` as design principles / supporting implementation tracks; `#UX7` and `#UX8` are complete.

Shared code areas: `src/App.tsx`, `src/features/inputs/*`, `src/features/results/*`, `src/features/assumptions/*`, `src/app/productPresentation.ts`, `src/ui/*`, print report.

#### #UX1 P1 Plain-Language Mode And Expert Mode

Default the app to a plain-language mode and move legal/product-mechanics controls behind an "Erweitert" disclosure per product.

Concrete changes:

- Keep the initial visible input set to the user's actual situation and one or two product-offer values: age, retirement age, gross salary, health insurance, bAV gross conversion, employer contribution, ETF TER, return scenarios.
- Hide controls such as `Durchfuehrungsweg`, `KVdR`, `Guenstigerpruefung`, `Schicht`, `Ertragsanteil`, detailed fee decomposition, and statutory eligibility toggles behind product-specific advanced sections.
- For each hidden expert section, show a compact derived summary in plain German, e.g. "Der Rechner nimmt an: gesetzlich krankenversichert in der Rente, bAV als Direktversicherung, lebenslange Rente."
- Acceptance criterion: a new user can complete a first comparison without seeing paragraph symbols or statutory abbreviations unless they open an advanced section.

#### #UX2 P1 Terminology Translation Layer

Create a central content layer for user-facing product terms and replace law-first labels with plain labels plus optional legal detail.

Concrete changes:

- Add a `src/content/terms.ts` or similar map with `plainLabel`, `shortHelp`, `legalReference`, and `expertLabel`.
- Replace labels like "bAV Entgeltumwandlung", "Guenstigerpruefung", "Versicherungsmantel", "Kapitalverzehr", "Rentenfaktor", "KVdR", "Schicht 1/2/3" with plain-language labels and short helper text.
- Use law references in expandable "Warum?" or "Rechtsgrundlage" details, not as the primary label.
- Add a glossary drawer or inline term popover that answers "What does this mean for me?" in one sentence before giving the formal term.
- Acceptance criterion: every visible input label can be understood without knowing German retirement/tax terminology.

#### #UX3 P1 Guided First-Run Flow

Add a lightweight guided setup before the full dashboard for users who arrive with the belief that the calculation should be simple.

Concrete changes:

- First screen asks: "Was moechtest du vergleichen?" with choices such as "Ich habe ein bAV-Angebot", "ETF gegen Versicherung vergleichen", "Rentenluecke grob schaetzen", and "Expertenmodus".
- Collect the minimum viable inputs for the chosen path, then drop the user into the dashboard with relevant sections expanded.
- Show a short "Warum mehr als ein Taschenrechner?" explanation after first result: taxes, employer subsidy, health insurance, fees, and payout rules can change the winner.
- Persist a "skip guided setup" preference in localStorage.
- Acceptance criterion: a first-time user reaches an interpretable result in under two minutes without scanning the full input sidebar.

#### #UX4 P1 Decision Summary Above The Charts

Replace the current metric-only opening with a decision-focused summary that explains the current winner and the biggest driver.

Concrete changes:

- Add a top result strip with: "Bestes Ergebnis fuer Kapital", "Beste monatliche Rente", "Groesster Kostentreiber", and "Achtung: Ergebnis kippt wahrscheinlich, wenn ...".
- For each product, surface one plain reason: employer subsidy, high fees, tax deferral, locked capital, health-insurance burden, or guarantee drag.
- Explain when capital and pension rankings disagree, instead of presenting both as equally obvious winners.
- Acceptance criterion: a user can answer "which option looks best, and why?" without opening the detail table.

#### #UX5 P1 Waterfall Explanations For "Surprising" Results

Add visual "where the money goes" explanations for bAV, private insurance, Basisrente/Riester/AVD, and ETF.

Concrete changes:

- Extend the existing bAV waterfall pattern into a reusable component for contribution -> tax/SV relief or allowance -> invested amount -> fees -> taxes/KV/PV -> net payout.
- Add result-side waterfall cards, not only input-side hints, because users look for explanations near the surprising number.
- Highlight which parts are estimates and which are direct consequences of the selected offer.
- Acceptance criterion: when bAV wins or loses, the user can see whether the cause is employer money, taxes, fees, lower GRV, or retirement KV/PV.

#### #UX6 P2 Result Confidence And Assumption Sensitivity

Show which assumptions the current ranking depends on before adding full Monte Carlo or heatmaps.

Concrete changes:

- Add a "Was muesste sich aendern?" panel with simple one-step sensitivity checks: return +/- 1 pp, fees +/- 0.5 pp, employer match 0/15/50%, retirement age +/- 2 years, KVdR on/off.
- Show "robust", "knapp", or "annahmenabhaengig" badges for product rankings.
- Link each badge to the assumption that drives it.
- Acceptance criterion: the app warns users when a small assumption change flips the recommendation.

#### ~~#UX7 P2 Product Offer Entry Forms~~ ✓

Implemented: fee entry mode toggle (Einzelposten / Effektivkosten all-in) in bAV and pAV Erweitert sections; renamed to "Garantierter Rentenfaktor" with default-value hint; optional "Kapital lt. Angebot bei Rentenbeginn" comparison field; "link-btn" to switch from all-in back to Einzelposten. All-in mode zeros other fee components and shows an approximation disclaimer.

#### ~~#UX8 P2 Empty, Error, And Trust States~~ ✓

Implemented: `NumberField` shows an inline `field-warning` recovery hint while the user is typing a value outside the allowed range ("Wert wird auf X angehoben/begrenzt …"), so silent clamps no longer surprise the user. A persistent `.trust-strip` below the topbar carries the "Modellrechnung — keine Anlage-, Steuer- oder Rechtsberatung" copy plus the "Werte mit Stand 2026" sourcing line. The print/PDF report has a new "Hinweise und Grenzen der Rechnung" section with reader-friendly bullets on advice scope, legal vintage, assumption fragility, untracked product features, and uncovered risks. Mobile rules added at `≤760 px`: tightened topbar/trust-strip padding, shrunken chart heights (260 px / 220 px), tighter table cells, and smaller chart legend font. All 453 tests pass.

#### #UX9 P1 Task-Based Workspace Navigation

Replace the single long dashboard with a small set of task-based views. This is the highest-impact remaining UX improvement: current guidance and explanation components are useful, but they are stacked into one view and still create a "control room" feeling.

Concrete changes:

- Add a primary workspace switcher: `Start`, `Vergleich`, `Angebot eingeben`, `Warum?`, `Details & Export`.
- Default first-run and guided users to `Start`, then route them to the relevant task view instead of dropping them into the complete dashboard.
- In `Vergleich`, show only product chips, scenario selector, decision summary, one primary chart, and a compact "next best action".
- Move waterfalls, sensitivity, fee chart, assumptions, cashflows, calculation warnings, CSV/PDF actions, and legal source tables out of the default comparison view.
- Keep a persistent top summary while switching views: selected products, scenario, real/nominal toggle, and current winner.
- Acceptance criterion: the default post-guidance screen fits above the fold on desktop except for the main chart; expert tables are one click away but not visually competing.

#### #UX10 P1 Product-Focused Comparison Mode

Make comparison explicitly about a small set of products, not all products with optional hiding.

Concrete changes:

- Turn product visibility chips into a "Vergleich zusammenstellen" step with a recommended baseline: usually ETF plus one offer/product.
- Limit default comparison to 2-3 products based on the guided path. "Alle Produkte anzeigen" should be an explicit expert action.
- In the input panel, show only the fields for the selected comparison set and collapse unrelated products into an "Weitere Produkte" launcher.
- Add a focused product header for each selected product: purpose, liquidity, tax treatment, and the one input most likely to matter.
- Add empty-state copy when a user hides everything except GRV / no private product: "Waehle mindestens ein Vorsorgeprodukt zum Vergleich."
- Acceptance criterion: a bAV-offer user sees ETF vs. bAV as the main experience, not ETF + bAV + pAV + Basisrente + AVD + Riester plus many charts.

#### #UX11 P1 Results Hierarchy And De-Duplication

Restructure result modules into "What", "Why", and "Details" so the user is not asked to interpret every analytical view at once.

Concrete changes:

- Merge or reorder `DecisionSummary` and `SummaryMetrics`; avoid showing "best capital" and "best pension" twice.
- Use a single primary outcome module: "Was lohnt sich in diesem Szenario?" with a plain recommendation-style sentence and clear caveat.
- Put charts under tabs or segmented controls: `Kapital`, `Monatsrente`, `Kosten`, `Sensitivitaet`.
- Put `ResultWaterfalls` behind "Warum ist das so?" and show only the selected/winning product by default, with compare expansion.
- Move `DetailComparisonTable`, `CashflowTable`, `CalculationWarnings`, and `AssumptionsPanel` into `Details & Export`.
- Acceptance criterion: above the fold contains one decision summary, one chart, and one next step; no tables or warnings panels appear in the primary path unless critical.

#### #UX12 P1 Guided Setup As Persistent Journey

The guided setup is currently a modal that collects a few values and then exits to the full app. Convert it into a persistent journey that continues through interpretation.

Concrete changes:

- After guided setup, show a checklist/stepper: `1 Profil`, `2 Angebot`, `3 Vergleich`, `4 Ergebnis verstehen`, `5 Export`.
- Keep the "Warum mehr als ein Taschenrechner?" message near the result, but make it contextual: show only the factors that actually affected the current result.
- Add "Weiter" / "Zurueck" actions for normal users and "Dashboard anzeigen" for experts.
- If a user enters through "Ich habe ein bAV-Angebot", ask for the offer fields in the same journey instead of requiring the sidebar after the modal closes.
- Acceptance criterion: a non-expert can complete one guided path without needing to understand the full dashboard layout.

#### #UX13 P2 In-Context Product Editing

Move high-impact product inputs closer to the result they affect, instead of keeping all editing in a separate left sidebar.

Concrete changes:

- On each product result card, add an "Annahmen bearbeiten" disclosure for only that product's core inputs.
- For bAV: monthly gross conversion, employer subsidy, rentenfaktor, fee mode. For pAV: contract year, contribution proxy/fair comparison note, rentenfaktor, fee mode. For ETF: TER, fund type, return scenario.
- Preserve the full sidebar for expert editing, but do not make it the only way to adjust a result.
- Add inline "changed from guided/default" markers so users can see which assumptions are custom.
- Acceptance criterion: a user can change the bAV employer match or insurance rentenfaktor while looking at that product's result card.

#### #UX14 P2 Assumption Provenance And Confidence

Explain whether a value came from the user, from a legal rule, from a default, or from a model approximation.

Concrete changes:

- Add small provenance badges: `von dir`, `aus Angebot`, `Standardwert`, `Gesetz 2026`, `Modellannahme`.
- In result summaries, flag outputs based mostly on defaults, e.g. "Rente unsicher: Rentenfaktor ist noch Standardwert."
- Add a "Was habe ich selbst eingegeben?" review panel before export/PDF.
- Show legal-vintage warnings only where they matter, not as a permanent long trust strip competing with the app header.
- Acceptance criterion: users can distinguish their own offer values from hidden assumptions before trusting or exporting the result.

#### #UX15 P2 Plain-Language Microcopy Audit

The terminology layer exists, but many visible labels still use formal product language. Run a second microcopy pass after the layout is simplified.

Concrete changes:

- Replace visible labels like "bAV Entgeltumwandlung", "Vertraglicher AG-Zuschuss", "Kapitalverzehr bis", "ETF-Fondsart (InvStG §20)", and "Sonst. Renteneinkommen" with user-task labels.
- Use formal/legal terms as secondary text, tooltips, or glossary aliases.
- Shorten warning panels and hints; prefer "what this means" before "why the law says so".
- Make product names consistent across navigation, chips, result cards, charts, tables, CSV, and PDF.
- Acceptance criterion: the main path contains no paragraph symbols or unexplained abbreviations; legal references remain available in expert/details views.

### Group E: Retirement-Income Refinements

Items: P3 GRV / Basisrente refinements

Suggested order:

1. ~~Salary growth and Rentenwert indexation for GRV.~~ ✓
2. ~~Versorgungswerk / Beamtenpension variants.~~ ✓
3. ~~Basisrente legal-compliance follow-up from `LEGAL_IMPLEMENTATION_AUDIT_2026.md`: remove/disable non-lifelong `zeitrente`, add KVdR/freiwillig/PKV retirement-health status, and enforce or warn on payout before age 62.~~ ✓

Shared code areas: `src/engine/grv.ts`, `src/engine/basisrente.ts`, retirement tax/KV-PV helpers, profile assumptions UI.

### Group F: Later Expansion

Items: remaining P3 work

Suggested order:

1. Sensitivity heatmap after deterministic products are stable.
2. Monte Carlo after accumulation/payout abstractions settle.
3. Retirement cash / bond buffer after withdrawal planning is clearer.
4. Real estate / owner-occupied housing as a separate household-balance-sheet module.
5. Bilingual UI and public deployment last.

---

## Open P2 Publishing / Product

~~### #15 PDF Report~~
~~Generate a readable comparison report for offline review.~~

---

## Open P3 Expansion

- Monte Carlo simulation.
- ~~Salary growth, contribution escalation, and GRV Rentenwert indexation.~~ ✓ (Wave 14)
- ~~Versorgungswerk / Beamtenpension baseline variants.~~ ✓ (Wave 15)
- Basisrente edge cases: professional-pension-scheme cap reduction and combined freiwillig-GKV cap interaction were implemented in Wave 16, but the 2026-04-28 audit re-opened Basisrente legal compliance for `zeitrente`, KVdR treatment, and age-62 validation.
- Multi-ETF portfolio.
- Sensitivity heatmap.
- ~~Saved scenario library and scenario duplication.~~ ✓
- Real estate / owner-occupied housing module.
- Retirement cash / bond buffer module.
- Bilingual UI.
- Public deployment.

---

## Implemented Archive

Completed items are kept here as a compact index only.

- Core calculation/UI: `#1`-`#7`, `#9`-`#14`, `#17`-`#24`, `#26`-`#40`.
- bAV / retirement tax / KV-PV: `#6`, `#19`, `#32`-`#35`, `#47`, `#48`, `#51`, `#52`, `#54`.
- Storage, URL, CSV, validation, build hygiene: `#13`, `#14`, `#40`-`#43`, `#49`.
- Insurance runtime / negative returns: `#44`, `#45`.
- Retirement tax pipeline: `#46`.
- PKV: `#50`.
- Fee model and diagnostics: `#55`-`#58`.
- Schicht-3 private insurance: `#38`, `#59`, `#60`, `#64`.
- Statutory pension (GRV) baseline: `#72`. Implemented in `src/engine/grv.ts` with manual Renteninformation override and EP-based estimate.
- Basisrente / Ruerup (Schicht 1): `#61`. Implemented in `src/engine/basisrente.ts`; productId `basisrente`.
- Documentation sync: `#53`.
- Altersvorsorgedepot 2027 (`#66`–`#71`): types, 2027 constants in `de2026.ts`, tiered allowances + Günstigerprüfung, Standarddepot glidepath, §22 Nr. 5 payout taxation, payout-age validation, transfer-cost inputs and cap constants. Engine in `src/engine/altersvorsorgedepot.ts`. `#71` Riester-to-AVD transition: `riesterTransferCapital` field on AVD assumptions, `initialCapital` in `projectAccumulation`, dynamic label "Riester-Übertrag" on the AVD product when transfer capital is set.
- Legacy Riester / Altvertrag (`#62`, `#71`): old-law 2026 constants in `de2026.ts`; engine in `src/engine/riester.ts` (§84–§86 EStG allowances, Mindesteigenbeitrag proration, §10a Günstigerprüfung, §22 Nr. 5 net payout, §93 Abs. 2 partial lump sum); productId `riester`; UI section in `src/App.tsx`; schema validation in `src/utils/scenarioSchema.ts`.

- Private insurance lifecycle: `#65` — surrender / paid-up scenario. `InsurancePaidUpScenario` on `ProductResult`; `paidUpAge?` + `surrenderHaircutPct` on `InsuranceAssumptions`; two-phase accumulation in `src/engine/products/insurance.ts`; results panel in assumptions drawer.
- Input presets: `#16` — 5 scenario presets in `src/data/presets.ts` (ETF Nettotarif, bAV Standard, bAV AG-Match 50 %, pAV Hochkosten, pAV Altvertrag). Collapsible `<details>` panel at top of input drawer replaces full assumptions on click.
- Agent-readability refactor: phases 0-11 complete. `App.tsx` is a composition shell; product simulators, validators, metadata, and tests live under `src/engine/products`; domain types are split under `src/domain`; agent routing docs live in `AGENTS.md` and `docs/context/`.
- PDF report (#15): `src/features/results/PrintReport.tsx` + CSS — always-rendered hidden component (`display: none` on screen, `display: block` in `@media print`). Sections: profile summary, GRV/bAV key metrics, return-scenario assumptions, full comparison table (all products × scenarios, basis rows bold). "PDF drucken" button added to `DetailComparisonTable` action bar alongside CSV/link. `window.print()` triggers browser print-to-PDF. App.css `@media print` hides `.topbar` and `.dashboard`. No new dependencies.
- Saved scenario library (Group D step 1): `src/data/scenarioLibrary.ts` (CRUD helpers, `rentenrechner-library-v1` localStorage key), `src/app/useScenarioLibrary.ts` (hook), `src/features/inputs/ScenarioLibraryPanel.tsx` + CSS. Panel in input sidebar: name input → Speichern, list with Laden / Kopie / ✕, inline rename on name click. Count badge on collapsed summary.

Latest documented baseline: 399 tests after the agent-readability refactor.

---

## Legal Review

See `LEGAL_REVIEW.md` for source links, 2026 baseline values, and legal interpretation notes.
