# Portfolio / schema design note

**Status.** Historical reference for the singleton-to-instance migration
(`schemaVersion: 1 → 2`). Originally written as a pre-implementation design note
to lock in baseline-vs-what-if semantics, instance-id stability, share-URL /
localStorage compatibility, and the first portfolio adapter shape **before** any
combine-mode code landed. The migration shipped; this note is the binding
record of the invariants and is authoritative for any future change that
touches schema, persistence, or the adapter.

**Why it still matters.** Schema decisions made up front (additive `mergeDeep`
migration, deterministic `${productId}-singleton` ids, `Workspace.baseline`
pinning, length-1 array adapter wrapping for byte-identical singleton paths)
are now baked into `storage.ts`, `scenarioSchema.ts`, `portfolioAdapter.ts`,
and the share-URL layer. Any deviation needs to update this note and demonstrate
that legacy v1/v2 saved states still round-trip.

**Out of scope here.** UI flows for inventory wizards, recommendation ranking,
decision views, household mode — those build on top of the schema and ship as
their own work.

---

## 1. Baseline vs. what-if semantics

A **baseline** is the user's current portfolio: the contracts they
actually hold today, the gross-conversion they actually pay, the fees
their contract actually charges.

A **what-if** is a derived scenario: "what if I add 200 EUR/month to my
ETF?", "what if I pause Riester and start AVD instead?", "what if I take
a 10 k bonus into Basisrente?". A what-if is always **defined relative
to a baseline** — it inherits everything except the explicit deltas.

### Schema

A `Workspace` carries one baseline plus zero or more what-if scenarios:

```ts
interface Workspace {
  schemaVersion: 2                   // bumped from CURRENT_VERSION = 1
  baseline: Scenario                 // the user's current state
  whatIfs: WhatIfScenario[]          // derived deltas
  pinnedComparisonIds: string[]      // ordering of cards in the comparison view
}

interface Scenario {
  id: string                         // stable; uuid-style
  label: string                      // user-facing name ("Baseline 2026", "Plan A", ...)
  profile: PersonalProfile           // unchanged shape
  assumptions: ScenarioAssumptions   // changes: see §2
  createdAt: string                  // ISO timestamp, for ordering
  origin: 'baseline' | 'manual' | 'recommender'
}

interface WhatIfScenario extends Scenario {
  derivedFromBaselineId: string      // baseline.id at the time the what-if was created
  // The what-if is materialised as a full Scenario, not a delta. The
  // baselineId pointer is kept for "what changed" diffs in the result panel
  // and for re-baselining when the user updates the baseline.
}
```

### Why materialised, not delta

We considered storing what-ifs as patches on top of the baseline. This is
attractive ("what changed" is literally the patch) but brittle: any
baseline update silently shifts every what-if it underlies, the schema
must encode arbitrary nested patches, and validating a patch shape is
harder than validating a full scenario.

A materialised what-if is a copy of the baseline at fork time plus the
user's edits. The "what changed" diff is computed at read time from the
two materialised states, not stored. A baseline edit does not implicitly
mutate any what-if. The user can opt-in to "re-base on current baseline"
explicitly — this is a clear UX action, not a hidden side effect.

### Diff for the result panel and exports

A small pure helper `diffScenario(a: Scenario, b: Scenario): ScenarioDiff`
compares the two materialised states and emits a typed list of changes
(profile fields, per-product instance arrays, returnScenarios). It lives
in `src/app/scenarioDiff.ts` (planned, not yet implemented). Exports
embed the diff in PDF/CSV alongside the existing tables.

---

## 2. Stable per-instance ids and per-product instance arrays

Compare-mode (`STORAGE_KEY_V1`): each product is a singleton on
`ScenarioAssumptions` (e.g. `assumptions.bav: BavAssumptions`). The user has at
most one bAV.

Combine-mode (`STORAGE_KEY_V2`): the user can have multiple
bAV/pAV/Riester/ETF/AVD contracts side-by-side, each with its own contract
vintage, paid-up flag, provider fees.

### Schema

