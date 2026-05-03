# 08 — portfolioCombine engine + cross-instance KV/PV apportionment

Status: needs-triage
Milestone: M2
Plan section: §3 Module map, §4 M2.6
PRD capabilities: F2, F3, S4
Depends on: 03

## What

Add `src/engine/portfolioCombine.ts` that aggregates per-instance `ProductResult[]` into a combined retirement income. The combination runs through the **shared retirement-tax + KV/PV pipeline** — it does NOT just sum per-source net incomes, because:

- **Progressive income tax**: aggregated taxable income hits a higher marginal bracket than any single source in isolation. Per-source net summation under-counts tax.
- **§226(2) SGB V Freibetrag** on Versorgungsbezüge applies once across all sources, not once per source. Per-source net summation over-counts the Freibetrag.
- **§57(1) SGB XI PV Freigrenze** is all-or-nothing on aggregate Versorgungsbezüge.
- **Vorsorgepauschale and Werbungskosten Pauschbeträge** apply once on aggregate.

The combine function rebuilds aggregate `RetirementIncomeComponents`, calls `calculateRetirementTax` once over the aggregate, and `calculateRetirementKvPv` once with the aggregate apportionment. Per-instance net displays are then back-allocated proportionally for UI (with a short note: "Anteil am Gesamt-Netto, nach Aggregat-Steuer + KV/PV").

## Scope

- `combinePortfolio(perInstance, portfolioFunding, ctx) → CombinedResult` function. `CombinedResult` carries:
  - `monthlyNetIncome` (after aggregate tax + KV/PV)
  - `monthlyGrossPayouts` (per source, for the waterfall)
  - `aggregateTax` (single `calculateRetirementTax` call result over aggregated components)
  - `aggregateKvPv` (single `calculateRetirementKvPv` call result over aggregated income)
  - `byInstance: Record<string, { monthlyNet, monthlyGross, taxShare, kvPvShare, ... }>` — per-instance values back-allocated from aggregate.
- Aggregation rules for `RetirementIncomeComponents`:
  - GRV (statutory pension) → `statutoryPensionAnnual`
  - bAV instances (sum across instances) → `bavPensionAnnual` for Leibrente; `bavLumpSum + bavIsLumpSum: true` for Kapitalverzehr/Zeitrente paths.
  - pAV instances (sum) → `privateInsuranceTaxableAnnual` with appropriate `privateInsuranceTaxMode` per-instance — multi-instance with mixed modes (Halbeinkünfte + abgeltungsteuer + pre2005 + ertragsanteil) require splitting into multiple tax-base lines, all consumed by `calculateRetirementTax`. Engine extension may be needed to accept multiple insurance tax-base contributions.
  - Basisrente instances (sum) → `basisrenteTaxableAnnual` (uniform Besteuerungsanteil per cohort).
  - Riester + AVD instances (sum) → `otherTaxableAnnual` (§22 Nr. 5 EStG full marginal).
  - ETF: separate, `Abgeltungsteuer` only (already isolated in current engine).
- KV/PV: aggregate gross retirement income across all sources; apply §226(2) Freibetrag once; apply §57(1) Freigrenze once; apportion across sources proportionally over BBG (existing single-instance behaviour, generalised).
- `useSimulationViewModel` branches: combine-mode reads `combinePortfolio` output; compare-mode keeps today's path.

## Out of scope

- Multi-insurance-tax-mode aggregation engine extension (track as a sub-issue if `calculateRetirementTax` can't currently accept multiple insurance contributions).
- Per-spouse aggregation (P2 / household mode).
- UI/chart updates (issue 12 onwards).

## Acceptance

- Single-instance workspace produces `monthlyNetIncome` **byte-identical to today's pre-Group-G output** (oracle goldens). This is the load-bearing test.
- Bernd-shape baseline (1 GRV + 2 bAV + 1 ETF + 1 Riester) produces an internally consistent `monthlyNetIncome`: aggregate tax + KV/PV pipelines run once over aggregated income; per-instance back-allocation sums to the aggregate within 1ct rounding tolerance.
- High-income retiree (sum gross > monthly KV/PV BBG) sees proportional KV/PV apportionment with the BBG ceiling honoured exactly.
- §226(2) SGB V Freibetrag applies **once** across all Versorgungsbezüge sources, not once per source.
- §57(1) SGB XI PV Freigrenze applies **once**, all-or-nothing, on aggregate Versorgungsbezüge.
- KVdR vs freiwillig switch on the profile flips KV/PV treatment uniformly across all instances.
- Empty baseline (only GRV) returns GRV-only result without errors.

## Test plan

- **Oracle (load-bearing):** single-instance combine result equals today's `simulate.integration.test.ts` snapshots. Run for every existing fixture profile.
- **New combine oracle:** 2-bAV + 1 ETF baseline produces a deterministic combined result with documented expected values (a hand-verified golden, not a sum of compare-mode runs — those would be wrong because each compare-mode run runs aggregate tax in isolation).
- **Why summing standalone runs would fail:** explicit test that demonstrates the divergence — sum of three single-instance compare-mode runs at the same per-source gross UNDER-counts tax (no progressive aggregation) and OVER-counts §226(2) Freibetrag (applied once per run instead of once on aggregate). The combine function corrects both.
- **BBG ceiling:** gross sum of €7,000/Monat (above €5,812.50 BBG) produces apportioned KV/PV equal to BBG cap × healthRate, with each source's contribution proportional to its gross.
- **Mixed insurance tax modes:** 2 pAV instances, one Halbeinkünfte + one Abgeltungsteuer, produce a tax base that respects each instance's tax mode independently and aggregates correctly.
- **Edge:** empty baseline (only GRV) returns GRV-only result without errors.
