# ADR-0003 — Narrow per-product calculation contexts, starting with ETF

**Status:** Accepted
**Date:** 2026-09-09
**Deciders:** Peter Hartwieg

---

## Context

Every product simulator takes the full `SimulationContext`
(`src/engine/simulationContext.ts`): profile, rules, the complete six-product
`ScenarioAssumptions`, pre-computed funding results (bAV two-pass, Basisrente,
AVD, Riester), GRV projection, lump-sum tax modes, plus the combine-mode
add-ons (market path, per-instance capital policy, per-instance cost
overrides, shared saver allowance).

That shape is correct for products whose math depends on household funding,
but it forces the combine-mode adapter into a wasteful and error-prone dance
for products that need none of it. ETF — the clearest case — reads only
profile, rules, its own assumption slice, the payout horizon, an explicit
monthly amount, the market path, the capital policy, and the saver-allowance
callback. Yet `simulatePortfolio` had to, per ETF instance:

1. reconstruct a full six-product singleton via
   `projectInstanceToScenarioAssumptions` (five of six slots neutralised), and
2. run `buildContext`, which computes the bAV two-pass funding, insurance and
   bAV lump-sum tax modes, Basisrente/AVD/Riester funding, and the GRV
   projection — all derived from **fake** neutralised inputs and all discarded
   by the ETF simulator.

The allowance re-run in `portfolioAllowance.ts` repeated both steps, so the
§20 Abs. 9 EStG shared-allowance pass re-computed the same discarded funding a
second time. Nothing depended on those numbers; the only thing they guaranteed
was that a future ETF change could silently start reading neutralised junk.

## Decision

ETF is migrated to a **narrow typed calculation context**, defined and built
in `simulationContext.ts` so the context layer stays the single home for
simulation inputs:

- `EtfCalculationContext` — the closed input set of the ETF math:
  `profile`, `rules`, `assumptions: EtfCalculationAssumptions`
  (`etf` slice + `inflationRate` + `retirementEndAge`), derived
  `yearsToRetirement`, explicit `monthlyUserCost`, and the three optional
  per-instance add-ons (`marketReturnPath`, `instanceCapitalPolicy`,
  `saverAllowanceOverride`).
- `buildEtfCalculationContext(input)` — the explicit-input builder (combine
  path). `yearsToRetirement` is derived here with the same formula
  `buildContext` uses, so the adapters cannot drift.
- `etfContextFrom(ctx)` — adapter from the full `SimulationContext` (compare
  path). This is where the fair-comparison invariant now lives for ETF:
  `ctx.etfMonthlyUserCostOverride ?? ctx.bavFunding.monthlyNetCost`.
- `products/etf.ts` exports `simulateEtf(ctx: EtfCalculationContext, …)` as
  the implementation and keeps `simulate(ctx: SimulationContext, …)` as a thin
  adapter so `PRODUCT_REGISTRY`, `simulateRetirementComparison`, and
  `runMonteCarlo` keep their `(SimulationContext, scenario)` signature —
  no registry or compare-mode entry changes.

Both entry points converge on `simulateEtf`: compare mode through the adapter,
combine mode (initial pass **and** allowance re-run) through
`buildEtfCalculationContext` with the instance's real contribution, capital
policy, and allowance schedule. `applyCrossInstanceSparerpauschbetrag` now
receives an injected `resimulateEtfInstance` callback instead of assembling
contexts itself, so there is exactly one place that builds the per-instance
ETF simulation.

Shared helpers were narrowed **structurally** (no call-site changes for the
other five products):

- `buildProductResult` params take `PayoutHorizonAssumptions`
  (`inflationRate` + `retirementEndAge`) instead of the full
  `ScenarioAssumptions` — the only fields it ever read.
- `marketReturns.ts` helpers take a `MarketReturnContext`
  (`marketReturnPath` + `instanceCapitalPolicy`) — the only fields they read.

The invariant "product simulators must not call funding helpers directly"
(P1 review rule) is preserved and made stronger: the ETF simulator receives
**no** funding input at all, and the context layer (not the simulator) decides
where amounts come from.

## Parity

Behavior is preserved, pinned by `src/engine/etfContextParity.test.ts` against
`src/engine/etfContextParity.fixture.ts` — values frozen from the engine
**before** the migration (compare mode default + Beitragsdynamik variant; a
combine workspace with three ETF instances including a paid-up contract,
certified and `surrender_reinvest` transfers, joint assessment; a seeded
Monte-Carlo run), asserted at full float precision. Neither engine nor fixture
rounds; the comparison keeps structure, strings, booleans, every frozen
integer and every structural zero exact and tolerates only last-digit float
drift — 64 `Number.EPSILON` units relative (≈1.4e-14, i.e. ~14 significant
digits; ~19 units observed) with a 1e-9 € absolute floor for cancellation
residuals — because identical double operations involving `Math.pow` are not
bit-reproducible between macOS and Linux/Node 22. The scenario-report suite reproduces its captured baseline
unchanged.

One subtlety is documented rather than changed: a combine-mode ETF instance
without `monthlyContribution` previously fell through to
`bavFunding.monthlyNetCost` computed from the **neutralised** bAV projection,
which is exactly `0`. The narrow path hardcodes `monthlyContribution ?? 0`;
the equivalence is pinned by a test in both `portfolioAdapter.test.ts`
(fallback contract) and the parity suite (neutralised anchor is 0).

## Remaining compatibility work (honest list)

- **Five products still on the full context.** bAV, private insurance,
  Basisrente, AVD, and Riester genuinely consume funding results, so they keep
  `SimulationContext` and the `runFor` six-product projection +
  `buildContext` pre-pass. Migrating them one at a time means defining their
  narrow input sets (each needs the household funding slice they actually
  read) and repeating the freeze-then-migrate pattern used here.
- **`SimulationContext` still carries ETF-specific fields.**
  `etfMonthlyUserCostOverride` and `etfSaverAllowanceOverride` (and their
  `BuildContextOverrides` counterparts) are now consumed only via
  `etfContextFrom`. They stay until the last full-context consumer that can
  legitimately receive them disappears; removing them earlier would break the
  compare-mode entry that still runs through the full context.
- **Monte Carlo still spreads the full context** (`{ …baseContext,
  marketReturnPath }`). Once every product has a narrow context, `runMonteCarlo`
  should build narrow contexts per product instead.
- **`simulatePortfolio` returns are unchanged.** `perInstance` /
  `portfolioFunding` shapes, evidence tagging, paid-up handling, transfer
  principal/cost-basis semantics, and RIY behavior are intentionally
  untouched; no consumer (storage, share-URL, dashboards, exports) needed
  changes.

## Consequences

- The ETF per-instance path no longer allocates or computes six-product
  funding; combine-mode runs with ≥2 ETF instances no longer do the work
  twice (initial pass + allowance re-run).
- The set of inputs that can influence ETF results is closed and visible in
  one type; silent coupling to neutralised unrelated-product state is now a
  type error, not a code-review catch.
- New products default to `SimulationContext` until their funding needs are
  understood; narrowing is an incremental, per-product decision with a
  proven parity recipe.
