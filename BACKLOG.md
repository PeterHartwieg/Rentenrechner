# Rentenrechner Backlog

This file tracks remaining work for accuracy, usability, and future publishing. Completed work is intentionally compact; implementation detail belongs in code, tests, and research notes.

Legal/rules research lives in `LEGAL_REVIEW.md` and `TAX_SOCIAL_SECURITY_2026_RESEARCH.md`. Product-specific research lives in `ETF_RESEARCH.md`, `BAV_RESEARCH.md`, `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md`, `BASISRENTE_RESEARCH.md`, `ALTERSVORSORGEDEPOT_2027_RESEARCH.md`, `RIESTER_RESEARCH.md`, and `GRV_RESEARCH.md`. See `LEGAL_IMPLEMENTATION_AUDIT_2026.md` for the 2026-04-28 legal-vs-implementation audit.

## Priority Legend

- `P0`: Required before results should be treated as decision-support.
- `P1`: Important for a credible personal v1.
- `P2`: Useful for publishing or broader use.
- `P3`: Later expansion.

## Current Focus

**Group UX Tier 1, Tier 2, Tier 3, Tier 4 all shipped (Tier 1 in commit 670af83, Tier 2 in 23d1b88, Tier 3 in 9efaf96, Tier 4 in 2026-04-30).** Future agents should use `AGENTS.md` and `docs/context/*.md` for routing, and run `npm run repo:stats` before large changes when they need a quick file-size/context inventory.

Recommended next pickup, in priority order:

1. **Group F (later analytical/publishing)** — Monte Carlo, sensitivity heatmap, real estate, cash/bond buffer, bilingual UI, public deployment.

Groups B (multi-sleeve allocation), D (saved scenarios + PDF), and E (retirement-income refinements) are complete or have only optional remainders.

---

## Implementation Groups And Order

### Group B: Investment Allocation Mechanics ✓ (mostly)

Standarddepot glidepath shipped as part of AVD; the only open remainder is the P3 multi-ETF portfolio (deferred). No active work.

### Group D: Scenario UX, Saved Workflows, Reports ✓

Saved scenario library and PDF report (`#15`) shipped. No active work.

### Group UX: Comprehension-First Product Experience

The original `#UX1`–`#UX15` items have all shipped. See "Implemented Archive — UX" below for the index. The 2026-04-30 UX audit (commit 670af83) walked the app as a non-technical user and surfaced a second wave of improvements, organised below by tier.

Shared code areas: `src/App.tsx`, `src/features/inputs/*`, `src/features/results/*`, `src/features/workspace/*`, `src/features/guidance/*`, `src/features/assumptions/*`, `src/ui/*`.

#### Tier 1 — shipped (commit 670af83, 2026-04-30)

Plain-language pass + InfoTip primitive. Highlights:

- `rentengap` guided path defaults to `['etf', 'bav']` instead of all six products.
- Product display labels lost their `Schicht 1/2/3` parentheticals; bAV expanded to "Betriebliche Altersvorsorge (bAV)"; chips read `Private Rente`, `Rürup`, `AV-Depot`, `Riester`.
- `src/content/productFocus.ts` rewritten to lead with the user task instead of the legal classification.
- New `src/ui/InfoTip.tsx` primitive (click-to-open popover with click-outside / Esc dismissal, mobile-aware positioning); wired in `ProductEditCards` for *Netto-Rente*, *Effektivkosten*, *Rentenfaktor*, *Fondstyp (Teilfreistellung)*. `NumberField` gains optional `labelSuffix?: ReactNode`.
- 457 tests, build clean, verified live.

#### Tier 2 — layout density and view dedup ✓ (shipped 2026-04-30)

Goal: a non-technical user reaches the decision summary in under one screen of scroll on desktop and under two on mobile.

