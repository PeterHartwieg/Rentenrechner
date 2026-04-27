# Rentenrechner Implementation Backlog

## Priority Legend

- `P0`: Required before the calculator should be treated as decision-support.
- `P1`: Important for a credible personal v1.
- `P2`: Useful for usability, publishing, or broader audiences.
- `P3`: Later expansion.

---

## Done

- **#17** GKV Zusatzbeitrag default → 2.9 %
- **#18** PV cliff fix — `max(0, gross − Freibetrag)` in `netBavPayout` (superseded by **#32**: PV needs Freigrenze, not KV Freibetrag)
- **#19** bAV lump-sum hidden until 1/120 KV/PV spreading is modeled
- **#20** ETF saver-allowance: lump-sum uses no Sparerpauschbetrag; payout applies 1 000 EUR/yr
- **#21** Explicit `insurance-tax-free` branch in `simulate.ts`
- **#22** `careEmployeeBaseRate` rule field + `careEmployeeRateForChildren` helper; magic 0.018 removed
- **#23** `topTaxStart` corrected to 277 826
- **#24** `retirementHealthAllowanceMonthly` renamed to `kvFreibetragVersorgungMonthly` with §226 SGB V comment (KV only; see **#32**)
- **#26** `retirementEndAge` number input ("Kapitalverzehr bis")
- **#30** Age/retirement-age clamping (invalid combinations not reachable via inputs)
- **#29** Dead fields removed: `monthlyInvestment`, `monthlyPremium`, `contributionMode`, `PrivateContributionMode`
- **#3** Berechnungshinweise warnings panel (implementiert / vereinfacht / nicht modelliert)
- **#2** Jahres-Cashflows audit table (per-year user cost, contribution, employer share, fees, capital, real capital)
- **#1** Initial BMF PAP 2026 Vorsorgepauschale implementation; `SalaryResult.vorsorgepauschale` field; tests at 50 k / 75 k / 100 k and bAV conversions 100 / 300 / 500 EUR/month (superseded by **#33**: §39b EStG 2026 includes more detail)
- **#4** bAV contribution limits: two-pass computation applies §3 Nr. 63 EStG (8 % BBG) and §1 SvEV (4 % BBG) to total bAV (employee + employer); `BavFundingResult` exposes overflow fields; UI shows classification
- **#27** ETF partial-exemption selector — InvStG §20 fund categories in input panel
- **#28** Insurance steuerfrei tooltip explaining §20 Abs. 1 Nr. 6 EStG / Halbeinkünfteverfahren condition
- **#7** ETF Vorabpauschale + annual Sparerpauschbetrag: InvStG §18 annual tax drag; initial Basiszins 2,53%; gross VP reduces exit gain (§19 InvStG); Sparerpauschbetrag 1.000 EUR applied in accumulation + payout (superseded by **#31** and **#36**)
- **#9** bAV waterfall: Bruttoumwandlung → −Steuerersparnis → −SV-Ersparnis → =Nettoaufwand → +AG-Zuschuss → =Monatlicher Beitrag; displayed as inline panel in sidebar
- **#11** localStorage persistence: state saved to `rentenrechner-state-v1`; restored on reload; Reset button in sidebar heading restores defaults

---

## April 2026 Legal / Implementation Review

Added 2026-04-27 after checking the implementation, design file, current backlog, and official legal/rate sources available in April 2026.

Primary sources checked:
- BMF basiszins for InvStG §18 Vorabpauschale 2026: https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.html
- BMF Vorsorgepauschale from 2026 / §39b EStG: https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Lohnsteuer/2025-08-14-vorsorgepau-lohnsteuerabzugsverfahren.html and https://www.gesetze-im-internet.de/estg/__39b.html
- 2026 income-tax tariff: https://www.gesetze-im-internet.de/estg/__32a.html
- 2026 GKV rates and BBG: https://www.bundesgesundheitsministerium.de/beitraege
- 2026 social-security thresholds: https://www.bundesregierung.de/breg-de/aktuelles/beitragsgemessungsgrenzen-2386514
- 2026 Pflegeversicherung rates and Bezugsgröße: https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung/finanzierung
- bAV entitlement/subsidy/tax rules: https://www.gesetze-im-internet.de/betravg/__1a.html and https://www.gesetze-im-internet.de/estg/__3.html
- ETF tax basis and partial exemptions: https://www.gesetze-im-internet.de/invstg_2018/__18.html, https://www.gesetze-im-internet.de/invstg_2018/__19.html, https://www.gesetze-im-internet.de/invstg_2018/__20.html
- Private insurance tax: https://www.gesetze-im-internet.de/estg/__20.html and https://www.gesetze-im-internet.de/estg/__52.html

