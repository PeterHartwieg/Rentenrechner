# Product Modules

Each product has a self-contained module here. To touch a product, read only its row.

| Product | Simulator | Validator | Domain types | Engine | UI input |
|---------|-----------|-----------|--------------|--------|----------|
| ETF-Depot | `etf.ts` | `etf.validation.ts` | `domain/types.ts` EtfAssumptions | `projections.ts` | `features/inputs/` (inline in ProfileInputs) |
| bAV | `bav.ts` | `bav.validation.ts` | `domain/types.ts` BavAssumptions | `salary.ts` calculateBavFunding | `features/inputs/BavInputs.tsx` |
| Private RV (pAV) | `insurance.ts` | `insurance.validation.ts` | `domain/types.ts` InsuranceAssumptions | `projections.ts` netInsurancePayout | `features/inputs/InsuranceInputs.tsx` |
| Basisrente (Rürup) | `basisrente.ts` | `basisrente.validation.ts` | `domain/types.ts` BasisrenteAssumptions | `engine/basisrente.ts` | `features/inputs/BasisrenteInputs.tsx` |
| Altersvorsorgedepot | `altersvorsorgedepot.ts` | `altersvorsorgedepot.validation.ts` | `domain/types.ts` AltersvorsorgedepotAssumptions | `engine/altersvorsorgedepot.ts` | `features/inputs/AltersvorsorgedepotInputs.tsx` |
| Riester (Altvertrag) | `riester.ts` | `riester.validation.ts` | `domain/types.ts` RiesterAssumptions | `engine/riester.ts` | `features/inputs/RiesterInputs.tsx` |

## Adding a product

1. Create `<product>.ts` — export `metadata` and `simulate(ctx, scenario)`.
2. Create `<product>.validation.ts` — export `validate<Product>(assumptions)`.
3. Add one import + one call in `simulate.ts` → `simulateRetirementComparison`.
4. Add one delegation call in `scenarioSchema.ts` → `validateAssumptions`.
5. Add a row to this table.

## Shared infrastructure

| File | Purpose |
|------|---------|
| `../simulationContext.ts` | `SimulationContext` interface; `buildContext` computes pre-scenario funding results |
| `../buildResult.ts` | `buildProductResult` — runs accumulation + payout/tax pipeline; assembles `ProductResult` |
| `../../domain/validation/primitives.ts` | `isFiniteNumber`, `inRange`, `intInRange`, `validateFees` |

## Behavioral scope (one line each)

- **ETF**: Tax-privileged equity depot; Vorabpauschale (InvStG §18); Abgeltungsteuer on gain; partial exemption (InvStG §20).
- **bAV**: Salary conversion (§3 Nr. 63 EStG); employer SV savings subsidy (§1a BetrAVG); full marginal tax on payout (§22 Nr. 5 EStG); KV/PV as Versorgungsbezug (§229 SGB V).
- **Private RV**: Tax mode derived from contract start year + runtime; Ertragsanteil for Leibrente (§22 Nr. 1 Satz 3a EStG); paid-up/surrender scenario (#65).
- **Basisrente**: Schicht-1 deductible (§10 Abs. 3 EStG); payout tax = GRV Besteuerungsanteil; no capital payout.
- **AVD**: Schicht-2 allowances (§10a/AVD Reform 2026); glidepath for Standarddepot; §22 Nr. 5 EStG payout; partial capital option.
- **Riester**: Legacy §84–§86 EStG allowances; §10a Günstigerprüfung; §22 Nr. 5 EStG payout; partial lump sum (§93 Abs. 2 EStG ≤30%).
