# Finanzfluss AVD frontend audit

**Date:** 2026-08-02

**Reference:** [Finanzfluss Altersvorsorgedepot-Rechner](https://www.finanzfluss.de/rechner/altersvorsorgedepot/)

## Scope

This audit covers the frontend interaction model only. It does not propose changes to RentenWiki.de's AVD calculations, funding rules, fair-comparison invariant, or portfolio model.

## Finding

Finanzfluss is easier to start because it presents a small set of bounded decisions, combines sliders with exact numeric inputs, and turns statutory contribution limits into selectable presets. RentenWiki.de has the stronger model, but currently exposes model terminology and advanced assumptions too early.

The main RentenWiki friction is the contribution input: compare mode asks for **Netto-Aufwand**, although the statutory thresholds apply to the user's **Eigenbeitrag**. The Eigenbeitrag is then shown only as a derived value. Combine mode uses the clearer Eigenbeitrag concept, but its generic input range is unrelated to the statutory AVD limits.

## Patterns worth adopting

- **Slider plus exact value:** use the slider for fast exploration and retain a numeric field for precision and keyboard entry. This is appropriate for bounded values such as contribution, age, allocation, and payout percentage.
- **Selectable contribution levels:** present meaningful quick choices instead of expecting users to know the legal thresholds. In RentenWiki terminology these should be called **Beitragsstufen**, not scenarios, because scenario already means baseline or what-if.
- **Progressive disclosure:** keep contribution, eligibility/children, and payout form visible. Move subtype, allocation, low-risk return, detailed fees, transfers, and other retirement income under **Erweitert**.
- **Immediate explanation:** show Eigenbeitrag, allowances, tax benefit, and resulting net cost directly below the contribution control. This explains why the comparison amount differs without exposing the funding formula.

## Proposed frontend model

Create a shared bounded-number primitive that composes the existing `NumberField`:

```text
RangeNumberField
├── optional quick-choice cards
├── native accessible range input
└── exact NumberField with unit
```

Build an AVD-specific `AvdContributionField` on top of it with rule-derived contribution levels:

| Monthly value | Label | Reason |
|---:|---|---|
| 10 € | Mindestbeitrag | Reaches the 120 €/year eligibility floor |
| 30 € | Höchste Förderquote | Reaches the end of the 50% allowance tier |
| 150 € | Volle Grundzulage | Reaches the 1,800 €/year subsidy ceiling |
| dynamic | Vertragsrahmen | Uses the remaining per-contract capacity after allowances |

The primary question should be **“Wie viel zahlst du selbst ein?”** The resulting **Netto-Aufwand nach Steuer** remains derived and continues to drive the fair ETF/product comparison.

Use the same control in compare mode, the combine-mode instance editor, and the inventory wizard so contribution semantics and bounds cannot drift between surfaces.

## Do not copy blindly

Finanzfluss's “Maximum” preset represents two contracts at 13,680 €, while its slider remains capped at the 6,840 € per-contract limit. RentenWiki.de already models multiple product instances, so presets should remain per contract and a second contract should remain a second instance.

Sliders should also remain limited to genuinely bounded choices. Salary, current contract value, and other open-ended or document-derived values should keep exact numeric inputs only.
