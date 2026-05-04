---
title: "Clarify GRV input mode and support planned children as dated events"
Status: ready-for-agent
Severity: P1
Type: AFK
Area: onboarding / profile / statutory pension / child rules
---

## What to build

Fix onboarding confusion around GRV Entgeltpunkte and planned children.

GRV entry should be an explicit either/or choice. Planned children should be accepted as future dated events and child-dependent calculations should use actual birth years.

## Acceptance criteria

- [ ] GRV onboarding asks `Wie moechtest du deine gesetzliche Rente erfassen?`.
- [ ] Option 1: `Schaetzen aus Arbeitsjahren und Gehalt`.
- [ ] Option 2: `Entgeltpunkte aus Renteninformation eingeben`.
- [ ] Only the fields for the selected option are shown.
- [ ] The selected option unambiguously controls which value is used in the workspace.
- [ ] Onboarding allows future child birth years up to current year + 20.
- [ ] Future child rows are labeled `geplant`.
- [ ] Validation prevents implausible far-future years beyond current year + 20.
- [ ] Child-dependent calculations use actual birth year timing.
- [ ] Riester/AVD child allowances begin only in eligible years.
- [ ] Pflegeversicherung child effects begin from the child's birth year.
- [ ] Regression tests cover past child, current-year child, future planned child, and invalid far-future child.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Likely surfaces:

- `src/features/inventory/InventoryWizard.tsx`
- `src/features/inventory/InstanceCard.tsx`
- `src/features/inputs/ProfileInputs.tsx`
- child-year logic in Riester/AVD funding and salary/retirement KV/PV helpers if any flat simplification remains

The user stated the engine likely already supports the correct implementation. Verify with tests before changing engine code.

## Blocked by

None - can start immediately.
