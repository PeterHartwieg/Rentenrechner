# Product Context Map

For each product: simulator, validator, domain types, tests, UI input, engine helpers, and research doc.

## Routing table

| Product | Simulator | Validator | Domain types | Tests | UI input |
|---------|-----------|-----------|--------------|-------|----------|
| ETF-Depot | `src/engine/products/etf.ts` | `etf.validation.ts` | `src/domain/products/etf.ts` | `products/etf.test.ts` | `features/inputs/ProfileInputs.tsx` (inline) |
| bAV | `src/engine/products/bav.ts` | `bav.validation.ts` | `src/domain/products/bav.ts` | `products/bav.test.ts`, `products/bav.payout.test.ts` | `features/inputs/BavInputs.tsx` |
| Private RV (pAV) | `src/engine/products/insurance.ts` | `insurance.validation.ts` | `src/domain/products/insurance.ts` | `products/insurance.test.ts` | `features/inputs/InsuranceInputs.tsx` |
| Basisrente (Rürup) | `src/engine/products/basisrente.ts` | `basisrente.validation.ts` | `src/domain/products/basisrente.ts` | `products/basisrente.test.ts` | `features/inputs/BasisrenteInputs.tsx` |
| Altersvorsorgedepot | `src/engine/products/altersvorsorgedepot.ts` | `altersvorsorgedepot.validation.ts` | `src/domain/products/altersvorsorgedepot.ts` | `products/altersvorsorgedepot.test.ts` | `features/inputs/AltersvorsorgedepotInputs.tsx` |
| Riester (Altvertrag) | `src/engine/products/riester.ts` | `riester.validation.ts` | `src/domain/products/riester.ts` | `products/riester.test.ts` | `features/inputs/RiesterInputs.tsx` |
| GRV (statutory) | *(no product module — computed in SimulationContext)* | — | `src/domain/products/grv.ts` | `simulate.integration.test.ts` | `features/inputs/GRVInputs.tsx` |

## Engine helpers per product

| Product | Key engine file | Key function(s) |
|---------|----------------|-----------------|
| ETF | `src/engine/accumulation.ts`, `src/engine/etfPayout.ts` | `projectAccumulation`, `afterTaxInvestmentCapital`, `etfPayoutSchedule` |
| bAV | `src/engine/salary.ts`, `src/engine/bavPayout.ts` | `calculateBavFunding` (two-pass), `netBavPayout`, `afterTaxBavLumpSum` |
| Private RV | `src/engine/insurancePayout.ts` | `classifyInsuranceMonthlyIncome`, `netInsurancePayout`, `afterTaxInsuranceLumpSum`, `deriveInsuranceTaxMode` |
| Basisrente | `src/engine/basisrente.ts` | `calculateBasisrenteFunding`, `netBasisrentePayout` |
| AVD | `src/engine/altersvorsorgedepot.ts`, `src/engine/certifiedPensionPayout.ts` | `calculateAvdFunding`, payout wrappers |
| Riester | `src/engine/riester.ts`, `src/engine/certifiedPensionPayout.ts` | `calculateRiesterFunding`, payout wrappers |
| GRV | `src/engine/grv.ts` | `projectStatutoryPension` |

## Behavioral scope (one line each)

- **ETF**: Vorabpauschale (InvStG §18); Abgeltungsteuer on gain; partial exemption (InvStG §20); kapitalverzehr payout.
- **bAV**: §3 Nr. 63 EStG salary conversion; §1a BetrAVG employer subsidy; §22 Nr. 5 EStG payout tax; §229 SGB V KV/PV as Versorgungsbezug.
- **Private RV**: Tax mode from contract start year + runtime; monthly income classification shared by both modes via `classifyInsuranceMonthlyIncome` (Ertragsanteil for Leibrente, §22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG); paid-up/surrender scenario.
- **Basisrente**: §10 Abs. 3 EStG Schicht-1 deductible; payout tax = GRV Besteuerungsanteil; capital payout prohibited.
- **AVD**: §10a/AVD Reform 2026 allowances; Standarddepot glidepath; §22 Nr. 5 EStG payout; partial capital option.
- **Riester**: §84–§86 EStG allowances; §10a Günstigerprüfung; §22 Nr. 5 EStG payout; ≤30% partial lump sum (§93 Abs. 2 EStG).
- **GRV**: EP × Rentenwert; §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil; §249a SGB V KVdR half-rate.

## Research sources