### P0: Correctness Blockers

#### 31. Update ETF Basiszins to the Official 2026 Value

`src/rules/de2026.ts` still uses `basiszins: 0.0253` and UI text calls it a 2026 estimate. The BMF published the official basiszins for the 2026 Vorabpauschale on 2026-01-13: **3.20 %**.

**Target:** update `de2026Rules.capitalGains.basiszins` to `0.032`, update comments/UI text, and add a test that fails if the 2026 rule value regresses.

**Acceptance criteria:**
- Rule value is `0.032`.
- Berechnungshinweise no longer say "Schätzwert 2026" or 2.53 %.
- Test covers the official 2026 basiszins and a basic Vorabpauschale calculation.

---

#### 32. Correct bAV Retirement KV/PV Contribution Base

`netBavPayout` subtracts `kvFreibetragVersorgungMonthly` from both health and care bases. The 2026 Betriebsrentenfreibetrag applies to statutory health-insurance contributions; Pflegeversicherung still uses the threshold/Freigrenze behavior and has no equivalent Freibetrag. The current test around `netBavPayout` asserts the wrong legal model.

**Target:** split the retirement health and care contribution bases:
- KV: apply the 1/20 Bezugsgröße Freibetrag to qualifying bAV/Versorgungsbezüge.
- PV: if the relevant Versorgungsbezüge are at or below the threshold, no PV; if above it, PV applies to the full relevant amount.
- Keep room for aggregation with other Versorgungsbezüge in **#6**.

**Acceptance criteria:**
- Tests cover below/equal/above the 197.75 EUR 2026 threshold for both KV and PV.
- Existing test "applies the same KV Freibetrag base to bAV health and care deductions" is removed/replaced.
- UI wording stops referring to a "Pflege-Freibetrag §226 SGB V".

---

#### 33. Rework the 2026 Vorsorgepauschale to Match §39b EStG

The code currently sets `vorsorgepauschale = social.pension + social.health + social.care` and explicitly excludes Arbeitslosenversicherung. Under §39b EStG from 2026, the Vorsorgepauschale has separate Teilbeträge for RV, GKV, PV, private KV/PV, and AV. The AV Teilbetrag is included for Steuerklassen I-V only to the extent that AV plus KV/PV/private Teilbeträge do not exceed 1,900 EUR. The GKV Teilbetrag uses the ermäßigten Beitragssatz plus Zusatzbeitrag, not the full 14.6 % Krankengeld rate.

**Target:** implement a dedicated `calculateVorsorgepauschale2026` helper instead of reusing actual social contributions.

**Acceptance criteria:**
- Uses steuerlicher Arbeitslohn and each applicable Beitragsbemessungsgrenze per §39b.
- RV Teilbetrag = typified employee share (50 % of general RV contribution).
- GKV Teilbetrag uses ermäßigter Beitragssatz + Zusatzbeitrag.
- PV Teilbetrag uses current childless/children logic.
- AV Teilbetrag is included/capped according to the 1,900 EUR rule.
- Handles public and private health-insurance profiles explicitly.
- Tests include low-income cases where AV is partly or fully included, default 75k where AV is capped out, and bAV conversion cases where taxable wage and SV wage differ.

---

### P1: Accuracy Gaps

#### 34. Make bAV Employer Subsidy / Limit Handling Converge

`calculateBavFunding` uses an approximate employer contribution to allocate the 4 % / 8 % BBG limits, then recalculates the final statutory subsidy. Near the 4 % SV-free limit, the final subsidy can differ from the value used to compute `effectiveSvFreeConversion`.

**Target:** solve the bAV funding waterfall as a fixed point or deterministic iteration so salary, statutory subsidy, total bAV contribution, and tax/SV-free portions reconcile.

**Acceptance criteria:**
- Tests around 500 EUR/month conversion and high extra employer matches show no mismatch between final employer contribution and effective tax/SV-free conversion.
- `BavFundingResult` exposes values derived from the final contribution state only.