```ts
interface ScenarioAssumptions {
  // Unchanged: scenario-level fields (returnScenarios, monteCarlo,
  // visibleProducts, retirementEndAge, inflationRate).
  ...

  // New: per-product instance arrays. Singletons remain valid by being
  // arrays of length 0 or 1.
  etf: EtfInstance[]
  bav: BavInstance[]
  insurance: InsuranceInstance[]
  basisrente: BasisrenteInstance[]
  altersvorsorgedepot: AltersvorsorgedepotInstance[]
  riester: RiesterInstance[]

  // Removed: singleton fields `bav`, `etf`, `insurance`, `basisrente`,
  // `altersvorsorgedepot`, `riester`. The post-2 schema does not carry
  // legacy keys at the top level.

  // Unchanged: statutoryPension stays a singleton (one pension entitlement
  // per profile), with a new `versorgungswerkOrBeamten` instance shape if
  // the household-mode work surfaces it.
  statutoryPension: StatutoryPensionAssumptions
}

interface InstanceCommon {
  /**
   * Stable contract instance id. Required, never re-assigned. Used as a
   * primary key in result rows, share URLs, the comparison picker, and
   * recommendation reasons.
   *
   * Format: `${productId}-${random8}` (e.g. `bav-7f2a91c4`). Matches the
   * `${Date.now()}-${random5}` library id format for symmetry.
   */
  instanceId: string
  /**
   * User-supplied label, defaulting to a localised product name plus a
   * disambiguator if multiple instances exist (e.g. "bAV Allianz",
   * "bAV alter Vertrag"). Not unique; the id is the unique key.
   */
  label: string
  /**
   * `active` = currently being funded; `paid_up` = no further contributions
   * but capital still grows; `surrendered` = stopped, capital realized.
   * Drives whether the funding loop runs and whether the existing
   * paidUpScenario / surrender semantics apply.
   */
  status: 'active' | 'paid_up' | 'surrendered'
  /**
   * Source confidence for downstream UX (Tier-2 evidence states). Either a
   * statement-derived value, a user-confirmed value, or a model estimate.
   */
  evidence?: 'statement' | 'user_confirmed' | 'model_estimate'
  /**
   * Calendar-year start of the contract. Required for vintage-aware tax
   * routing (pre-2005 pAV, §40b a.F. bAV, etc.). Defaulted to current year
   * for new contracts on the inventory path.
   */
  contractStartYear: number
  /**
   * Optional household-attribution field (deferred to household mode).
   */
  ownedBy?: 'self' | 'partner'
}

interface EtfInstance extends InstanceCommon, EtfAssumptions {}
interface BavInstance extends InstanceCommon, BavAssumptions {}
// ... etc per product
```

### Singleton-to-instance migration

`storage.ts/parseStateFromJson` runs in this order:

1. Detect `schemaVersion`. Version 1 = pre-Group-G singleton; Version 2 =
   instance-array.
2. If version 1, the existing migration block runs (annualAssetFee,
   payoutMode = zeitrente → leibrente, returnScenarios, legacy
   extraEmployerContribution\*).
3. **New step**: convert each singleton product field into a length-1
   array carrying `{ instanceId: deterministicHash(productId), label:
   productMetadata.label, status: 'active', evidence: 'user_confirmed',
   contractStartYear: rules.year, ...singletonFields }`. Empty / default
   product configurations migrate to a length-0 array.
4. The migrated structure is treated as version 2 from then on.
5. `validateState` runs against the version-2 schema.

**Stable id on migration.** The default migrated id is deterministic
(`${productId}-singleton`) so that share URLs from version 1 produce the
same instance id every time, allowing version-2 share URLs to reference
them safely.

### Adapter shape

`SimulationContext` and the per-product simulators read singletons. The
adapter (`src/engine/portfolioAdapter.ts`, since split into focused modules —
see `CONTEXT.md`) keeps the math layer untouched:

```ts
// src/engine/portfolioAdapter.ts (planned)
interface PortfolioAdapter {
  /**
   * For each product type, iterate over instances, run today's simulator
   * once per instance with the instance's specific assumption fields,
   * and return a flat ProductResult[] keyed by instanceId.
   */
  simulate(
    profile: PersonalProfile,
    assumptions: ScenarioAssumptions,
    rules: GermanRules,
  ): SimulationResult & {
    perInstance: Record<string /* instanceId */, ProductResult[]>
  }
}
```

The adapter calls `simulateRetirementComparison` once per instance with a
"singleton-shaped" view (the existing call signature). This means the
existing engine and integration tests remain green throughout the
migration — the adapter is a routing layer, not a math change.

Aggregation across instances (e.g. "household retirement income") happens
above the adapter, in `useSimulationViewModel`, and is a separate Group-G
concern (P1 "Portfolio-combination simulation").

### Test invariant

The integration snapshot test seeds a length-1-array workspace for the
default profile and asserts that every per-instance ProductResult is
byte-identical to the legacy singleton output. As soon as the migration
lands, the integration golden numbers stay locked.

---

## 3. Share-URL and localStorage compatibility

### Storage keys

| Key | Pre-Group-G | Post-Group-G |
|---|---|---|
| `rentenrechner-state-v1` | singleton state | **abandoned**: writers stop emitting this key |
| `rentenrechner-state-v2` | (none) | new key; write target |
| `rentenrechner-library-v1` | flat saved scenarios | **migrated** by the new validator (see §4) |
| `rentenrechner-guided-setup-v1` | unchanged | unchanged |
| `disclaimer-dismissed` (sessionStorage) | unchanged | unchanged |

`loadSavedState` reads `v2` first, then falls back to `v1` with the
singleton-to-instance migration applied. After a successful migrate, the
next save overwrites `v2` and removes `v1` so we don't fight stale
caches. New keys are co-versioned (`v2`) so future major schema changes
can repeat the pattern without ambiguity.

