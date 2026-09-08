# Property tests and the mutation pilot

Issue #378. Two additions to the assurance layer, both additive — no engine
code changed, no oracle goldens touched:

1. **Constrained property suites** (`fast-check`, dev dependency) for the four
   combine-mode math modules, plus deterministic boundary matrices in the same
   files.
2. **A focused Stryker mutation pilot** for income classification
   (`src/engine/tax.ts`) and allowance apportionment
   (`src/engine/portfolioAllowance.ts`).

## Property suites

| File | Module | Properties |
|------|--------|------------|
| `src/engine/portfolioAllowance.property.test.ts` | §20 Abs. 9 EStG cross-ETF allowance | A1–A8: budget ≤ cap, non-negativity, slack exactness, proportionality when binding, order invariance, determinism, reference-model agreement, two-ETF end-to-end through `simulatePortfolio` |
| `src/engine/portfolioFunding.property.test.ts` | Cross-instance funding caps | F1–F7: bAV §3 Nr. 63 cap + headroom reconciliation, Basisrente Schicht-1 headroom, Riester §10a per-year cap, AVD per-contract cap, household-salary reconciliation, order invariance (proportional channels), determinism |
| `src/engine/portfolioTransfer.property.test.ts` | Transfer events | T1–T5: calendar↔contract year model, host-instance routing, certified tax-neutrality, surrender proceeds conservation + cost-basis mirror, determinism |
| `src/engine/portfolioCombine.property.test.ts` | `combinePortfolio` aggregation | C1–C7: household net reconciliation, non-negativity, channel-sum reconciliation, per-instance net identity, ETF pass-through, determinism, degenerate boundaries |

### Discipline

- **Generators stay inside the documented valid domains** — non-negative finite
  contributions and demands, structurally valid workspaces built by
  `migrateV1ToV2`, aligned array lengths. Generators never emit out-of-domain
  values.
- **Invalid domains and boundaries are covered separately**, by deterministic
  `it.each` matrices at the bottom of each file — never by generation.
- **No broad monotonicity assertions.** Each property names its precondition
  (e.g. "when the allowance binds", "for non-ETF instances").
- **Fixed seeds.** Every `fc.assert` pins `seed: FC_SEED + n` with
  `FC_SEED = 378`, so a failure reproduces exactly and fast-check shrinking
  reports a minimal counterexample.
- **Real interfaces only.** Properties drive `buildPortfolioFunding`,
  `simulatePortfolio`, `buildCombineContext`, `combinePortfolio` — no engine
  mocks.
- **Runtime:** the four files add roughly one second to `npm test`; they run
  inside `npm run verify`.

### Deliberately not property-tested

- **Riester order invariance** (excluded from F6): the allowance-recipient
  allocation is max-selection with array-order tie-breaks by design, not
  proportional. Example tests pin it.
- **Out-of-domain guards** (e.g. the `yearIdx` bounds in
  `calculateEtfAllowanceDemand`): unreachable from valid domains, so they are
  pinned by example-based tests instead.

## Mutation pilot

```bash
npm run mutation:pilot
```

Stryker 10 (`stryker.pilot.json`), not part of `npm run verify`. Runtime is
roughly half a minute. Scope is two modules: `src/engine/tax.ts` and
`src/engine/portfolioAllowance.ts`. The test window is narrowed via
`vitest.stryker.config.ts` to the three files that cover them, which keeps each
mutant's run fast. The JSON report lands in
`reports/mutation/mutation.json` (gitignored).

### What the pilot demonstrates (all killed)

- **Changed comparison operators:** `x > basicAllowance`,
  `x > firstProgressionEnd`, `x > secondProgressionEnd` (§32a zone routing),
  `x >= topTaxStart` (proportional/top-zone routing),
  `activeEtf.length <= 2` and `>= 2` (re-run gating),
  `totalDemand > 0` and `totalDemand > fullAllowance` (apportionment branch
  selection).
- **Missing allowances:** `x + basicAllowance` and `x + firstProgressionEnd`
  (Grundfreibetrag added instead of subtracted), plus the Sparerpauschbetrag
  sign flip in `calculateCapitalGainsTax` — killed by the direct unit block in
  `tax.test.ts` added with this issue (that function previously had no direct
  test in the window).
- **Double / negated factors:** `* y → / y` in both tariff zones,
  `(x − basicAllowance) * progressionDenominator`,
  `fullAllowance / (dem[y] / totalDemand)` and `dem[y] * totalDemand` in the
  proportional allocation, `totalDemand -= dem[y]`.

### Baseline numbers (this branch)

| File | Mutants | Killed (+timeout) | Survived | Score |
|------|---------|-------------------|----------|-------|
| `tax.ts` | 62 | 54 | 8 | 87.1 % |
| `portfolioAllowance.ts` | 141 | 88 | 52 (+1 no-coverage) | 62.4 % |
| **Total** | 203 | 142 | 60 (+1 no-coverage) | **69.95 %** |

### Survivors — classified, not chased

The issue sets no blanket score target. Every baseline survivor falls into one
of four classes:

1. **Equivalent by law** (`tax.ts:24,28,33,38`): `<=` ↔ `<` at §32a zone
   boundaries. The tariff is constructed to mesh — at the boundary value both
   branches return the same tax (pinned by the continuity test in
   `tax.test.ts`). No input distinguishes them.
2. **Equivalent by composition** (`tax.ts:61`, three mutants): the early
   return in `calculateSolidarityTax` is dead code — the
   `Math.max(0, Math.min(regular, transition))` below it already returns 0 at
   and below the Freigrenze. Removing the guard changes nothing for any input.
3. **Equivalent within the valid domain** (`portfolioAllowance.ts:92,102,141,143`,
   plus the `'single'` default-param sentinel at `tax.ts:54`): bounds guards
   are unreachable with aligned arrays; with non-negative demands,
   `totalDemand <= 0` vs `< 0` writes zeros either way; `<=` vs `<` at the
   apportionment equality boundary allocates the demand either way.
4. **Unasserted in the pilot window** (the remaining ~38, all in
   `portfolioAllowance.ts:189–250`): the ETF re-run orchestration payload —
   provenance labels, evidence maps, retirement-age arithmetic, per-scenario
   gating. Exact values there are pinned by the `portfolioAdapter` /
   `portfolioProjection` / oracle suites, which sit outside the pilot's
   narrowed test window. These are coverage-scope survivors, not suspected
   defects.

When a future change makes a new mutant survive, check it against these four
classes before writing more tests. Class 4 survivors are only worth killing if
the assertion lives in the window's three test files anyway; classes 1–3 are
not killable at all.

## Pitfalls

- Stryker sandboxes live in `.stryker-tmp/` inside the repo. vitest's default
  include globs would sweep them up and run *mutated* code as part of a normal
  `npm test` — `vite.config.ts` excludes `**/.stryker-tmp/**`; keep that
  exclusion.
- `.stryker-tmp/` and `reports/` are gitignored; delete them freely.
- If a property in one of the three covering files gets expensive, per-test
  coverage analysis keeps mutant runs proportional to the tests that actually
  cover the mutated line — but keep `numRuns` modest regardless. The pilot is
  a smoke detector, not a full-mutation programme.