---

#### 35. Turn Profile Flags Into Real Legal Inputs

`PersonalProfile` contains `churchTax`, `publicHealthInsurance`, and `children`, but the UI still hard-codes "Klasse I, keine Kinder, keine Kirchensteuer". The engine only partly honors the fields: children affect employee PV during accumulation, but not bAV retirement PV; church tax is not calculated; PKV mode currently removes GKV/PV contributions instead of modeling private premiums and employer subsidies.

**Target:** either fully wire these fields into UI and calculations or remove/disable them until supported.

**Acceptance criteria:**
- UI exposes live children, church-tax/state, and GKV/PKV inputs or clearly marks them unsupported.
- Income tax / capital-gains tax / church tax behavior cannot silently diverge from displayed assumptions.
- PKV mode includes private KV/PV contributions, employer subsidy, and §39b private Vorsorgepauschale handling.

---

#### 36. Improve ETF Vorabpauschale Timing and Future-Year Assumptions

The ETF model applies one static 2026 basiszins to every projection year and only uses the balance at the start of each year. InvStG §18 prorates the Vorabpauschale in the acquisition year; monthly savings during a year should therefore not be completely ignored until the following year.

**Target:** model acquisition-year proration for monthly purchases and make the "2026 basiszins held constant for future projection years" assumption explicit/configurable.

**Acceptance criteria:**
- Tests cover first-year monthly ETF purchases and partial-year acquisition proration.
- UI/source drawer states whether future years reuse 2026 law values or a supplied rule table.

---

#### 37. Track ETF Withdrawal Tax Basis Through the Payout Phase

`netEtfPayout` applies a constant untaxed-gain ratio and a fresh annual Sparerpauschbetrag to the projected payout. This is directionally useful but does not model actual disposal lots, remaining cost basis, already-taxed Vorabpauschalen, or year-by-year allowance usage during capital depletion.

**Target:** add a payout schedule that tracks remaining capital, cost basis, cumulative Vorabpauschale, realised gain, tax, and remaining balance per retirement year.

**Acceptance criteria:**
- Annual payout rows reconcile from retirement capital to zero/end balance.
- Sparerpauschbetrag is applied once per year and visibly consumed.
- After-tax lump sum and monthly payout are both derived from the same tax-basis model.

---

#### 38. Replace Insurance `normal` / `steuerfrei` With Law-Based Contract Modes

The private insurance model treats `normal` like an ETF without Teilfreistellung and `steuerfrei` as fully tax-free. Current law distinguishes old pre-2005 contracts, post-2004 contracts under §20 Abs. 1 Nr. 6 EStG, post-2011 age-62/12-year half-income treatment under §52 EStG, and a 15 % exemption for certain fondsgebundene life-insurance investment income.

**Target:** expand **#8** into concrete contract-date, payout-age, runtime, fund-linked, and payout-form logic.

**Acceptance criteria:**
- Contract start date, insured/payout age, runtime, and capital vs annuity payout determine tax mode.
- Half-income method is explicit and uses personal income tax, not depot-style Abgeltungsteuer.
- Pre-2005 tax-free mode requires the legal eligibility fields instead of a blind toggle.

---

#### 39. Add bAV Entitlement, Minimum, and Tarifvertrag Warnings

The UI lets users enter any bAV conversion amount. BetrAVG §1a gives an entitlement up to 4 % of the general RV BBG and requires at least 1/160 of the Bezugsgröße annually when the claim is exercised; §20 BetrAVG can restrict salary conversion for collectively agreed pay unless a Tarifvertrag allows it.

**Target:** show legal-range warnings rather than silently treating all inputs as equally claimable.

**Acceptance criteria:**
- Inputs below the annual minimum and above the 4 % entitlement threshold show a clear warning.
- Voluntary higher contributions remain possible but are labeled as contract/employer-dependent.
- Optional "tarifgebunden" flag warns that salary conversion may require a collective-agreement basis.

---

#### 40. Harden localStorage Persistence

**#11** is marked done, but `loadSavedState` accepts unknown JSON via type casts and no schema version/migration check. A stale or malformed saved state can silently create impossible assumptions or missing nested fee fields.

**Target:** validate persisted profile/assumption shape and version before use.

