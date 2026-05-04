---
title: "Backlog: Optimiere deine Vorsorge existing-contract decision flow"
Status: needs-triage
Severity: P3
Type: HITL
Area: backlog / contract decisions / what-if planning
---

## What to build

Create a future feature concept for a separate `Optimiere deine Vorsorge` flow. This is intentionally separate from `Luecke schliessen`, which only compares additional-saving options.

The optimization flow audits existing contracts and creates what-if options for changing them.

## Acceptance criteria

- [ ] Product owner confirms this belongs in the backlog rather than the current QA fix batch.
- [ ] Flow is separate from the Luecke-schliessen modal.
- [ ] Candidate actions include at least: Beitrag erhoehen, beitragsfrei stellen, kuendigen und frei investieren, Riester zu AVD uebertragen, unveraendert lassen.
- [ ] Flow can surface flags such as high costs, weak guarantee, low flexibility, or missing offer data.
- [ ] What-if creation does not mutate baseline until the user explicitly saves/adopts a plan.
- [ ] Stronger disclaimer/advice posture is designed before implementation because the flow discusses changing existing contracts.
- [ ] Follow-up implementation issues are created once scope and legal copy are agreed.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

This is a backlog/product-design placeholder, not ready for an AFK implementation agent yet.

## Blocked by

Human product/legal review.
