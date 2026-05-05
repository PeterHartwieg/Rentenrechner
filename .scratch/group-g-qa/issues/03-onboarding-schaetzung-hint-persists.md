---
title: "Schätzung" hint does not disappear after a value is manually entered
Status: done
Area: Group G / onboarding
---

## Description

When a field in the onboarding menu is pre-filled with an estimated value, a "Schätzung" hint badge/indicator is shown. After the user types a new value into that field, the hint should disappear (the estimate has been superseded). Currently it remains visible even after a real value has been entered.

## Steps to reproduce

1. Open onboarding; find a field that carries a "Schätzung" indicator.
2. Type a value into the field.
3. Observe that the "Schätzung" badge is still shown.

## Expected

Once the user edits the field, the "Schätzung" indicator is cleared.

## Notes

The provenance/estimation state likely lives alongside the field value. Confirm that the edit handler clears the `isEstimated` (or equivalent) flag in addition to updating the value. See `src/features/results/provenance.tsx` for ProvLabel primitives.
