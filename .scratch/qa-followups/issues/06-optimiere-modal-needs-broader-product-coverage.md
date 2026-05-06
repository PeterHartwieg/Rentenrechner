Status: ready-for-human
Type: feature
Priority: minor
Source: local-qa
Source ref: qa-2026-05-06T13-58-05-dashboard-optimieremodal-dialog.md
Triaged: 2026-05-06T14:07:36Z

# 06 — Optimiere modal: tester wants broader product coverage and visual diff

## Problem

Tester gave directional feedback on the entire "Optimiere deine Vorsorge"
modal in combine mode. Comment: *"Does not really help me, need to expand
this with more products and visually show differences to the user."* The
captured workspace had two contracts visible in the overview (Private
Rentenversicherung 100 €/Monat, ETF-Depot 350 €/Monat); tester wants the
modal to (a) cover more product types in its menu / what-if generators and
(b) show the user the *deltas* between the current plan and the
proposed change visually rather than only as a numeric Netto-Rente
difference.

This is a feature / redesign request, not a bug fix. Two coupled UX
decisions need a human: which product expansions are next on the roadmap,
and what visual treatment ("show differences") fits the modal's flow without
turning it into a comparison view (we already have `vergleich`).

## What to change

Out of scope for the agent. A human needs to decide:

1. **Which products to add coverage for.** All six combine-mode product
   slots already produce instances and audit rows
   (`collectActiveInstances` in `src/app/optimiereVorsorge.ts:211` —
   bav / etf / insurance / basisrente / altersvorsorgedepot / riester).
   Decisions are generated per-instance via `generateContractDecisions`
   plus `beitragErhoehenWhatIf` (`auditPortfolio`, lines 258–280). What is
   the actual coverage gap the tester perceived? Possibilities:
   (i) a specific product type is missing decision generators,
   (ii) the audit-flag rules don't fire for some products so the row looks
   "empty",
   (iii) the tester only saw 2 contracts in their workspace and inferred
   the modal is limited to those.
   Confirm with the tester before scoping.

2. **What "visually show differences" means in this surface.** The modal
   currently shows numeric Netto-Rente delta per decision (instance step).
   Options to weigh: side-by-side baseline vs. what-if metric panels,
   delta chart (mini bar / waterfall) per decision, before/after line
   chart for the projection. Each has implications for the modal's flow
   (it's a step machine: disclaimer → overview → instance → confirm →
   saved) and the size budget at narrow viewports. Product judgement —
   not implementer judgement — is needed.

When (1) and (2) are decided, this issue should be split into one
implementer-ready ticket per concrete change. Until then, leave as
`ready-for-human`.

## Acceptance criteria

(Pending product decision — see "What to change". Once scoped, list
observable outcomes per resulting issue.)

## Implementation context

- Modal: `src/features/dashboard/OptimiereVorsorgeModal.tsx` (step machine
  `disclaimer → overview → instance → confirm → saved`, ~600 lines).
- Audit + decision generation:
  - `src/app/optimiereVorsorge.ts` (`auditPortfolio`,
    `collectActiveInstances`).
  - `src/app/contractDecisions.ts` (`generateContractDecisions`,
    `beitragErhoehenWhatIf`, `applyContractDecision`).
  - Per CLAUDE.md "Decision UI": Beitragsfrei is engine-supported across
    all 5 paid-up-capable simulators via
    `portfolioAdapter.ts paidUpFeeModel`.
- Recommender atoms (input to audit flags):
  `src/app/recommendations.ts`, copy in
  `src/content/recommendationCopy.ts`, candidates per product under
  `src/app/recommenderCandidates/`.
- The QA bundle screenshot is at
  `.scratch/archive/qa-feedback-issues/qa-2026-05-06T13-58-05-dashboard-optimieremodal-dialog-screenshot.png`
  — review before scoping.

## Blocked by

Product decision (human).

## Open questions

- Which specific product types or decision kinds is the tester missing? Is
  the gap in *decision generators* (e.g. no kündigen path for AVD?), in
  *audit-flag coverage* (no flags fire for product X so its row looks
  empty), or in *workspace breadth* (their test workspace had only 2
  contracts)?
- "Visually show differences": does the tester want this on the overview
  step (per-row), the instance step (per-decision), the confirm step (per
  selected plan), or all three?
- Does this overlap with the existing `vergleich` workspace view, or is
  it specifically about in-modal what-if visualisation?

## Original report

.scratch/archive/qa-feedback-issues/qa-2026-05-06T13-58-05-dashboard-optimieremodal-dialog.md
.scratch/archive/qa-feedback-issues/qa-2026-05-06T13-58-05-dashboard-optimieremodal-dialog-screenshot.png
