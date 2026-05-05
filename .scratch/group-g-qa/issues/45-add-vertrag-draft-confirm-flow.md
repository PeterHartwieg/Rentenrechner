---
title: "Add Vertrag flow should collect real inputs before mutating baseline"
Status: done
Severity: P3
Type: AFK
Area: Group G / combine mode / add contract
---

## What to build

Change `Vertrag hinzufuegen` so picking a product opens a draft entry flow instead of immediately inserting a default instance into the persisted baseline.

Today `AddVertragSection` calls `addInstance(productId)` directly. That creates placeholder values immediately and persists them. Combined with incomplete sidebar editing, the user can end up with default contracts they did not mean to save.

## Acceptance criteria

- [ ] Clicking `Vertrag hinzufuegen` opens a product picker as today.
- [ ] Choosing a product opens a draft form or mini-wizard for that product.
- [ ] The baseline is not mutated until the user confirms/saves the draft.
- [ ] Cancelling the draft leaves workspace state unchanged.
- [ ] The draft form collects the same key fields as onboarding for the chosen product.
- [ ] The flow works from both sidebar and overview placements of `AddVertragSection`.
- [ ] Tests cover cancel-without-mutation and save-with-mutation for at least ETF and bAV.

## Red test

Run:

```bash
npx vitest run src/features/inventory/CombineDashboardSidebar.test.tsx
```

Relevant test:

- `does not mutate the baseline immediately when a product type is chosen`

## Implementation notes

Prefer reusing or extracting onboarding `InstanceCard` field sets so the add flow and onboarding stay aligned.

Coordinate with `.scratch/group-g-qa/issues/39-combine-sidebar-edit-collected-fields.md`, but this issue can still land independently if the add flow itself collects the needed fields before save.

## Blocked by

None - can start immediately.