- ~~**Merge `Start` → `Vergleich`**~~ ✓ Five tabs reduced to four (`Vergleich` / `Einstellungen` / `Warum?` / `Details & Export`); the Start tab's action cards live on as a slim `StartActionsToolbar` at the top of `Vergleich`. `useWorkspace` no longer takes a `firstRun` option (everyone lands on `vergleich`).
- ~~**Trim `JourneyStepper` on mobile**~~ ✓ Was 271 px on 375 px-wide viewport; now 63 px. Step pills hidden on mobile; single status line ("Schritt N von 4 · Label") with compact `Zurück` / `Weiter` / `✕` buttons. Desktop keeps the full pill row.
- ~~**Move "Warum mehr als ein Taschenrechner?" behind a one-line link**~~ ✓ `GuidedSetupPostHint` is now a click-to-expand banner. Collapsed: ~46 px desktop / ~82 px mobile (was 222 / 719). Trigger shows title + relevant-effect count; click reveals the bullet list.
- ~~**Reconcile numbers across views**~~ ✓ `ResultWaterfall` header now shows both `Kapital brutto` (matches the chart) and `nach Steuer-Lump` (matches the DecisionSummary headline). DecisionSummary headline relabelled `Bestes Kapital nach Steuern` for clarity.
- ~~**Trim `DecisionSummary` product-reason cards**~~ ✓ Already filtered — `selectedResults` flows through `useSimulationViewModel` and is filtered to `assumptions.visibleProducts`. Verified during Tier 2 audit.
- ~~**Topbar height on mobile**~~ ✓ 174 px → 53 px. Eyebrow paragraph hidden, title set to `nowrap` with ellipsis, Help button collapsed to icon-only on mobile.

#### Tier 3 — personalisation ✓ (shipped 2026-04-30)

- ~~**Personal sensitivity caveat**~~ ✓ `runSensitivity` is now lifted to `App.tsx` and memoized; both `DecisionSummary` and `SensitivityPanel` consume the same result. New `personalSensitivityCaveat` in `decisionLogic.ts` returns one of `robust` / `flips` / `volatile` / `insufficient`. The static "Hebel mit grösstem Einfluss…" line is gone — the callout now reads e.g. *"Stabil: Keiner der getesteten Hebel ändert den Sieger."* or *"Diese Hebel kippen den Sieger: → Wenn die Rendite 1 pp niedriger ausfällt → gewinnt „ETF-Depot"."*
- ~~**Wunschnetto on the Rentenlücke path**~~ ✓ New optional `desiredNetMonthlyPension` field on `PersonalProfile` (default 0; 0 = "no target"). Captured by the rentengap path's "Was möchtest du im Monat haben? (optional)" input. When set, `DecisionSummary` renders a Lücke callout: `Wunsch − GRV-Netto = Lücke`, plus a per-visible-product gap-fill list ("ETF deckt 120 % der Lücke", "bAV füllt 90 %"). Storage gotcha: `mergeDeep` cannot round-trip an `undefined` default (typeof mismatch), so we use `0` as the sentinel.
- ~~**Replace "Aktuelle Entgeltpunkte" guided question**~~ ✓ rentengap path now asks "Wie viele Jahre arbeitest du schon?" with a live-derived "≈ N,N Entgeltpunkte (geschätzt)" hint. `estimateEpFromYears(years, salary)` uses the same `min(salary, BBG) / durchschnittsentgelt` formula the engine uses for future EP, so the back-calculation matches the projection logic. Reopening the wizard reverse-engineers years from existing EP via `estimateYearsFromEp`.

#### Tier 4 — polish ✓ (shipped 2026-04-30)

