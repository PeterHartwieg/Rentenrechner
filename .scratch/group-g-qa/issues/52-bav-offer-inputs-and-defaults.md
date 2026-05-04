---
title: "Collect bAV employer offer fields in Luecke-schliessen flow"
Status: ready-for-agent
Severity: P1
Type: AFK
Area: recommender / bAV offer / funding
---

## What to build

Add the bAV employer-offer branch to the Luecke-schliessen modal. The user enters employer contribution details and the app back-solves the employee gross conversion from the user's fixed net monthly savings budget.

If the user has no offer, bAV remains available with conservative standard assumptions.

## Acceptance criteria

- [ ] Modal asks whether the user has a bAV employer offer.
- [ ] If yes, the main path collects employer contribution percent.
- [ ] If yes, the main path collects fixed employer contribution EUR/month.
- [ ] If yes, the main path supports an optional employer contribution cap EUR/month.
- [ ] Percent and fixed employer contributions are additive.
- [ ] Optional cap limits the total employer contribution.
- [ ] Main path collects effective costs p.a.
- [ ] Durchfuehrungsweg defaults to Direktversicherung Section 3 Nr. 63.
- [ ] Rentenfaktor and payout mode are available only in optional details.
- [ ] The recommender back-solves employee gross conversion so the user's net out-of-pocket budget remains the entered amount.
- [ ] If no offer exists, bAV uses standard assumptions: 15% employer contribution, no flat employer contribution, no extra employer cap, Direktversicherung Section 3 Nr. 63, 1.2% p.a. effective costs.
- [ ] No-offer bAV candidate is marked as standard-assumption / lower-confidence input.
- [ ] Tests cover percent-only, flat-only, percent-plus-flat, capped, and no-offer cases.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Likely surfaces:

- `src/app/recommender.ts`
- `src/engine/salary.ts` / bAV funding helpers if an inversion helper is needed
- modal bAV-offer step from issue 49

Do not ask the user to manually solve gross/net bAV in the modal.

## Blocked by

- Issue 49 - modal recommender flow shell.
