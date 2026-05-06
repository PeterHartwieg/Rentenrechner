---
title: "B2: Engine — `simulateContractDecision` + decision-simulation cache"
Status: done
Severity: P2
Type: AFK
Area: optimiere-vorsorge / app / pure helpers
---

## What to build

A pure helper that fills the missing `deltaNettoRente` for a
`ContractDecision`: given a workspace, a candidate decision, the
combined-result for the baseline, and the rules, run a hypothetical
simulation with that decision applied and return the EUR/month change in
combined `monthlyNetIncome`.

The modal in B6 calls this lazily per decision the user drills into; do
**not** precompute every decision on modal open.

## Acceptance criteria

- [ ] New file `src/app/optimiereVorsorge.ts` exports:
  ```ts
  export interface DecisionDelta {
    deltaMonthlyNetEUR: number
  }

  export function simulateContractDecision(
    workspace: Workspace,
    decision: ContractDecision,
    rules: Rules,
    baselineCombined: CombinedResult,
  ): DecisionDelta
  ```
- [ ] Implementation: `applyContractDecision(workspace, decision)` →
      `runCombineSimulation(applied, rules)` → diff
      `combined.monthlyNetIncome` against `baselineCombined.monthlyNetIncome`.
      Return result rounded only at the **display layer** (engine returns
      raw float; UI rounds via `formatCurrency(value, 0)`).
- [ ] `runCombineSimulation` is the existing pure factory exported from
      `src/app/useCombineSimulation.ts`. Reuse it; do **not** reimplement
      the orchestration. Verify the export is non-React.
- [ ] Memoisation helper in the same file:
  ```ts
  export function createDecisionSimulationCache(): {
    get: (workspace: Workspace, decision: ContractDecision, rules: Rules,
          baselineCombined: CombinedResult) => DecisionDelta
    invalidate: () => void
  }
  ```
  - Cache key: `(workspaceFingerprint, decision.id)`. Reuse whatever
    fingerprint pattern `useCombineSimulation` already uses (likely
    JSON-stringify of `workspace.baseline.assumptions`); if no public
    helper exists, add a tiny exported one in
    `optimiereVorsorge.ts` with a short comment.
  - Repeated calls with the same key return the cached `DecisionDelta`
    without re-running `runCombineSimulation`.
  - `invalidate()` clears the cache (used when the workspace changes
    underneath the modal — caller's responsibility to call).
- [ ] Tests in `src/app/optimiereVorsorge.test.ts`:
  - Fixture workspace with one bAV @ 1.5% RIY active. `beitragsfrei`
    decision → expect a small **negative** monthly net delta (less
    accumulation → lower payout).
  - Fixture workspace with one Riester + one AVD. `Riester→AVD`
    certified transfer decision → expect a **non-zero** delta whose sign
    matches a manual `simulatePortfolio(applied) - simulatePortfolio(baseline)` call.
  - `weiterfuehren` decision → delta within ±1e-6 of zero.
  - `increase_contribution` (B1) from 200 → 400 €/mo on a healthy ETF →
    expect positive delta.
  - Cache hit: calling `cache.get(...)` with the same arguments twice
    returns the same object reference; the second call must not invoke
    `runCombineSimulation` (assert via spy or by counting test
    `simulatePortfolio` calls).
  - Cache miss after `invalidate()` re-runs the simulation.

## Implementation notes

- All test deltas should be within ±1 €/mo of a manually-computed
  `simulatePortfolio(applied) - simulatePortfolio(baseline)` diff. Use a
  small synthetic fixture (1–2 instances) so the test stays deterministic.
- React-free: `optimiereVorsorge.ts` must not import from `src/features/`
  or React. The file ends up consumed by the modal in B6 but the helper
  itself is engine-shape.
- Keep the cache implementation simple: a `Map<string, DecisionDelta>`
  closed over by the returned `get` / `invalidate` functions. No LRU,
  no expiry — modal lifetime is short.
- Performance budget: the modal in B6 will call `cache.get(...)` per
  decision card. Five contracts × ~5 decisions = ~25 sims worst case
  during a single drill-in pass. Existing tests already run hundreds of
  `simulatePortfolio` calls without issue, so this should be tractable.

## Red test (write first)

A failing test that:
1. Builds a 1-bAV fixture workspace with a non-trivial RIY.
2. Calls `simulateContractDecision(ws, beitragsfreiWhatIf(ws, bavId), rules, baseline)`.
3. Asserts `result.deltaMonthlyNetEUR < 0`.

Fails on the missing module / export.

## Blocked by

None. Independent of B1 / B3 / B5. (B6 depends on this — B2 must land
before B6 can wire the delta chip.)