- ~~**One progressive-disclosure pattern, applied consistently**~~ ✓ Unified base styles (`.disclosure-section`, `.disclosure-toggle`, `.disclosure-recap`, `.disclosure-content`) defined once in `src/ui/forms.css` (sharing selectors with the legacy `.erweitert-section` so per-product blocks keep working). `GlossaryPanel`, `ScenarioPresetPanel`, `ScenarioLibraryPanel` now use the unified class on their root `<details>` and added a derived recap (`{N} Begriffe`, `{N} Vorlagen`, `{N} gespeichert` / `leer`). `AssumptionsPanel` converted from button-toggle (`▲/▼`) to `<details>` with `Regelwerte & Quellen 2026 · BMF · DRV · GKV-SV` summary; the controlled `show`/`onToggle` props are preserved via `<details open={show} onToggle={…}>`.
- ~~**Inline glossary tooltips on more terms**~~ ✓ New `vorabpauschale` term added to `src/content/terms.ts` (was missing). `InfoTip` wired on: Vorabpauschale (AssumptionsPanel `Basiszins 2026 (Vorabpauschale)`), Halbeinkünfte (InsuranceInputs Vertragsbeginn `labelSuffix`, conditional on `insuranceTaxMode === 'halbeinkuenfte'`), KVdR (BavInputs `Pflichtversicherter Rentner (KVdR)` + BasisrenteInputs `Krankenversicherung in Rente`), Durchführungsweg (BavInputs `bAV-Vertragsart` label), Versorgungsfreibetrag (new short field-hint at the top of bAV-Rentenphase erweitert subsection). Verified click on `<button>`-wrapped InfoTip inside `<label>` does NOT toggle the underlying checkbox.
- ~~**Disclaimer wrap UX on mobile**~~ ✓ `.disclaimer-dismiss` ✕ now has `min-width: 32px; min-height: 32px` on mobile (≥ Apple HIG 32px touch-target floor); `.disclaimer-popup` switches from `left: 24px; max-width: 420px` to `left: 8px; right: 8px; max-width: none` on mobile so it fits a 375px viewport without horizontal overflow. Verified: popup renders at x=8, width=359 within the 375px viewport.

#### Implemented Archive — UX

Per-item detail lives in commit messages. Listed here as a compact index.

- ~~#UX1 Plain-Language Mode and Expert Mode~~ ✓
- ~~#UX2 Terminology Translation Layer~~ ✓ (`src/content/terms.ts`, `GlossaryPanel`)
- ~~#UX3 Guided First-Run Flow~~ ✓ (`useGuidedSetup`, `GuidedSetup`)
- ~~#UX4 Decision Summary Above the Charts~~ ✓ (commit cffd6a4)
- ~~#UX5 Waterfall Explanations for Surprising Results~~ ✓ (commit 9e7dec8)
- ~~#UX6 Result Confidence and Assumption Sensitivity~~ ✓ (commit 9e7dec8, `sensitivity.ts`)
- ~~#UX7 Product Offer Entry Forms~~ ✓
- ~~#UX8 Empty, Error, and Trust States~~ ✓
- ~~#UX9 Task-Based Workspace Navigation~~ ✓ (commit 51a6ef7)
- ~~#UX10 Product-Focused Comparison Mode~~ ✓ (commit 5cdf6db)
- ~~#UX11 Results Hierarchy and De-Duplication~~ ✓ (commit 6b31298)
- ~~#UX12 Guided Setup as Persistent Journey~~ ✓ (commit 6b31298)
- ~~#UX13 In-Context Product Editing~~ ✓ (commit 670af83)
- ~~#UX14 Assumption Provenance and Confidence~~ ✓ (commit 670af83)
- ~~#UX15 Plain-Language Microcopy Audit~~ ✓ (commit aa81394)
- ~~Tier 4 polish~~ ✓ (2026-04-30) — unified disclosure pattern (`.disclosure-section` + recap line), 5 inline glossary InfoTips (Vorabpauschale/Halbeinkünfte/KVdR/Versorgungsfreibetrag/Durchführungsweg), mobile disclaimer ✕ touch-target and full-width popup.

### Group E: Retirement-Income Refinements ✓

GRV salary growth + Rentenwert indexation, Versorgungswerk / Beamtenpension variants, and the Basisrente legal-compliance follow-up from `LEGAL_IMPLEMENTATION_AUDIT_2026.md` are all shipped. No active work.

### Group UX Tier 5: Polish and Input Improvements

Open items from 2026-04-30 review session.