**Acceptance criteria:**
- Saved state includes a version field.
- Invalid, partial, or older states fall back to defaults or migrate explicitly.
- Tests cover malformed JSON, missing nested fields, and a future unknown version.

---

## P1: German Product Precision

### 25. Expose Profile Toggles

`PersonalProfile` has `churchTax`, `publicHealthInsurance`, and `children` but the UI hard-codes "Klasse I, keine Kinder, keine Kirchensteuer". The engine reads the live values; the UI can't change them.

**Target:** add toggles/inputs for church tax, public/private health insurance, and number of children; update the Fairness panel to reflect live values.

**Acceptance criteria:** no hard-coded assumption text in the UI that can diverge from what the engine computes.

---

### 5. Statutory Pension Reduction From bAV

Salary conversion reduces pension-insurance contributions, potentially lowering future statutory pension entitlements.

**Target:** optional toggle; when on, estimate lost Rentenpunkte and reduce bAV retirement income accordingly.

**Acceptance criteria:** default off; when on, method and estimated impact visible in UI.

---

### 6. bAV Retirement Phase Detail

Current bAV payout uses simplified income tax without other retirement income, fixed KVdR status, and no lump-sum vs pension choice.

**Target:** configurable retirement income context (statutory pension estimate, KVdR vs voluntary GKV, lump-sum payout option).

**Acceptance criteria:** bAV pension tax includes other taxable retirement income; GKV/PV contribution base is shown.

---

### 8. Insurance Tax and Contract Model

Private insurance is reduced to fee drag + steuerfrei/normal. Too coarse for real German offers.

**Target:** advanced mode with contract start year, runtime, guaranteed annuity factor, surrender value, and half-income method eligibility. Simple steuerfrei/normal mode remains as default.

---

## P1: UX for Decision Support

### 10. Fee Drag Comparison

**Target:** chart showing gross contributions, fees, and ending capital side by side for all three products — makes the fee cost visible.

---

## P2: Publishable Product

- **#12** Source and assumption drawer (legal source links, rule values, last-verified date)
- **#13** CSV export (summary + yearly cashflows)
- **#14** Shareable scenario URL (compressed query parameter)
- **#15** PDF report
- **#16** Input presets (low-cost ETF only; standard/generous bAV; high-cost/old-contract insurance)

---

## P3: Future Expansion

- Riester, Rürup.
- Statutory pension module.
- Monte Carlo simulation.
- Salary growth and contribution escalation.
- Multi-ETF portfolio.
- Bilingual UI / public deployment.

---

## Recommended Implementation Order

1. **#31** Update 2026 ETF Basiszins to 3.20 %.
2. **#32** Correct bAV retirement KV/PV base handling.
3. **#33** Rework the 2026 Vorsorgepauschale helper and tests.
4. **#34** Make bAV employer subsidy / contribution-limit handling converge.
5. **#35 / #25** Turn profile flags into real inputs and remove hard-coded assumption text.
6. **#36 / #37** Finish ETF tax timing and payout-basis tracking.
7. **#5 / #6 / #38** Complete statutory-pension impact, bAV retirement phase, and insurance contract tax detail.
8. **#40 / #12** Harden persistence and add the source/assumption drawer.
9. P2 publishing features.

---

## Remaining Test Gaps

- `calculateSolidarityTax`: Milderungszone transition near `incomeTax = 20 350`.
- `calculateCapitalGainsTax`: all `partialExemption` values from InvStG §20.
- `calculateBavFunding`: SV-savings cap at the 4 %-BBG threshold (~338 EUR/month); tax-free overflow above 8 % BBG.
- `de2026Rules.capitalGains.basiszins`: official 2026 BMF value 3.20 %.
- `netBavPayout`: KV Freibetrag vs PV Freigrenze around 197.75 EUR/month.
- `calculateVorsorgepauschale2026`: low/default/high salary, public/private health insurance, bAV conversion, and AV 1,900 EUR cap cases.
- ETF tax: first-year monthly purchases, acquisition-year Vorabpauschale proration, and payout-phase basis depletion.
- `loadSavedState`: malformed, stale, partial, and future-version localStorage payloads.
- Default-profile end-to-end snapshot: `capitalAtRetirement`, `afterTaxLumpSum`, `netMonthlyPayout` for each product × scenario cell.
