---
title: "Keep ETF onboarding details depot-specific"
Status: ready-for-agent
Severity: P1
Type: AFK
Area: onboarding / ETF / details
---

## What to build

ETF onboarding should not show insurance-product cost concepts. The first-layer ETF copy already uses depot language, but the details disclosure still reuses insurance-wrapper fee controls.

Create or adapt ETF-specific details so users only see concepts relevant to an ETF depot/savings plan.

## Acceptance criteria

- [ ] ETF onboarding does not show `Mantelgebuehr`.
- [ ] ETF onboarding does not show `Abschlusskosten`.
- [ ] ETF onboarding does not show `Vertriebs-/Abschlusskosten`.
- [ ] ETF onboarding does not show insurance-wrapper presets such as `Nettotarif ETF` or `Bruttotarif`.
- [ ] ETF detail fields include TER/Fondskosten and any ETF-relevant assumptions only.
- [ ] ETF still supports contribution growth if that remains product-relevant, but the field label/copy is savings-plan specific.
- [ ] bAV, pAV, Basisrente, AVD, and Riester can continue using insurance/certified-product fee details where relevant.
- [ ] Tests assert that ETF details exclude insurance cost labels while insurance-wrapper products still show them.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Likely surface:

- `src/features/inventory/InstanceCard.tsx`

Avoid removing shared `FeeSection` for products where it is correct.

## Blocked by

None - can start immediately.
