---
title: "Make onboarding number inputs allow deleting 0 while editing"
Status: done
Severity: P1
Type: AFK
Area: onboarding / forms / NumberField
---

## What to build

The shared `NumberField` supports draft editing, but onboarding still has raw number inputs that coerce empty values back to 0 while the user types.

Update onboarding number inputs so users can delete a lone 0, type a new number naturally, and only commit/clamp when appropriate.

## Acceptance criteria

- [ ] All onboarding numeric inputs allow Backspace/Delete to clear a lone `0` while focused.
- [ ] Empty draft state does not immediately reinsert `0`.
- [ ] Invalid or empty values are handled on blur/commit without crashing or writing NaN into state.
- [ ] Validation feedback remains clear when required fields are left empty.
- [ ] Shared `NumberField` is reused where practical.
- [ ] If a local onboarding numeric primitive remains, it follows the same draft/commit semantics as `NumberField`.
- [ ] Tests cover deleting `0` in personal details and product instance fields.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Relevant prior issue: `.scratch/group-g-qa/issues/04-number-field-backspace-cannot-delete-zero.md` was marked done for the shared field. This issue covers onboarding-specific primitives that still bypass it.

Likely surfaces:

- `src/features/inventory/InstanceCard.tsx`
- `src/features/inventory/InventoryWizard.tsx`
- `src/ui/NumberField.tsx` only if reusable APIs need a small extension

## Blocked by

None - can start immediately.
