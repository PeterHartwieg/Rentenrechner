---
title: Onboarding inputs are not saved / lost on navigation
Status: done
Area: Group G / onboarding / storage
---

## Description

Values entered during the onboarding flow do not persist. After completing or leaving the onboarding, the inputs are gone — neither reflected in the main calculator state nor saved to localStorage.

## Steps to reproduce

1. Open the onboarding flow.
2. Enter values in one or more fields.
3. Navigate away or complete the flow.
4. Observe that the main calculator still shows default values and that re-opening the onboarding does not show the previously entered values.

## Expected

Onboarding inputs are committed to the main `CalcAssumptions` / inventory state (and thus persisted to localStorage via `useCalculatorState`) either step-by-step or on completion.

## Notes

Check whether the onboarding wizard holds its own local React state and never calls the global state setter, or whether it does call the setter but the key used does not match what `storage.ts` persists. Also confirm that `migrateAndValidateState` does not silently drop the new onboarding-introduced fields.