| Product | Research doc |
|---------|-------------|
| ETF | `ETF_RESEARCH.md` |
| bAV | `BAV_RESEARCH.md` |
| Private RV | `PRIVATE_RENTENVERSICHERUNG_RESEARCH.md` |
| Basisrente | `BASISRENTE_RESEARCH.md` |
| AVD | `ALTERSVORSORGEDEPOT_2027_RESEARCH.md` |
| Riester | `RIESTER_RESEARCH.md` |
| GRV | `GRV_RESEARCH.md` |
| Tax / legal | `LEGAL_REVIEW.md`, `TAX_SOCIAL_SECURITY_2026_RESEARCH.md`, `LEGAL_IMPLEMENTATION_AUDIT_2026.md` |

## Adding a product

See `src/engine/products/README.md` for the registry-based checklist.

### Existing ETF and private-insurance tax basis

`InstanceCommon.historicalCostBasisEUR` records acquisition costs of the current
ETF holdings or premiums already paid into an insurance contract. It is optional
for old saved workspaces, nonnegative, and may exceed current market value.
`historicalVorabpauschaleEUR` records the ETF holding's previously assessed
Vorabpauschalen before partial exemption, not tax paid; an explicit zero is valid.
The contract editor exposes both inputs with unknown handling. Missing historical
inputs block dependent plan net results through `selectResultReadiness`; insurance
Leibrente (Ertragsanteil) and tax-free old-contract capital payouts do not need
premium basis for monthly results. No basis is inferred from current market value.
The capital policy carries these amounts separately from initial capital and
transfer basis injections. Historical principal feeds tax basis only, never
reported new user contributions. Historical Vorabpauschalen enter the cumulative
credit once, then newly assessed amounts accumulate normally.

The engine's numeric result types retain their existing incomplete-input
placeholders; callers consuming raw `simulatePortfolio` results must also consume
readiness rather than publish a net value from missing historical tax inputs.
The public Simulate API accepts compare-mode inputs, which do not include these
combine-only current holdings. Current-year insurance surrender allocates historical premium basis in the same
proportion as gross contract capital disposed, removes that basis from the source,
and reinvests only proceeds after haircut and tax. Repeated withdrawals consume
remaining capital and basis in source-array order. The target receives a new
basis equal to its after-tax injection, not the source's historical principal.
See [BMF EStH 2025, Anhang 22a I, Rn. 61–64](https://stberh.bundesfinanzministerium.de/esth/2025/B-Anhaenge/Anhang-22a/I/inhalt.html).

Future-dated insurance surrender is explicitly incomplete and blocks dependent
net results. Its tax basis cannot currently be valued consistently for every
return scenario / Monte Carlo path; no separate baseline-return projection is
invented. The raw engine retains its legacy numeric estimate for compatibility, without
claiming forecast-valued basis; readiness prevents publishing that estimate. Current-year surrender and annuity baselines without surrender remain
supported. Applied decision previews check both baseline and applied readiness;
unavailable results carry a null delta and reason through the cache and UI.


Yearly historical-basis outputs use `YearlyProjection.cumulativeTaxBasis`: the
basis at that specific row, after opening principal, transfer injections and
proportional disposals. An absent field means it equals that row's cumulative
new product contributions, preserving old result/fixture compatibility. The
cashflow table and both export projection modes consume this row basis rather
than a final-horizon basis or the new-contribution total alone.

Combine CSV yearly ETF net capital is a hypothetical full liquidation for each
scenario/year. Its allowance is apportioned from the actual row's liquidation
demand (basis and VP credit included), independently of future payout demand.
The caller supplies joint filing explicitly from `workspace.baseline.partner`.
Readiness-blocked CSVs keep dependent yearly net capital and ETF payout gain,
allowance, tax and net cells blank. The remaining-allowance recommendation uses
current accumulation-year taxable VP, excluding historical credits and applying
partial exemption; future payout rows are used only after accumulation ends.


Monthly readiness and capital-tax readiness are distinct. The shared
`capitalTaxReadinessForInstance` uses the same input-status resolution and
insurance tax classifier as monthly readiness, but ignores monthly payout mode:
an Ertragsanteil annuity can show its monthly net while its hypothetical capital
liquidation stays unavailable without historical premiums. Explicit zero basis
is valid; opening zero and tax-free pre-2005 capital need no historical basis.
Combine details and export projection apply this per-metric check. A household
block also hides monthly tax tooltips and dependent break-even notes.
