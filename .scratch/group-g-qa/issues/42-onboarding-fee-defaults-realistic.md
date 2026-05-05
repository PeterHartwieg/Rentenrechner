---
title: "Seed realistic onboarding fee defaults for insurance-wrapper products"
Status: ready-for-agent
Severity: P2
Type: AFK
Area: Group G / onboarding / assumptions
---

## What to build

Replace zero Effektivkosten defaults in the onboarding wizard with realistic product defaults, and keep wizard-created and dashboard-created instances consistent.

Today `defaultBav`, `defaultPav`, and `defaultBasisrente` all set `effektivkostenPct: 0`. If the user finishes onboarding without editing fees, the saved product runs as fee-free. Dashboard-added instances already use `0.8`, so the two creation paths disagree.

## Acceptance criteria

- [ ] bAV onboarding default Effektivkosten is non-zero and product-appropriate.
- [ ] pAV onboarding default Effektivkosten is non-zero and product-appropriate.
- [ ] Basisrente onboarding default Effektivkosten is non-zero and product-appropriate.
- [ ] Wizard-created and dashboard-added defaults are aligned or intentionally documented if they differ.
- [ ] Completing onboarding with untouched insurance-wrapper fees no longer saves `fees.wrapperAssetFee = 0`.
- [ ] Existing tests that assert zero wrapper fees are updated to the new expected defaults.
- [ ] Visible copy makes clear that the fee is an estimate until the user enters a value from PIB/KID.

## Red test

Run:

```bash
npx vitest run src/features/inventory/InventoryWizard.regression.test.tsx
```

Relevant tests:

- `does not save a zero onboarding fee default for bav`
- `does not save a zero onboarding fee default for versicherung`
- `does not save a zero onboarding fee default for basisrente`

## Implementation notes

Use existing fee preset language as the starting point:

- `LAYER3_FEE_PRESETS` in `InstanceCard.tsx`.
- `SIMPLIFIED_PRESETS` / `feePresets`.
- `addInstanceToWorkspace` defaults in `inventoryHelpers.ts`.

Pick conservative defaults that avoid overstating retirement income. The exact numbers are product judgment, but zero should no longer be the default for insurance-wrapper products.

## Blocked by

None - can start immediately.
