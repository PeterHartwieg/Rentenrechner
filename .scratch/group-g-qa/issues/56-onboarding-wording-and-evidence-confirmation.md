---
title: "Fix German wording and estimate confirmation labels"
Status: done
Severity: P2
Type: AFK
Area: onboarding / evidence UX / copy
---

## What to build

Clean up two confusing German UI labels found in QA.

Rename `Mandatorische Altersversorgung` to `Gesetzliche Altersvorsorge`, and rename estimate confirmation buttons from `Wert ist okay` to `Uebernehmen`.

## Acceptance criteria

- [ ] No user-facing copy says `Mandatorische Altersversorgung`.
- [ ] The onboarding section heading is `Gesetzliche Altersvorsorge`.
- [ ] Estimate/evidence confirmation buttons say `Uebernehmen`.
- [ ] Clicking `Uebernehmen` keeps the visible value unchanged and marks the field user-confirmed.
- [ ] Optional tooltip/title may clarify `Schaetzwert uebernehmen` or `Aus Angebot uebernehmen`.
- [ ] Tests previously asserting `Wert ist okay` are updated to assert `Uebernehmen`.
- [ ] Existing evidence promotion behavior remains unchanged apart from visible copy.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Likely surfaces:

- `src/features/inventory/InventoryWizard.tsx`
- `src/features/inventory/EvidenceBadge.tsx`
- `src/features/inventory/EvidenceBadge.test.tsx`

## Blocked by

None - can start immediately.
