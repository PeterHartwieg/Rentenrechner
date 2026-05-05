---
title: "RISK: Inventory personal-details validation can fail silently — Next button looks inert"
Status: done
Severity: risk
Area: Group G / onboarding / personal details
---

## Description

`PersonalDetailsStep` builds validation errors but `handleNext` simply returns when errors exist, with a comment claiming native browser validation shows them ([InventoryWizard.tsx:116](src/features/inventory/InventoryWizard.tsx), [InventoryWizard.tsx:130](src/features/inventory/InventoryWizard.tsx)). The custom validation is not surfaced, so invalid entries make the Next button appear inert.

## Steps to reproduce

1. Open onboarding, reach personal-details step.
2. Enter an invalid value (e.g. typoed birth year, retirement age below current age).
3. Click "Weiter" — nothing happens, no error message.

## Impact

Conversion / UX risk for first-time users. They see a button that "doesn't work" and may abandon onboarding entirely. Not publication-blocking for calculation correctness, but a measurable funnel leak.

## Fix direction

Surface the validation errors. Either:
- Render the error messages inline below each field (preferred — same pattern as the rest of the project).
- Render a single banner near the Next button summarizing what's wrong.

Make sure all fields have native HTML validation attributes too (`min`, `max`, `required`, `type`) so browser-level validation is at least visible if custom messages aren't reached.

## Notes

Related to #21 (personal-details UI incoherent with rest of tool). Wire validation feedback using the same field/error primitives the rest of the project uses, not ad-hoc markup.
