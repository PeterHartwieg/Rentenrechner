# 03 — PortfolioAdapter + projection + state-hook split

Status: done
Milestone: M1
Plan section: §2.2 V2 type boundary, §3 Module map, §4 M1.3 + M1.4
PRD capabilities: F2, F3, S4, A1, A2, A2a
Depends on: 01, 02

## What

Introduce the orchestration layer that lets combine-mode iterate over instance arrays without touching the per-product simulators or the registry.

The adapter does NOT call `simulateRetirementComparison` per instance. That function runs the entire `PRODUCT_REGISTRY` × `returnScenarios` for every call, so per-instance invocation would multiply results and preserve compare-mode coupling (the fair-comparison invariant routed through `ctx.bavFunding`). The adapter instead projects each instance to a singleton-shaped `ScenarioAssumptions` and calls **only** the relevant per-product simulator (`simulateBav`, `simulateEtf`, ...) directly.

Also splits `useCalculatorState`: combine-mode workspaces delegate to a new `src/app/portfolioState.ts`; compare-mode keeps today's singleton API. Both use the adapter under the hood.

## Scope

### `projectInstanceToScenarioAssumptions`

Pure helper in `src/engine/portfolioAdapter.ts`. For each per-product instance, return a `ScenarioAssumptions` (today's singleton type, NOT modified) where:

- The instance's product slot is populated from the instance fields (e.g. for a `BavInstance`, `assumptions.bav = { ...instance, ...bavSpecificFields }` minus the `InstanceCommon` fields the engine doesn't read).
- Other product slots get a "neutralised default" — the engine treats them as not-funded so they don't pollute `buildContext`'s funding loop. Specifically: zero monthly contributions, default fees, default payout-mode. The neutralised defaults exist as exported constants (`NEUTRALISED_BAV`, `NEUTRALISED_ETF`, ...).
- Scenario-level fields (`returnScenarios`, `monteCarlo`, `inflationRate`, `retirementEndAge`, `visibleProducts`) copy from the workspace.
- `currentValueEUR` from the instance maps to the per-product `existingCapital` / equivalent field that already exists for that product (Riester has it; ETF gets it added if not present — covered by issue 15's `AccumulationInput.initialCapital` extension).

### Portfolio-aware funding pre-step

Before per-instance simulation, run a workspace-level funding step that resolves cross-instance shared budgets:

- **bAV §3 Nr. 63 + §1 SvEV cap**: sum gross conversions across all bAV instances at the user's employer (workspace-scope assumption: one employer in P1; partner profiles + multi-employer is P2). Apply the cap to the aggregate, then distribute statutory subsidy proportionally across instances. The output is a per-instance "effective gross conversion + effective employer subsidy + effective net cost" tuple consumed at projection time.
- **Basisrente §10 Abs. 3 cap**: sum contributions across Basisrente instances; apply cap; distribute deductible fraction proportionally.
- **Riester §10a cap**: sum contributions across Riester instances; allowance + Mindesteigenbeitrag computed once at portfolio level.
- **Sparerpauschbetrag**: shared across all ETF (and AVD payout) instances.

These pre-step results live on a new `PortfolioFunding` object passed alongside the projected `ScenarioAssumptions` into per-instance simulator calls.

### Adapter itself

```ts
function simulatePortfolio(
  workspace: Workspace,
  rules: GermanRules,
): { perInstance: Record<string, ProductResult[]>, portfolioFunding: PortfolioFunding }
```

For each instance:
1. Look up portfolio-funding share for the instance.
2. Project to singleton-shaped `ScenarioAssumptions`.
3. Build a per-call `SimulationContext` via `buildContext` (existing function) with the projected assumptions and the instance's funding share.
4. Call the relevant per-product simulator directly (`simulateBav(ctx, scenario)` etc., NOT the registry loop). One call per `(instance, returnScenario)` pair.
5. Tag the resulting `ProductResult` with `instanceId`.

### State-hook split

- `src/app/portfolioState.ts` for combine-mode: reads `Workspace`, exposes `baseline`, `whatIfs`, `setBaseline`, `addWhatIf`, `updateWhatIf`, `removeWhatIf`, `setMode`. Manages `derivedFromBaselineSnapshot` lifecycle (frozen at fork; discarded on re-base).
- `useCalculatorState` branches on `workspace.mode`. Compare-mode behaviour byte-identical to today (workspaces with length-1 instance arrays project to singletons via the adapter, then run today's path).

## Out of scope

- Cross-instance retirement-tax + KV/PV aggregation (issue **08** — `portfolioCombine`).
- New UI (issues 04+).
- Engine extensions for `transferEvents` (issue 15).
- Compare-mode equal-input sub-mode (issue 16).

## Acceptance

- Loading a v2 workspace with one length-1 array per product produces engine results byte-identical to today's pre-migration goldens (oracle goldens stay green).
- Loading a v2 workspace with `bav: [a, b]` produces two `ProductResult` entries in `perInstance` keyed by `a.instanceId` and `b.instanceId`, with the bAV §3 Nr. 63 cap applied to the aggregate (not to each instance independently).
- Compare-mode workspaces continue to render via today's `useCalculatorState` API; existing compare-mode integration tests pass unchanged.
- Combine-mode workspaces render via `portfolioState`; the dashboard view-model receives `perInstance` data plus `portfolioFunding`.
- The projection function is pure (no DOM, no React). Round-trip stability tested.

## Test plan

- Integration: every existing `simulate.integration.test.ts` snapshot passes byte-identical via length-1 array invocation. (Confirms the projection + direct simulator call path matches `simulateRetirementComparison` for the singleton case.)
- New test: 2-bAV instance workspace produces 2 distinct `ProductResult` entries. Sum of gross conversions equals the pre-cap aggregate; sum of statutory subsidies equals the cap-adjusted total (proportional split).
- New test: cross-instance Sparerpauschbetrag — 2 ETF instances share the €1,000 (single) allowance correctly, not 2 × €1,000.
- New test: switching `mode` field on a workspace flips the active state hook (tested via React Testing Library or shallow harness).
- New test: `derivedFromBaselineSnapshot` remains frozen when baseline is mutated; re-base recomputes deltas against the new baseline.

## Comments

> *This was generated by AI during triage.*

Verified against the current repo on 2026-05-05: `src/engine/portfolioAdapter.ts` projects instances, builds portfolio funding, calls per-product simulators, tags results by `instanceId`, and `src/app/portfolioState.ts` exposes the combine-mode workspace operations, with matching adapter/state tests. This issue appears shipped; remaining Group G defects live under `.scratch/group-g-qa/issues/`.

The original draft proposed calling `simulateRetirementComparison` per instance. That would have produced 6× the expected number of product results per instance (the registry loops every product), preserved compare-mode's fair-comparison invariant via `ctx.bavFunding`, and made multi-instance bAV cap aggregation impossible. Revised post-feedback to project + per-product-simulator-direct-call.