- ~~`P1` **Einstieg-Menü bAV defaults**~~ ✓ (2026-04-30) `defaultAssumptions.bav.monthlyGrossConversion` raised from 300 → 338 (§3 Nr. 63 EStG 4 % BBG cap for 2026). `GuidedSetup` `bav_offer` path now displays a single "AG-Zuschuss (gesamt)" field defaulted to 15 % (incl. statutory §1a Abs. 1a BetrAVG); on apply, anything above 15 % becomes contractual extra and statutory stays on. Snapshot tests + bAV funding cap test updated to reflect the new combined-contribution behavior (statutory subsidy now mildly spills past the 4 % BBG SV cap, surfacing the existing FairnessPanel warning).
- ~~`P2` **Disable scroll when popup/overlay open**~~ ✓ (2026-04-30) `useEffect` in `useGuidedSetup.ts` sets `document.body.style.overflow = 'hidden'` while `showOverlay` is true.
- ~~`P2` **Tooltip sort order**~~ ✓ (2026-04-30) `itemSorter={(item) => -Number(item.value)}` on `CapitalChart` recharts `Tooltip`; sorts highest-to-lowest.
- ~~`P2` **Remove tooltip text below "Vergleich zusammenstellen"**~~ ✓ (2026-04-30) Removed `hint` prop and `<p className="comparison-picker-hint">` from `ComparisonPicker`; also cleaned up call site in `InputsPanel` and dead CSS.
- ~~`P2` **Inflationsbereinigt off by default + move to advanced options**~~ ✓ (2026-04-30) Default changed to `false` in `useSimulationViewModel`; toggle wrapped in `<details class="toolbar-advanced">` in `ScenarioToolbar`.
- ~~`P2` **ETF-TER default for bAV**~~ ✓ (2026-04-30) `fundAssetFee` raised from 0.002 → 0.005 (0.50 % aktiv verwalteter Fonds, total 0.80 % p.a.); golden snapshots updated.
- ~~`P2` **GKV/PKV as radio button**~~ ✓ (2026-04-30) `<select>` replaced by two radio buttons; GKV-Zusatzbeitrag field hidden when PKV is selected.
- ~~`P2` **Flat AG top-up amount for bAV**~~ ✓ `contractualFixedMonthly` field already present in `BavAssumptions` and `BavInputs`; no additional work needed.
- ~~`P2` **Relocate the 3 collapsible menus at top of Eingaben**~~ ✓ (2026-04-30) ScenarioPresetPanel, ScenarioLibraryPanel, GlossaryPanel moved to a "Werkzeuge" section at the bottom of InputsPanel.
- ~~`P2` **"Welche Produkte vergleichst du?" as persistent navigation**~~ ✓ (2026-04-30) ComparisonPicker now rendered at the top of Vergleich, Warum, and Details tabs (in addition to Einstellungen).
- ~~`P2` **Harmonize "Kind zufügen" with other menu/button design**~~ ✓ (2026-04-30) Inline styles replaced with `.child-row`, `.child-label`, `.child-year-input`, `.child-remove-btn`, `.child-add-btn` CSS classes defined in `forms.css`.
- ~~`P2` **Visual separation of global vs product-specific options**~~ ✓ (2026-04-30) "Globale Annahmen" section moved to appear directly after GRV (before any product inputs); a "Produkteinstellungen" section title separates global from per-product blocks; `.input-section-title` style added to `forms.css`.
- ~~`P2` **Modellwert "als korrekt übernehmen" option**~~ ✓ (2026-05-01) New `rentenfaktorConfirmed: boolean` field on each Leibrente product (bAV, pAV, Basisrente, Riester); defaults to `false`. `ProductEditCards.tsx` shows a "✓ Wert stimmt" inline action next to the Rentenfaktor field when it equals the model default; one click flips the badge to "geprüft" (`pec-prov--confirmed` / `arp-badge--confirmed` green styling) and suppresses the orange "Schätzwert"-Hinweis. The action toggles back via "↺ als Schätzwert". `AssumptionReviewPanel` mirrors the kind via a shared `rentenfaktorKind()` helper. Editing the value away from the default takes precedence (badge becomes "von dir") so the flag is harmlessly retained; mergeDeep handles old saved states by defaulting the new boolean to `false`.
- ~~`P3` **Beitragsdynamik for bAV and investments**~~ ✓ (2026-05-02) New `annualContributionGrowthRate: number` field on `EtfAssumptions`, `BavAssumptions`, `InsuranceAssumptions` (default 0). `AccumulationPolicy.contributionGrowth.annualRate` scales each year's contribution by `(1+r)^yearIndex`; `acquisitionCostPct` is computed from the geometric-sum Beitragssumme so Abschlusskosten reflect the full contract horizon. Wired through `BuildProductPolicy` and the three product simulators (etf/bav/insurance, plus the paid-up phase 1 in insurance). UI inputs added under each product's Erweitert section / ETF field grid; validators clamp to 0–10 %. For bAV, §3 Nr. 63 cap and statutory §1a Abs. 1a subsidy are computed from year-1 inputs and held constant (approximation; surfaced as a field-hint).
- ~~`P3` **Leibrente vs. Kapitalverzehr break-even graph**~~ ✓ (2026-05-02) `findLeibrenteCrossovers` in `breakEvenSeries.ts` detects, for each (Leibrente, Kapitalverzehr/Zeitrente) pair of currently-rendered products, the age at which the Leibrente cumulative net payout overtakes the other's. Search horizon (default 120) extends past the chart's visible range so off-frame crossovers still surface. Open-ring `ReferenceDot` marker rendered when crossover ≤ chart horizon; text callout list below the chart frame always shows the crossover age (with "(außerhalb der Grafik)" hint when off-frame). Legend updated.

