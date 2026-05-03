# 13 — Vintage-detection rules + contract-card badges

Status: needs-triage
Milestone: M3
Plan section: §4 M3.4
PRD capabilities: F18, F23 (Karin), F30 (Inge — P2 persona but vintage detection ships in P1 to support her use case once her trigger lands)
Depends on: 06, 10

## What

Surface contract-vintage privileges that already live in the engine but are invisible to users today. Drives Karin's "behalt deinen 2002 Vertrag" recommendation and Inge's §40b a.F. lump-sum-tax-free callout.

## Scope

Rules to ship — important: each rule must mirror the actual engine tax routing (`deriveInsuranceTaxMode`, `deriveBavLumpSumTaxMode`), not a heuristic.

- `pre_2005_pav_taxfree_capital` — emits when `deriveInsuranceTaxMode(contractStartYear, runtimeYearsAtRetirement, retirementAge)` returns `'pre2005'` (i.e. `contractStartYear < 2005` AND runtime ≥ 12 years at retirement). The capital payout is **fully tax-free** under §52 Abs. 28 EStG a.F. — NOT Halbeinkünfte. Atom context: `instanceId`, `contractStartYear`, `runtimeYearsAtRetirement`. Headline: "Pre-2005-Kapitalauszahlung steuerfrei (§52 Abs. 28 EStG a.F.)".
  - **Caveat in body text:** for Leibrente payouts on the same contract, §22 Nr. 1 Satz 3 a EStG Ertragsanteil applies (already handled by `netInsurancePayout` when `payoutMode === 'leibrente'` — even pre-2005 Leibrente owes Ertragsanteil). The atom should make this clear so users don't conflate "pre-2005 contract" with "pre-2005 Leibrente is tax-free".
- `halbeinkuenfte_pav_eligible` — emits when `deriveInsuranceTaxMode` returns `'halbeinkuenfte'` (i.e. `contractStartYear >= 2005` AND runtime ≥ 12 years AND retirementAge ≥ 62, per `legalConstants.insurance`). Atom: "Halbeinkünfte (halbe Steuer auf Gewinn) bei Kapitalauszahlung — §20 Abs. 1 Nr. 6 EStG".
- `pre_2005_pav_high_garantiezins` — emits when `contractStartYear ≤ 2003` (4 % Höchstrechnungszins era pre-2004 reform). Headline: "Hoher Garantiezins (4 % bis 2024 auf Beiträge)". Informational; combines with the tax-treatment atom for Karin's "behalt deinen 2002 Vertrag" case.
- `bav_40b_alt_eligible` — emits when `bavInstance.durchfuehrungsweg === 'direktversicherung_40b_alt'` AND `pre2005EligibleTaxFree === true` (i.e. the instance carries the explicit flag that § 40b old-law conditions are met — contract concluded before 2005, employer paid contributions tax-free under §40b EStG a.F., user reaches eligible age). Per `deriveBavLumpSumTaxMode`, this routes the lump-sum to `'pre2005_steuerfrei'` (income tax = 0; KV/PV via §229 still applies). Headline: "Pre-2005 §40b-Direktversicherung — Kapitalauszahlung steuerfrei (KV/PV bleibt)". Do NOT fire on a generic `direktversicherung` Durchführungsweg or a year heuristic; the engine's `direktversicherung_40b_alt` enum value is the authoritative signal.
- `bav_40b_alt_conditions_unmet` — emits when `durchfuehrungsweg === 'direktversicherung_40b_alt'` AND `pre2005EligibleTaxFree === false`. Headline: "§40b-Vertrag, aber Bedingungen nicht erfüllt — Lump-sum als Versorgungsbezug" (`'voll_versorgungsbezug'` per the engine).
- `bav_durchfuehrungsweg_direktzusage` — emits when `bavInstance.durchfuehrungsweg === 'direktzusage'` OR `'unterstuetzungskasse'`. Per `deriveBavLumpSumTaxMode`, routes to `'fuenftelregelung'`. Headline: "Lump-sum-Tax-Routing: Fünftelregelung (§34 EStG)" — informational, neither privilege nor caveat.
- `riester_pre_2008_zulage` — emits when `riesterInstance.contractStartYear ≤ 2007` AND `childBirthYears.some(y => y >= 2008)`. The post-2008 Kinderzulage (€300) is only available if the contract is updated to register the child; pre-2008 Riester contracts with newer children may carry only the €185 amount until updated. Headline: "Kinderzulage für nach 2008 geborene Kinder ggf. nicht voll auf altem Riester — Vertragsanpassung prüfen".

UI:

- Each instance card (inventory wizard + dashboard sidebar) renders applicable vintage atoms as colored chips above the Layer 1 fields.
- Chip color: green (privilege, e.g. Halbeinkünfte, §40b), yellow (caveat, e.g. high cost), informational (neutral).
- Click on chip opens a tooltip with the headline and longer explanation pulled from `renderAtom`.
- Recommendation card (issue 12) consumes the same atoms in trade-off labels (e.g. "Plan A behält dein Halbeinkünfte-Privileg auf den 2002-Vertrag").

## Out of scope

- Sensitivity-range computation for "even at 1.5 % p.a. it still wins" (Karin) — defer to follow-up.
- Three-card decision template integration (issue 14).

## Acceptance

- Karin-shape workspace (pAV `contractStartYear: 2002`, runtime to age 65 ≥ 12 years) shows green "Pre-2005-Kapitalauszahlung steuerfrei" chip + green "Hoher Garantiezins" chip on the pAV instance card. Tooltip references §52 Abs. 28 EStG a.F.
- A pAV with `contractStartYear: 2007`, runtime ≥ 12 years, retirementAge ≥ 62 shows the green Halbeinkünfte chip (NOT pre-2005). Tooltip references §20 Abs. 1 Nr. 6 EStG.
- A pAV with `contractStartYear: 2005`, runtime < 12 years OR retirementAge < 62 shows no privilege chip (Abgeltungsteuer applies). The instance card carries the implicit "regular Abgeltungsteuer" treatment without an extra chip.
- Inge-shape workspace (bAV `contractStartYear: 1998`, `durchfuehrungsweg: 'direktversicherung_40b_alt'`, `pre2005EligibleTaxFree: true`) shows the green §40b chip "Pre-2005 §40b-Direktversicherung — Kapitalauszahlung steuerfrei". A bAV with the same year but `durchfuehrungsweg: 'direktversicherung_3_63'` does NOT show the §40b chip.
- Switching `contractStartYear` to 2005 on a pAV removes the pre-2005 chip and shows the Halbeinkünfte chip if the runtime + age tests still pass.
- Tooltip text always references the relevant statute and the engine routing decision (so the user can trust the chip).

## Test plan

- Unit per rule: fires on the right input, doesn't fire on adjacent years.
- Snapshot: chip rendering for Karin / Inge / Bernd workspaces.
- E2E preview: chip + tooltip render correctly on inventory card.
