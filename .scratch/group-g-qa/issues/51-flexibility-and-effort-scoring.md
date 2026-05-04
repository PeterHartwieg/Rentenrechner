---
title: "Make Flexibilitaet and wenig Aufwand transparent ranking dimensions"
Status: ready-for-agent
Severity: P2
Type: AFK
Area: recommender / scoring / explanation
---

## What to build

Implement transparent scoring for the recommender's `Flexibilitaet` and `wenig Aufwand` filters.

Flexibilitaet is an overall badge plus four explainable parts: cancel, switch asset, switch product, and adjust monthly contribution. Wenig Aufwand ranks by next-action friction from the user's current state.

## Acceptance criteria

- [ ] Each candidate has an overall flexibility label: `Hoch`, `Mittel`, or `Niedrig`.
- [ ] Each candidate exposes four flexibility sub-criteria:
  - [ ] `Kuendigen`
  - [ ] `Anlage wechseln`
  - [ ] `Produkt wechseln`
  - [ ] `Beitrag aendern`
- [ ] Each sub-criterion renders as `einfach`, `eingeschraenkt`, or `schwer / nicht vorgesehen`.
- [ ] Product defaults follow the agreed ordering: ETF highest, private insurance with capital option medium-high, AVD/Riester medium, bAV low, Basisrente lowest.
- [ ] Forced annuity, expensive transfer/surrender, or unavailable changes lower the relevant sub-criteria where product data indicates this.
- [ ] `Wenig Aufwand` prefers increasing an existing product over opening a new one.
- [ ] ETF gets a high effort score if the user already has a depot/ETF instance.
- [ ] bAV effort is lower if the user has no employer offer.
- [ ] Riester/AVD/Basisrente/private insurance effort is lower when eligibility or offer data is missing.
- [ ] Result UI shows only the overall badge by default and reveals criteria details through a disclosure, tooltip, or compact details affordance.
- [ ] Tests cover product default scoring and current-state effort ranking.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Likely surfaces:

- `src/app/recommender.ts`
- `src/app/recommendations.ts` if atoms/copy are reused
- modal result component from issue 49

Keep the first version coarse but explicit. Do not invent fake decimal precision in the UI.

## Blocked by

- Issue 50 - ranking filters.
