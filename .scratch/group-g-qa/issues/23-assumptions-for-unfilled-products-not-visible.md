---
title: Assumptions/Settings for non-filled-out products are too hidden
Status: done
Area: Group G / assumptions / discoverability
---

## Description

When a product has not yet been configured by the user, its assumptions / settings are hard to find. Users don't realize that a product they haven't entered is being simulated against default / placeholder values, and they have no easy path to inspect or override those defaults before drawing conclusions from the comparison.

## Expected

Non-filled products should make their current assumption state visible at a glance:

- A clear visual signal on the product card / row that "this product is using defaults" (vs. user-supplied values) — reuse the provenance primitives in `src/features/results/provenance.tsx` (`ProvLabel` / `FieldWithProv`) which already distinguish user vs. estimated vs. default sources.
- A direct affordance ("Einstellungen anpassen" / "Werte eingeben") on each empty product so the user can jump straight into editing assumptions for it without hunting through panels.
- The defaults themselves should be summarized (e.g. "Kosten: 1.5 % p.a., Beitragsdynamik: 0 %, …") on the unfilled card so users can sanity-check before trusting the result.

## Notes

The provenance system already exists and is consumed by `ProductEditCards`. This issue is about extending the same evidence/visibility treatment to products that are part of the comparison but have no user input yet. Likely surfaces: `InputsPanel`, comparison cards in compare mode, and the empty-state rendering for unfilled product instances in combine mode.
