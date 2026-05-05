---
title: Onboarding lacks a personal-details entry section (age, income, etc.)
Status: done
Area: Group G / onboarding
---

## Description

The onboarding flow jumps straight into product/contract inventory without first collecting the personal parameters that the engine needs (birth year / current age, gross income, tax class, partner, GRV years, target retirement age). Without these, all engine outputs are either blocked or falling back to defaults, reducing the usefulness of any pre-fill / estimation logic.

## Expected

A dedicated opening step (or wizard page 0) collects at minimum:
- Birth year (or current age)
- Gross annual income
- Tax class (Steuerklasse)
- Partner / joint filing (optional)
- Target retirement age

These values populate `CalcAssumptions` personal fields before the product inventory steps begin, enabling the "Schätzung" hints in subsequent steps to be meaningfully derived.

## Notes

Relates to issue #07 (inputs not saved) — if personal details are entered on a step that is not persisted, the gap compounds. Review `src/app/useCalculatorState.ts` and the onboarding step routing in `src/content/triggers.ts` to find where this section should slot in.
