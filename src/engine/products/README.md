# Product Modules

Each product has a self-contained module here. To touch a product, read only its row.

| Product | Simulator | Validator | Domain types | Tests | UI input |
|---------|-----------|-----------|--------------|-------|----------|
| ETF-Depot | `etf.ts` | `etf.validation.ts` | `src/domain/products/etf.ts` | `etf.test.ts` | `features/inputs/ProfileInputs.tsx` (inline) |
| bAV | `bav.ts` | `bav.validation.ts` | `src/domain/products/bav.ts` | `bav.test.ts` | `features/inputs/BavInputs.tsx` |
| Private RV (pAV) | `insurance.ts` | `insurance.validation.ts` | `src/domain/products/insurance.ts` | `insurance.test.ts` | `features/inputs/InsuranceInputs.tsx` |
| Basisrente (Rürup) | `basisrente.ts` | `basisrente.validation.ts` | `src/domain/products/basisrente.ts` | `basisrente.test.ts` | `features/inputs/BasisrenteInputs.tsx` |
| Altersvorsorgedepot | `altersvorsorgedepot.ts` | `altersvorsorgedepot.validation.ts` | `src/domain/products/altersvorsorgedepot.ts` | `engine/altersvorsorgedepot.test.ts` | `features/inputs/AltersvorsorgedepotInputs.tsx` |
| Riester (Altvertrag) | `riester.ts` | `riester.validation.ts` | `src/domain/products/riester.ts` | `engine/riester.test.ts` | `features/inputs/RiesterInputs.tsx` |

## Adding a product

1. Create `<product>.ts` — export `metadata` and `simulate(ctx, scenario)`.
2. Create `<product>.validation.ts` — export `validate<Product>(assumptions)`.
3. Create `<product>.test.ts` — use factories from `src/test/factories.ts`.
4. Add one import + one call in `simulate.ts` → `simulateRetirementComparison`.
5. Add one delegation call in `scenarioSchema.ts` → `validateAssumptions`.
6. Add one `metadata` import in `productManifest.ts` → `PRODUCT_MANIFEST`.
7. Add a row to this table and to `docs/context/products.md`.

## Shared infrastructure

| File | Purpose |
|------|---------|
| `../simulationContext.ts` | `SimulationContext` interface; `buildContext` computes pre-scenario funding results |
| `../buildResult.ts` | `buildProductResult` — runs accumulation + payout/tax pipeline; assembles `ProductResult` |
| `../../domain/validation/primitives.ts` | `isFiniteNumber`, `inRange`, `intInRange`, `validateFees` |
| `../../engine/productManifest.ts` | Aggregates all product `metadata`; `getProductMeta(id)` for UI lookups |

## Behavioral scope (one line each)

- **ETF**: Vorabpauschale (InvStG §18); Abgeltungsteuer on gain; partial exemption (InvStG §20); kapitalverzehr payout.
- **bAV**: Salary conversion (§3 Nr. 63 EStG); employer SV savings subsidy (§1a BetrAVG); full marginal tax on payout (§22 Nr. 5 EStG); KV/PV as Versorgungsbezug (§229 SGB V).
- **Private RV**: Tax mode derived from contract start year + runtime; Ertragsanteil for Leibrente (§22 Nr. 1 Satz 3a EStG); paid-up/surrender scenario.
- **Basisrente**: Schicht-1 deductible (§10 Abs. 3 EStG); payout tax = GRV Besteuerungsanteil; capital payout prohibited.
- **AVD**: Schicht-2 allowances (§10a/AVD Reform 2026); Standarddepot glidepath; §22 Nr. 5 EStG payout; partial capital option.
- **Riester**: Legacy §84–§86 EStG allowances; §10a Günstigerprüfung; §22 Nr. 5 EStG payout; ≤30% partial lump sum (§93 Abs. 2 EStG).