### Group F: Later Expansion

Items: remaining P3 work

Suggested order:

1. Sensitivity heatmap after deterministic products are stable.
2. Monte Carlo after accumulation/payout abstractions settle.
3. Retirement cash / bond buffer after withdrawal planning is clearer.
4. Real estate / owner-occupied housing as a separate household-balance-sheet module.
5. Bilingual UI and public deployment last.

---

## Open P3 Expansion

- Monte Carlo simulation.
- ~~Salary growth, contribution escalation, and GRV Rentenwert indexation.~~ ✓ (Wave 14)
- ~~Versorgungswerk / Beamtenpension baseline variants.~~ ✓ (Wave 15)
- ~~Basisrente edge cases: professional-pension-scheme cap reduction and combined freiwillig-GKV cap interaction were implemented in Wave 16, but the 2026-04-28 audit re-opened Basisrente legal compliance for `zeitrente`, KVdR treatment, and age-62 validation.~~ ✓ All three audit items closed: `zeitrente` removed (`payoutMode: 'leibrente'` only), `retirementHealthStatus` (`kvdr` / `freiwillig_gkv` / `pkv`) added with KVdR no-deduction path, age-62 floor extracted to `legalConstants.basisrente.minPayoutAge` and surfaced via `validateBasisrentePayoutAge` (used by `BasisrenteInputs.tsx`).
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
- Agent-readability refactor: phases 0-13 complete. `App.tsx` is a composition shell; product simulators, validators, metadata, and tests live under `src/engine/products`; domain types are split under `src/domain`; engine payout/accumulation helpers are split by responsibility; agent routing docs live in `AGENTS.md` and `docs/context/`.
- PDF report (#15): `src/features/results/PrintReport.tsx` + CSS — always-rendered hidden component (`display: none` on screen, `display: block` in `@media print`). Sections: profile summary, GRV/bAV key metrics, return-scenario assumptions, full comparison table (all products × scenarios, basis rows bold). "PDF drucken" button added to `DetailComparisonTable` action bar alongside CSV/link. `window.print()` triggers browser print-to-PDF. App.css `@media print` hides `.topbar` and `.dashboard`. No new dependencies.
- Saved scenario library (Group D step 1): `src/data/scenarioLibrary.ts` (CRUD helpers, `rentenrechner-library-v1` localStorage key), `src/app/useScenarioLibrary.ts` (hook), `src/features/inputs/ScenarioLibraryPanel.tsx` + CSS. Panel in input sidebar: name input → Speichern, list with Laden / Kopie / ✕, inline rename on name click. Count badge on collapsed summary.

- Group UX Tier 1 plain-language pass + UX13 + UX14 (commit 670af83): see `Group UX → Implemented Archive` for the per-item index.

Latest documented baseline: 470 tests after agent-readability refactor phase 13.

---

## Legal Review

See `LEGAL_REVIEW.md` for source links, 2026 baseline values, and legal interpretation notes.
