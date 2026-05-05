---
title: Personal-details step in onboarding has UI incoherent with the rest of the tool
Status: done
Area: Group G / onboarding / personal details
---

## Description

The personal-information step (wizard step 0 — birth year, gross income, tax class, etc.) added in commit `7d24ddc` looks visually and structurally out of place compared to the rest of the application. Spacing, field grouping, label style, and section framing differ from the inventory steps and the main calculator views, making the onboarding feel inconsistent.

## Expected

The personal-details step should match the design language used elsewhere:

- Use the same section primitives (card framing, heading sizes, spacing) as other onboarding steps in `src/features/inventory/`.
- Use `<NumberField>` from `src/ui/NumberField.tsx` for all numeric inputs (it is the project-wide rounding boundary — see CLAUDE.md "UI rounding boundary").
- Reuse existing form-row / label / hint components rather than ad-hoc markup.
- Match the visual rhythm of the rest of the wizard (step indicator, "Weiter" button placement, helper text style).

## Notes

Likely entry point: the personal-details step component introduced in #06. Compare side-by-side against an inventory step (e.g. bAV inputs in the wizard) and pull shared patterns into the same component primitives. CSS for `src/features/inventory/` is co-located — reuse those classes/modules rather than introducing new ones.
