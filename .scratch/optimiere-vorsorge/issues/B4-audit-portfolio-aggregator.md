---
title: "B4: Audit aggregator — `auditPortfolio(workspace, rules) → InstanceAudit[]`"
Status: done
Severity: P2
Type: AFK
Area: optimiere-vorsorge / app / pure helpers
---

## What to build

A pure aggregator that walks every active/paid-up contract in the
workspace, attaches the audit-flag atoms (B3) and decision generators
(B1 + existing per-instance generators), and returns one row per
instance sorted worst-first.

Consumed by the modal in B6 to render the overview step.

## Acceptance criteria

- [ ] Add to `src/app/optimiereVorsorge.ts` (created in B2):
  ```ts
  export interface InstanceAudit {
    instance: InstanceCommon
    flags: Atom[]                 // atoms emitted for this instance
    decisions: ContractDecision[] // generated for this instance
  }

  export function auditPortfolio(
    workspace: Workspace,
    rules: Rules,
  ): InstanceAudit[]
  ```
- [ ] For each active or paid-up instance across all six product slots
      (`bav`, `etf`, `insurance`, `basisrente`, `altersvorsorgedepot`,
      `riester`):
  1. Generate decisions via the existing `generateContractDecisions`
     **plus** `beitragErhoehenWhatIf` (B1) where applicable. Excluded:
     ETF instances do not get a `Beitragsfrei` card (existing rule);
     they **do** get `Beitrag erhöhen`.
  2. Filter `runRules(buildRulesInput(workspace))` atoms to those whose
     `context.instanceId === instance.instanceId`.
  3. Build the `InstanceAudit` row.
- [ ] Rows excluded: `status === 'surrendered'` and `status === 'offered'`
      instances.
- [ ] Sort rows by **flag severity** descending. Severity score per row
      = `3 × highCount + 2 × mediumCount + 1 × lowCount` (priorities from
      atom emission). Ties broken by `flags.length` desc, then by
      `instanceId` ascending for stable ordering.
- [ ] Tests in `optimiereVorsorge.test.ts`:
  - Synthetic workspace with three instances: high-fee bAV active +
    statement-evidenced ETF + Riester with model-estimate fields.
    `auditPortfolio` returns three rows in this order:
    1. bAV (1 medium flag — `high_cost_active`),
    2. Riester (1 medium flag — `missing_offer_data`),
    3. ETF (no flags).
  - Surrendered / offered instances are not in the result.
  - Each `InstanceAudit.decisions` array has the expected decision kinds:
    bAV → `weiterfuehren | beitragsfrei | kuendigen | uebertragen | beitrag-erhoehen` (one each, order matches `generateContractDecisions` + new generator appended last);
    ETF → `weiterfuehren | kuendigen | beitrag-erhoehen` (no beitragsfrei).
  - `decisions[].deltaNettoRente === 0` (population is the modal's job
    in B6, not the aggregator's).

## Implementation notes

- Reuse `generateContractDecisions(workspace, instanceId)` from
  `contractDecisions.ts` rather than calling each generator individually.
  For ETF (which `generateContractDecisions` skips for beitragsfrei but
  otherwise covers), the existing function returns the correct subset.
- `Beitrag erhöhen` is appended after the existing decisions per
  instance. Initial `newMonthlyEUR` from B1's helper
  (`currentMonthly × 1.5` rounded to nearest €10).
- `buildRulesInput` is already a private function in
  `contractDecisions.ts`. If it's not exported, recreate the same shape
  inline in the aggregator (copy is fine — three lines). Or export it
  from `contractDecisions.ts` if the shape evolves.
- React-free.

## Red test (write first)

A failing test on a 3-instance fixture asserting the three-row sort
order. Fails on missing module / function.

## Blocked by

- B1 (needs `beitragErhoehenWhatIf` + `'beitrag-erhoehen'` kind).
- B3 (needs the new audit-flag atoms to compute severity sort correctly).

Can run after both land. Independent of B2 / B5.
