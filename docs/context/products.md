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
| ETF | `src/engine/projections.ts` | `projectAccumulation`, `afterTaxInvestmentCapital`, `etfPayoutSchedule` |
| bAV | `src/engine/salary.ts` | `calculateBavFunding` (two-pass); `projections.ts`: `netBavPayout`, `afterTaxBavLumpSum` |
| Private RV | `src/engine/projections.ts` | `netInsurancePayout`, `afterTaxInsuranceLumpSum`, `deriveInsuranceTaxMode` |
| Basisrente | `src/engine/basisrente.ts` | `calculateBasisrenteFunding`, `netBasisrentePayout` |
| AVD | `src/engine/altersvorsorgedepot.ts` | `calculateAvdFunding`, payout helpers |
| Riester | `src/engine/riester.ts` | `calculateRiesterFunding`, payout helpers |
| GRV | `src/engine/grv.ts` | `projectStatutoryPension` |

## Behavioral scope (one line each)

- **ETF**: Vorabpauschale (InvStG §18); Abgeltungsteuer on gain; partial exemption (InvStG §20); kapitalverzehr payout.
- **bAV**: §3 Nr. 63 EStG salary conversion; §1a BetrAVG employer subsidy; §22 Nr. 5 EStG payout tax; §229 SGB V KV/PV as Versorgungsbezug.
- **Private RV**: Tax mode from contract start year + runtime; Ertragsanteil for Leibrente (§22 Nr. 1 Satz 3a EStG); paid-up/surrender scenario.
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
