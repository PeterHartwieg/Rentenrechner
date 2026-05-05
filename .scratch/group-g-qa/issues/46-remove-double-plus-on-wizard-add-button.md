---
title: "Remove duplicate plus from wizard add-instance button"
Status: ready-for-agent
Severity: P3
Type: AFK
Area: Group G / onboarding / polish
---

## What to build

Remove the literal `+` text prefix from the InventoryWizard add-instance button because the button already renders a Plus icon.

Current render shape:

- icon from `Plus`
- literal `+`
- label such as `weitere bAV hinzufuegen`

This produces `[icon] + weitere bAV hinzufuegen`, which is visually noisy.

## Acceptance criteria

- [ ] Wizard add-instance buttons render with only the Plus icon and the label text.
- [ ] Button accessible names remain clear, for example `weitere bAV hinzufuegen`.
- [ ] The add button still appends a new instance.
- [ ] Existing click-target and multi-instance tests still pass; add a tiny assertion if no current test covers the rendered label.

## Red test

Run:

```bash
npx vitest run src/features/inventory/InventoryWizard.regression.test.tsx
```

Relevant test:

- `renders add-instance buttons without a duplicate literal plus`

## Implementation notes

The relevant JSX is in `src/features/inventory/InventoryWizard.tsx` around the `inv-add-instance-btn`.

This is intentionally a tiny polish issue and should not be bundled with the larger add-contract flow.

## Blocked by

None - can start immediately.
