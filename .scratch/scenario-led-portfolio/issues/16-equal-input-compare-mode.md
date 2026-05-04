# 16 — Equal-input compare-mode sub-mode

Status: needs-triage
Milestone: M4
Plan section: §4 M3.9
PRD capabilities: F4, F24, S6
Depends on: 03

## What

Compare-mode equal-input sub-mode for brokers. Today's compare-mode forces ETF/pAV to invest `bavFunding.monthlyNetCost` (the fair-comparison invariant). Brokers want "compare €X/Monat across N candidate products" — equal nominal contribution, no invariant.

## Scope

- `src/engine/equalInputComparator.ts` — orchestrates per-product simulations at a single user-supplied `monthlyContributionEUR`. Tax-deferral on bAV still flows through the salary calc (so net cost still reflects tax savings); but ETF and pAV both run at the supplied nominal amount, not at bAV's net cost.
- Compare-mode entry: sub-mode toggle in the input drawer. Default per entry source:
  - From landing "Produkte vergleichen" CTA → equal-input default (broker entry).
  - From a saved compare-mode workspace where the sub-mode was previously equal-cash → preserved.
- UI: a "Vergleichsbetrag" input field appears in equal-input sub-mode (defaulted to a sensible value, e.g. €200/Monat). In equal-cash mode, today's behaviour preserved.
- Sub-mode persisted in the workspace as `assumptions.compareSubMode: 'equal_cash' | 'equal_input'`.

## Out of scope

- Multi-instance support in compare-mode (compare-mode stays singleton).
- Broker product database (P3 / Group P license-tier).
- Branded broker exports (P2 / Group P).

## Acceptance

- A broker enters €200/Monat in equal-input mode, picks 3 pAV candidates with different fees → 3 product cards with side-by-side metrics, each running at €200/Monat.
- Anna entering compare-mode in equal-cash sub-mode (today's default) sees no behavioural change vs today.
- Sub-mode toggle round-trips through share-URL.
- Tax-deferral on bAV still computed via salary calc in both sub-modes.

## Test plan

- Oracle: equal-cash sub-mode against today's compare-mode integration goldens — byte-identical.
- New oracle: equal-input sub-mode at €200/Monat across 3 different fee scenarios produces deterministic results.
- E2E preview: broker workflow — landing → "Produkte vergleichen" → equal-input default visible → enter €200/Monat → 3 cards rendered.
