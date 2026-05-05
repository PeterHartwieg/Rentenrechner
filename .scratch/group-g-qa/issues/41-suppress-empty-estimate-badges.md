---
title: "Do not show confirmable estimate badges on empty placeholder defaults"
Status: ready-for-agent
Severity: P2
Type: AFK
Area: Group G / onboarding / evidence UX
---

## What to build

Adjust the onboarding evidence UI so `Schaetzung` badges are only shown for meaningful seeded estimates, not for placeholders that effectively mean "empty".

Currently a missing evidenceMap entry always renders as `model_estimate`. This puts a confirmable `Schaetzung / Wert ist okay` badge on values like:

- `currentValueEUR = 0`
- `effektivkostenPct = 0`
- `contractStartYear = current year`

Those values are placeholders, not useful estimates. Letting the user confirm them makes the model feel more certain than it is and can silently bless bad defaults.

## Acceptance criteria

- [ ] `currentValueEUR = 0` does not show a `Wert ist okay` estimate badge.
- [ ] Current-year `contractStartYear` defaults do not show as a meaningful estimate unless the product genuinely seeded a known value.
- [ ] Zero-fee defaults do not show a confirmable estimate badge.
- [ ] Meaningful seeded defaults such as insurance Rentenfaktor still show estimate evidence until edited or confirmed.
- [ ] User-entered values still promote to confirmed evidence and can display the confirmed state.
- [ ] Result-level confidence still treats missing evidence as model-estimated where the engine consumes that field; this issue changes the misleading field-level affordance, not the underlying confidence semantics.

## Red test

Run:

```bash
npx vitest run src/features/inventory/InstanceCard.evidence.test.tsx
```

Relevant test:

- `does not render estimate badges for empty bAV placeholder values`

## Implementation notes

Add a field-level predicate such as `shouldShowEvidenceBadge(draft, fieldPath)` or pass a `suppressWhenPlaceholder` flag into the badge site. Keep the rule close to the field value, because "empty" differs by field.

Coordinate with `.scratch/group-g-qa/issues/42-onboarding-fee-defaults-realistic.md`: if fee defaults become non-zero, those non-zero fee estimates should show the badge.

## Blocked by

None - can start immediately.
