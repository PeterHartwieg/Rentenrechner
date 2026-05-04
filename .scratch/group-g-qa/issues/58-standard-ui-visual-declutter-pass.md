---
title: "Apply visual-first declutter rule to standard user surfaces"
Status: ready-for-agent
Severity: P2
Type: AFK
Area: UX polish / standard surfaces
---

## What to build

Reduce text clutter on standard user-facing surfaces so the tool reads as a visual calculator, not an explanatory article.

Use the agreed rule: one short heading, at most one short supporting sentence, primary meaning carried by numbers/charts/labels/icons/layout, and long explanations moved to tooltips/details/expert sections.

## Acceptance criteria

- [ ] `Mein Plan` dashboard cards follow the one-heading / one-supporting-sentence rule.
- [ ] Luecke-schliessen modal steps are visually scannable and do not use paragraph-style teaching copy.
- [ ] Risiko-Check overview relies on visual indicators and plain labels rather than explanatory paragraphs.
- [ ] Onboarding product cards move dense details into disclosures or tooltips.
- [ ] Legal disclaimer behavior remains unchanged and visible.
- [ ] No standard dashboard card contains long explanatory paragraphs unless legally required.
- [ ] Tooltips/details preserve important caveats that were removed from always-visible copy.
- [ ] Visual regression or component tests are adjusted where copy changes affect snapshots.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Priority order:

1. Mein Plan dashboard
2. Luecke-schliessen modal
3. Risiko-Check
4. Onboarding
5. Vergleich details / exports

Keep this pass scoped to standard UI surfaces. Do not rewrite exports or legal copy except where an acceptance criterion explicitly requires it.

## Blocked by

- Issue 49 - Luecke-schliessen modal recommender.
- Issue 53 - Risiko-Check wording/layout.
- Issue 54 - Mein Plan lifecycle chart.
- Issue 55 - GRV/planned-children onboarding.