### Share URLs

The URL `?s=` payload is the same `buildStateJson` output as
localStorage, so it inherits the migration path.

**Forward compatibility window.** Until 2027-01-01, share URLs may carry
either v1 or v2 payloads. The migration is idempotent and runs on every
parse. After 2027-01-01 we may remove the v1 path; tests must keep at
least one round-trip case for v1 → v2 until then.

**Stable instance ids in share URLs.** The deterministic
`${productId}-singleton` id from the migration ensures that v1 share
URLs always produce the same v2 instance id, and a v2 share URL with
explicit ids round-trips losslessly.

### Validation order

Pre-Group-G:
1. JSON.parse
2. `mergeDeep` against `defaultAssumptions`
3. legacy field migrations (annualAssetFee, returnScenarios, etc.)
4. `validateState`

Post-Group-G:
1. JSON.parse
2. **Schema-version branch**: if v1, run singleton-to-instance migration → v2
3. `mergeDeep` against `defaultWorkspace` (instance-aware)
4. `validateState` (instance-aware)

The migration must run **before** `mergeDeep` so the merge sees
correctly-shaped instance arrays.

---

## 4. Paid-up and existing-contract representation

Compare-mode singleton: paid-up is a flag (`InsuranceAssumptions.paidUpAge`)
that triggers a two-phase accumulation. Surrender is separate.

Combine-mode instance:

- `InstanceCommon.status` is the canonical paid-up / surrendered indicator.
- Existing per-product paid-up fields (`paidUpAge`, `surrenderHaircutPct`)
  remain on the per-product instance type and are read only when
  `status === 'paid_up'` or `status === 'surrendered'`. They become
  ordinary instance fields, not implicit triggers.
- New existing-contract fields land on `InstanceCommon` so every product
  inherits them: `contractStartYear` (already required), `evidence`
  ('statement' | 'user_confirmed' | 'model_estimate'), and a
  `currentValueEUR?` (snapshot of the contract value provided by the
  user, used as accumulation `initialCapital`).

The vintage-aware branches (pre-2005 pAV, §40b a.F. bAV, post-2008
Riester children) read `contractStartYear` directly from the instance,
removing the implicit "vintage = current default" assumption.

### Surrender semantics

Surrender produces a one-off after-tax cash event in the year the user
sets it. The existing `surrenderValue` math is preserved; what changes is
the trigger (`status === 'surrendered'` plus a `surrenderYear`) instead of
two separate booleans. This unifies the four "what happens to my contract
next" decisions (continue / paid-up / surrender / transfer) under one
status field with mode-specific extra fields.

---

## 5. Rollout sequence (historical record)

The migration shipped in this order. The schema in this note stayed stable
through steps 1–4; later work added fields but did not rename any keys above.

1. **Schema + migration only.**
   - `Workspace` shape, `schemaVersion: 2`, instance-array fields,
     migration in `storage.ts`, validator in `scenarioSchema.ts`.
   - **No UI changes.** The adapter wrapped the singleton-shaped state into
     a length-1 array internally and unwrapped before calling existing
     simulators.
   - Integration tests stayed byte-identical green.

2. **Inventory wizard** + per-instance UI.
   - Allowed the user to add a second instance for any product type.

3. **Baseline pinning + diff.**
   - Added `Workspace.baseline` semantics; UI for "save as baseline",
     "compare to baseline", "what changed".

4. **Multi-instance aggregation.**
   - Cross-instance KV/PV apportionment, combined retirement-income
     waterfall. The adapter grew a `combineAcrossInstances()` step.

5. **Recommender.**
   - Reads the workspace, ranks "next-EUR-X" what-ifs against the baseline.

---

## 6. Open questions deferred to implementation PRs

- **Unique instance labels.** Should the inventory wizard force unique
  labels per product type? Decision deferred — the id is the canonical
  key and labels can collide.
- **Per-instance scenario visibility.** `assumptions.visibleProducts` is
  product-level today. With multiple instances, do we need
  `visibleInstanceIds`? Deferred — combine-mode UI surfaces all instances by
  default, with hide/show driven from `InstanceCommon.status`
  (`active` / `paid_up` / `surrendered` / `offered`).
- **Cross-instance share URL size.** A workspace with 5 bAV + 3 pAV +
  2 Riester instances will inflate the URL payload. We may need a
  lossless compression layer (e.g. msgpack + base64url) before the
  payload exceeds ~2 kB. Defer until measured; the share URL today is
  already base64url-encoded JSON.
- **Versorgungswerk / Beamten as instance.** Today
  `StatutoryPensionAssumptions` is a singleton. Household mode will
  surface the case where one partner has GRV and the other has a
  Versorgungswerk. Schema-shape decision deferred until household mode
  begins.
