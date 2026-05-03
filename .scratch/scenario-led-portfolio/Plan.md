# Plan — Scenario-led portfolio redesign (Group G)

Status: draft, open for feedback. Source decisions in `decisions.md`. Capability references (Fxx, Gxx, Sxx, Lxx) point to `PRD.md`.

## 1. Architecture principles

These trump local optimisation. If a slice tempts breaking one, escalate.

- **A1. One engine, two orchestrations.** The per-product simulators in `src/engine/products/*.ts` and the tax + KV/PV pipelines stay unchanged. Group G adds a `PortfolioAdapter` for combine-mode and an `EqualInputComparator` for compare-mode equal-input sub-mode. No fork. **The adapter does NOT call `simulateRetirementComparison` per instance** (that would multiply by the registry × scenarios). It projects each instance to a singleton-shaped `ScenarioAssumptions`, then calls the relevant per-product simulator directly. See §3 for the module shape.
- **A2. Schema is the spine.** Singleton-to-instance migration (`schemaVersion 1 → 2`) is the first slice. Every other slice depends on the schema being stable. The migration must keep external oracle goldens byte-identical (length-1 array round-trip via the projection).
- **A3. Materialised what-ifs, with an immutable baseline snapshot per fork.** A what-if scenario carries (a) a full materialised copy of its current state plus (b) `derivedFromBaselineSnapshot: Scenario` — a frozen copy of the baseline at the moment of fork. Baseline edits mutate `Workspace.baseline` in-place but do not mutate any what-if. The user's deltas (the diff between the what-if's current state and its frozen snapshot) are recoverable for re-base. Re-base is "discard the snapshot, re-fork from the new baseline, re-apply the diff". Source: `portfolio-schema-design.md` §1, refined post-grilling.
- **A2a. V2 type boundary.** The new `WorkspaceAssumptionsV2` type carries instance arrays. The legacy engine `ScenarioAssumptions` (`src/domain/results.ts`) **stays singleton-shaped**. The adapter projects each instance into a `ScenarioAssumptions`-compatible singleton at the per-instance call site, so existing simulators / `buildContext` / the registry stay untouched. This avoids a full engine refactor in M1 and keeps oracle goldens byte-identical via the projection.
- **A4. Display-layer rounding only.** Engine returns floats. Statutory rounding only where law requires (`floorEuro(zvE)`). Display via `formatCurrency` / `formatPercent` / `<NumberField decimals=...>`. Source: existing project convention (CLAUDE.md "UI rounding boundary").
- **A5. Rules-engine atoms, not free strings.** `src/app/recommendations.ts` emits structured atoms `{ id, priority, context }`. Per-atom German templates render text. Bilingual support (P2) swaps the table.
- **A6. Per-instance evidence flags are first-class.** Every value typed or accepted by the user carries `evidence: 'user_confirmed' | 'model_estimate' | 'statement'`. Derived results carry the lowest-confidence flag of their inputs.
- **A7. Compare-mode and combine-mode share the schema.** Workspaces are tagged `mode: 'compare' | 'combine'`. Compare-mode workspaces use length-1 instance arrays per product. Combine-mode uses any-length arrays.

## 2. Schema design

The schema design in `docs/portfolio-schema-design.md` stands. Below: clarifications and additions arising from the grilling.

### 2.1 Workspace shape (post-migration)

```ts
interface Workspace {
  schemaVersion: 2
  mode: 'compare' | 'combine'           // NEW (Q1.1, Q1.3): mode-as-workspace-property
  baseline: Scenario                    // combine-mode only; compare-mode workspaces ignore
  whatIfs: WhatIfScenario[]             // combine-mode only
  pinnedComparisonIds: string[]         // ordering of cards in the comparison view
}

interface Scenario {
  id: string                            // uuid-style
  label: string
  profile: PersonalProfile              // unchanged shape (partner? added in P2)
  partner?: PersonalProfile             // NEW (Q5): pre-baked schema slot, undefined in P1
  assumptions: WorkspaceAssumptionsV2   // see §2.2 (V2 boundary) and §2.3 (instance arrays)
  createdAt: string                     // ISO
  origin: 'baseline' | 'manual' | 'recommender'
}

interface WhatIfScenario extends Scenario {
  derivedFromBaselineId: string
  derivedFromBaselineSnapshot: Scenario   // frozen copy at fork time; required for re-base
}
```

Compare-mode workspaces use the same `Workspace` shape; the `baseline` field carries a single comparator scenario, and `whatIfs` is empty. The mode tag tells the orchestration layer which path to take.

The `derivedFromBaselineSnapshot` is the load-bearing change. Without it, edit-baseline-in-place destroys the original baseline state and re-base becomes impossible (the user's deltas are no longer recoverable as a diff). With it, re-base = discard snapshot, re-fork from current baseline, re-apply the diff between the what-if and its old snapshot.

### 2.2 V2 type boundary

`ScenarioAssumptions` (`src/domain/results.ts`) carries singleton product fields today:

```ts
// Existing — unchanged through Group G.
interface ScenarioAssumptions {
  bav: BavAssumptions      // singleton
  etf: EtfAssumptions      // singleton
  insurance: InsuranceAssumptions
  basisrente: BasisrenteAssumptions
  altersvorsorgedepot: AltersvorsorgedepotAssumptions
  riester: RiesterAssumptions
  // ...scenario-level fields
}
```

Group G introduces a parallel V2 type for the workspace:

```ts
// New — instance arrays per product.
interface WorkspaceAssumptionsV2 {
  bav: BavInstance[]
  etf: EtfInstance[]
  insurance: InsuranceInstance[]
  basisrente: BasisrenteInstance[]
  altersvorsorgedepot: AltersvorsorgedepotInstance[]
  riester: RiesterInstance[]
  // ...scenario-level fields, same as today
  statutoryPension: StatutoryPensionAssumptions   // stays singleton
  inflationRate: number
  retirementEndAge: number
  returnScenarios: ReturnScenario[]
  monteCarlo: MonteCarloAssumptions
  visibleProducts: ProductId[]                    // compare-mode only
  visibleInstanceIds?: string[]                   // combine-mode only (Q5 deferred field)
  compareSubMode?: 'equal_cash' | 'equal_input'   // compare-mode only
}
```

**`ScenarioAssumptions` is NOT mutated to arrays.** It stays singleton-shaped so the per-product simulators (`src/engine/products/*.ts`), the registry (`PRODUCT_REGISTRY`), `buildContext`, and existing oracle goldens stay untouched.

The `PortfolioAdapter` (§3) projects each instance into a singleton-shaped `ScenarioAssumptions` at the per-call site:

```ts
function projectInstanceToScenarioAssumptions(
  instance: BavInstance,                          // or any other instance type
  workspace: WorkspaceAssumptionsV2,              // for scenario-level fields
): ScenarioAssumptions {
  // Returns a singleton-shaped assumptions object where the named instance
  // sits in its product's slot, other product slots are zeroed/defaulted.
}
```

This keeps M1 strictly schema-only: no engine refactor, no simulator signature changes, no oracle drift. The full engine migration to instance-aware simulators is **explicitly deferred** to a hypothetical V3 (post-Group-G; not on the BACKLOG).

### 2.3 Per-product instance arrays

Source: `portfolio-schema-design.md` §2. Verbatim, with several additions:

```ts
interface InstanceCommon {
  instanceId: string                    // ${productId}-${random8}; deterministic singleton-id on migration
  label: string                         // user-supplied label (defaults to product label + disambiguator)
  anbieter?: string                     // free-text provider/Tarif note ("Allianz Direktversicherung", "alter Vertrag")
  status: 'active' | 'paid_up' | 'surrendered'
  contractStartYear: number             // required for vintage-aware tax routing (pre-2005 pAV, §40b a.F. bAV, post-2008 Riester)
  currentValueEUR?: number              // user-snapshot of contract value; wires to AccumulationInput.initialCapital
  evidenceMap: Record<string, EvidenceState>   // per-value evidence; see §2.4
  ownedBy?: 'self' | 'partner'          // (Q5) pre-baked schema slot, defaulted 'self' in P1
  transferEvents?: TransferEvent[]      // (Q7.a) certified transfers + surrender+reinvest events; see §2.5
}

// See §2.5 for the discriminated-union TransferEvent definition.
```

Per-product instance types extend `InstanceCommon` and the existing per-product assumption types (`EtfInstance extends InstanceCommon, EtfAssumptions { ... }` etc.). The per-product assumption types (`BavAssumptions`, `EtfAssumptions`, ...) **stay singleton-shaped** — see §2.2.

### 2.4 Per-value evidence

The `evidence` flag was singular per instance in the schema doc. Group G upgrades it to per-value:

```ts
// Per-value evidence is a Map<fieldPath, EvidenceState>
// where fieldPath uses dot-notation, e.g. "fees.wrapperAssetFee", "rentenfaktor", "currentValueEUR".
type EvidenceState = 'user_confirmed' | 'model_estimate' | 'statement'
```

**Default for missing entries: `model_estimate` (conservative).** A field absent from `evidenceMap` is treated as a model estimate, not a confirmed value. This protects PRD G1: migrated singletons (where the user never explicitly typed a value into the field, even if the singleton legacy field carries a number) and any newly-added field default to "🤔 Schätzung" until the user confirms.

The migration in §2.6 sets every field's evidence to `model_estimate` for legacy state, since we cannot know which numbers the user originally typed and which they accepted as defaults.

Derived results inherit the lowest confidence of inputs (PRD G1). A small helper `lowestConfidence(evidenceMap, fields[])` lives in `src/app/evidence.ts` (planned). Missing entries count as `model_estimate` for the lowest-confidence calculation.

### 2.5 TransferEvent shape

Two distinct event kinds, discriminated by `type`:

```ts
type TransferEvent =
  | {
      type: 'certified'                 // §3 Nr. 55 EStG / AltZertG-subsidised transfer
      year: number
      sourceInstanceId: string          // for symmetry / lookup; redundant when stored on source
      targetInstanceId: string
      amountEUR: number                 // partial supported; capped at source capital at the time
    }
  | {
      type: 'surrender_reinvest'        // taxable surrender of source + reinvestment into target
      year: number
      sourceInstanceId: string
      targetInstanceId: string
      amountEUR: number                 // gross surrender amount before haircut and tax
      surrenderHaircutPct: number       // contract-specific Stornoabzug (already on existing pAV)
      // Cost basis on the target resets at the after-tax proceeds; tax handling
      // routes through the source instance's existing surrender path (insurance:
      // pre2005 / halbeinkuenfte / abgeltungsteuer; bAV: §22 Nr. 5 EStG / Fünftelregelung).
    }
```

**Tax-routing rules:**

- `certified`: Riester→AVD, bAV→bAV between providers under AltZertG / §3 Nr. 55. NOT a taxable event. Cost basis preserved on the target. Source instance retains its tax privileges on the residual capital.
- `surrender_reinvest`: pAV→ETF, Riester→ETF (subsidy clawback applies — leave clawback math to the existing engine path), bAV→ETF. Source pays the surrender tax in the year of transfer; target receives after-tax + post-haircut proceeds as a `capitalInjection`.

**Compatibility validator** (in `scenarioSchema.ts`): rejects illegal pairings (e.g. AVD→Riester is forbidden under AltZertG; ETF→bAV would require a §3 Nr. 63 contribution, not a transfer).

### 2.6 Migration ordering

Source: `portfolio-schema-design.md` §3 — verbatim, with one revision: the v1-fallback read must defer to v2 when both keys exist (defensive against partial migrations from old browser caches).

Order in `storage.ts/parseStateFromJson`:

1. JSON.parse
2. **Schema-version branch.** v1 detected → run singleton-to-instance migration → produce v2 shape. Each migrated instance gets `evidenceMap = {}` (which the engine reads as "all fields are `model_estimate`" per §2.4).
3. `mergeDeep` against `defaultWorkspace` (instance-aware default).
4. `validateState` against v2 schema.

### 2.7 Open schema questions (resolved post-grilling)

- **Per-instance scenario visibility** (`assumptions.visibleProducts`): in combine-mode, replaced by `visibleInstanceIds: string[]` (default = all instance ids). Compare-mode keeps `visibleProducts` as today.
- **Cross-instance share URL size**: defer compression until measured. Today's base64url-encoded JSON has not exceeded ~1 kB; instance arrays will roughly double that for portfolio-rich users (Bernd: 5 instances), still within URL limits.
- **Versorgungswerk / Beamten as instance**: stays singleton on `StatutoryPensionAssumptions` for P1. Household-mode revisits when partner profiles land (P2).

## 3. Module map

New modules:

| Module | Role | Dependencies |
|---|---|---|
| `src/engine/portfolioAdapter.ts` | Iterates over instances. For each instance: (1) projects the instance into a singleton-shaped `ScenarioAssumptions` via `projectInstanceToScenarioAssumptions`; (2) runs a portfolio-aware funding pre-step (see below); (3) calls the relevant per-product simulator **directly** (e.g. `simulateBav(ctx, scenario)` from `src/engine/products/bav.ts`), NOT `simulateRetirementComparison`. Returns flat `ProductResult[]` keyed by instanceId. | engine/products/*, engine/simulationContext |
| `src/engine/portfolioCombine.ts` | Aggregates per-instance ProductResults into a combined retirement income via the shared retirement-tax + KV/PV pipeline (§3.x below). Re-runs `calculateRetirementTax` and `calculateRetirementKvPv` over aggregated income components — does NOT just sum per-source net incomes (progressive tax + once-per-aggregate-month KV/PV Freibetrag + PV Freigrenze make summation incorrect). | engine/retirementTax |
| **Portfolio-aware funding pre-step** (in `portfolioAdapter.ts`) | Aggregates pre-scenario budgets across instances of the same product type before per-instance simulation. Specifically: bAV §3 Nr. 63 + §1 SvEV cap is shared across all bAV instances at one employer (sum gross conversions, apply cap once, distribute statutory subsidy proportionally); Basisrente §10 Abs. 3 cap is shared across Basisrente instances; Riester §10a cap is shared across Riester instances; Sparerpauschbetrag is shared across ETF instances. Per-instance accumulation runs against the instance's share of the cap. | engine/salary, engine/basisrente, engine/riester |
| `src/engine/equalInputComparator.ts` | Compare-mode equal-input orchestration: runs each selected product at the same nominal monthly contribution, no fair-comparison invariant. | engine/products |
| `src/app/portfolioState.ts` | Workspace-level state hook (replaces `useCalculatorState` in combine-mode; coexists with it in compare-mode). Reads/writes the `Workspace` shape, manages baseline + what-ifs. | storage, scenarioSchema |
| `src/app/scenarioDiff.ts` | `diffScenario(a, b): ScenarioDiff` for the "what changed" view in result panels and exports. | domain |
| `src/app/recommendations.ts` | Rules engine + recommender. Generates "next-€X" what-ifs, ranks them, emits trade-off-label atoms. | portfolioCombine, decisionLogic |
| `src/app/evidence.ts` | Helpers for `evidenceMap` lookups and lowest-confidence propagation. | domain |
| `src/features/inventory/InventoryWizard.tsx` | First-time inventory modal; per-product cards. | features/inputs/sections/* (existing reusable sections) |
| `src/features/inventory/InstanceCard.tsx` | Single-instance card (used by both wizard and dashboard sidebar). | inputs/sections, results/provenance, evidence |
| `src/features/dashboard/PortfolioDashboard.tsx` | Combine-mode dashboard (replaces today's `Calculator` component when `mode === 'combine'`). | portfolioCombine, recommendations, results/* |
| `src/features/dashboard/RecommenderCard.tsx` | "Wo geht mein nächster €X hin?" card with ranked candidates + trade-off labels. | recommendations |
| `src/features/dashboard/ContractDecisionMenu.tsx` | "Optionen für diesen Vertrag" panel: Weiterführen / Beitragsfrei / Kündigen / Übertragen. | recommendations (template generators) |
| `src/features/landing/LandingPage.tsx` | Two-CTA landing screen: Mein Plan / Produkte vergleichen. | useRoute |
| `src/features/guidance/TriggerRouter.tsx` | Data-driven trigger dispatch. Replaces hard-coded routing in today's `GuidedSetup.tsx`. | content/triggers |
| `src/content/triggers.ts` (extended) | Per-trigger metadata: card, wizard component reference, what-if templates, recommender bias hints. Existing entries migrate transparently. | (data only) |

Modified modules:

| Module | Change |
|---|---|
| `src/storage.ts` | v1→v2 migration, instance-aware defaults, partner slot handling. |
| `src/utils/scenarioSchema.ts` | v2 validators, instance-aware. Reject unknown instanceIds in transferEvents. |
| `src/app/useCalculatorState.ts` | Splits: keeps compare-mode singleton API; combine-mode delegates to `portfolioState.ts`. |
| `src/app/useSimulationViewModel.ts` | Branches by mode; combine-mode reads `portfolioCombine` output, compare-mode reads today's `simulateRetirementComparison` output. |
| `src/features/results/ResultWaterfall.tsx` | Combine-mode variant aggregates per instance. |
| `src/features/results/BreakEvenChart.tsx` | One line per instance + portfolio-total line in combine-mode. |
| `src/features/results/DecisionSummary.tsx` | Compare-mode keeps today's logic; combine-mode delegates to `RecommenderCard`. |
| `src/features/results/PrintReport.tsx` | Confidence indicators (PRD G1) on every figure with at least one estimate input. |
| `src/utils/csvExport.ts` | Same — confidence column. |
| `src/app/useRoute.ts` | New routes for landing if needed (probably not — landing is a view of `/` based on `mode`). |

Engine-touching changes:

- **`src/engine/projections.ts` accumulation**: extend `AccumulationInput` to support **mid-year capital injections** (transfer events). Current `initialCapital` is year-0 only; new `capitalInjections?: { year: number, amount: number }[]` adds per-year deltas. Backwards-compatible (default `[]`).
- **`src/engine/buildResult.ts`**: pass instance metadata to per-product builders so per-product results carry `instanceId` and `evidenceMap` snapshot for provenance.

## 4. Sequencing — P1 milestones and slices

P1 ships in three milestones. Each milestone is its own PR-able unit.

### Milestone M1 — Schema + adapter (foundation)

Goal: byte-identical engine output through the singleton-to-instance migration. Zero UI change. **Strictly schema + adapter — NO engine refactor.** `ScenarioAssumptions` stays singleton-shaped (see §2.2). The adapter projects each instance to a per-call singleton.

- **M1.1.** New V2 types in `src/domain/`. `Workspace`, `Scenario`, `WhatIfScenario` (with `derivedFromBaselineSnapshot`), `WorkspaceAssumptionsV2`, `InstanceCommon` (with `currentValueEUR`, `anbieter`, `evidenceMap`), `TransferEvent` (discriminated union), `EvidenceState`, per-product instance types. Existing `ScenarioAssumptions` and per-product assumption types are NOT modified.
- **M1.2.** Migration in `src/storage.ts`. v1→v2 with deterministic singleton-id `${productId}-singleton`. Empty `evidenceMap = {}` on every migrated instance (legacy values become `model_estimate` per §2.4). Tests cover both legacy (saved-scenario library v1, share-URL v1, localStorage v1) and v2 round-trip.
- **M1.3.** `PortfolioAdapter` in `src/engine/portfolioAdapter.ts` with `projectInstanceToScenarioAssumptions`. For each instance, project to singleton, run portfolio-aware funding pre-step (cap aggregation across same-type instances), call the per-product simulator directly (NOT `simulateRetirementComparison`). Integration tests assert byte-identical results vs pre-migration goldens for length-1-array workspaces.
- **M1.4.** `useCalculatorState` split: compare-mode keeps today's API (workspaces with length-1 instance arrays project to singletons via the adapter, then run today's compare-mode path). Combine-mode reads `Workspace` via new `portfolioState.ts`.
- **M1.5.** `partner?: PersonalProfile` slot reserved in `Scenario`, defaulted `undefined`, no UI surface (Q5).
- **M1.6.** `ownedBy?: 'self' | 'partner'` field on `InstanceCommon`, defaulted `'self'`, no UI surface.

Exit criteria: `npm run verify` green, all 585 existing tests pass, oracle goldens unchanged.

### Milestone M2 — Combine-mode foundations

Goal: a user can enter their portfolio and see a combined retirement income with one baseline what-if recommendation.

- **M2.1.** Two-CTA landing page. `Mein Plan` / `Produkte vergleichen`. Mode tag stored in workspace.
- **M2.2.** "Hast du schon Verträge?" routing: ja → inventory wizard, nein → existing `GuidedSetup`. Compare-mode bypasses both.
- **M2.3.** Inventory wizard: 7-product checklist + per-product expandable cards. Reuses existing `src/features/inputs/sections/*`. New `InstanceCard.tsx` carries Layer 1 / 2 / 3 disclosure.
- **M2.4.** Auto-pinned baseline on wizard exit. Empty-baseline (clean-slate) renders GRV-only retirement income.
- **M2.5.** Multi-instance per product (`+ weitere bAV hinzufügen`). UI affordance only; engine already supports via M1.
- **M2.6.** `portfolioCombine.ts` with cross-instance KV/PV apportionment. Aggregated dashboard view.
- **M2.7.** `evidenceMap` round-trip, evidence badges in inventory wizard, confidence indicator on dashboard summary.
- **M2.8.** Per-instance dashboard cards in the input sidebar. Edit any instance, dashboard recomputes.

Exit criteria: Anna (clean-slate), Bernd (5 products, 6 instances) can complete their respective paths to a baseline + first what-if. Oracle goldens unchanged.

### Milestone M3 — Recommender + decision templates

Goal: actionable recommendations with trade-off labels.

- **M3.1.** Rules engine skeleton in `recommendations.ts`. Atom + template-mapping infrastructure.
- **M3.2.** "Next-€X" what-if generator: takes baseline + marginal budget, emits 3–4 candidates (more bAV, more ETF, Riester→AVD, +Basisrente, +AVD) with cap-headroom awareness.
- **M3.3.** Cap-detection rules (bAV §3 Nr. 63, Basisrente §10 Abs. 3, AVD, Riester, Sparerpauschbetrag) → recommender input + trade-off labels.
- **M3.4.** Vintage-detection rules (pre-2005 pAV, §40b a.F. bAV, post-2008 Riester children) → contract-card badges and explanation atoms.
- **M3.5.** Three-card per-contract template (Weiterführen / Beitragsfrei / Kündigen / Übertragen) with `ContractDecisionMenu.tsx`. Generates named what-ifs.
- **M3.6.** `transferEvents` engine support: `projectAccumulation` honors capital injections at year-N. Tests cover full + partial transfer.
- **M3.7.** RecommenderCard with ranked candidates + trade-off labels + re-sort.
- **M3.8.** Hard filters: Wunschnetto floor, illiquidity flag.
- **M3.9.** Compare-mode equal-input sub-mode: `EqualInputComparator`, UI toggle (Equal-cash / Equal-input), broker-friendly default for compare-mode entry.

Exit criteria: Bernd's "next €400" recommendation produces ≥3 ranked candidates with trade-off labels. Karin's three-card template produces "weiter / beitragsfrei / kündigen" what-ifs. Jens's cap-detection surfaces "Basisrente nächster Hebel" automatically. A broker can enter €200/Monat and compare three pAV products at equal input.

### Milestone M4 — Trigger router infrastructure (P1 portion)

Goal: data-driven trigger dispatch ready for P2 trigger expansion.

- **M4.1.** `TriggerRouter.tsx` replaces hard-coded routing in `GuidedSetup.tsx`. Existing 4 triggers migrate without behaviour change.
- **M4.2.** `triggers.ts` schema extension: `wizardComponent`, `whatIfTemplates`, recommender bias hints.
- **M4.3.** Two new P1 personas seeded as `triggers.ts` rows: low-income parent / part-time household, civil servant / Versorgungswerk.

Exit criteria: existing 4 triggers behave identically. New trigger entries can be added with one row + one wizard component.

## 5. Test strategy

### 5.1 Pinning oracle goldens (PRD S4)

`docs/golden-coverage-audit.md` enumerates the existing oracles. M1.3 must pass these untouched:

- `simulate.integration.test.ts` (full per-scenario product snapshots).
- bAV-funding oracles in `salary.test.ts` and `bav.test.ts`.
- Retirement-tax oracles in `retirementTax.test.ts`.
- Riester allowance + Günstigerprüfung oracles in `riester.test.ts`.
- Basisrente Schicht-1 + KV/PV oracles in `basisrente.test.ts`.
- AVD glidepath + §22 Nr. 5 oracles in `altersvorsorgedepot.test.ts`.

The PortfolioAdapter wraps singletons as length-1 arrays. Every per-instance ProductResult must be byte-identical to the legacy singleton output.

### 5.2 New test categories

- **Migration round-trip**: every saved-scenario library v1 entry, share-URL v1, localStorage v1 → v2 → re-serialize → v2 produces stable output. v2-only round-trip is also stable.
- **Multi-instance combination**: 2 bAV + 1 ETF combine to the same retirement income whether expressed as 3 instances or 3 separate compare-mode workspaces summed manually.
- **TransferEvent**: full transfer (source ends at €0), partial transfer (source continues with residual), transfer to incompatible target rejected.
- **Evidence propagation**: `lowestConfidence` returns `model_estimate` if any input is `model_estimate`, even if 9/10 are `user_confirmed`.
- **Recommender determinism**: same baseline + same marginal budget → same ranking + same trade-off labels (no random ordering).
- **Cap detection**: bAV at exactly the cap shows 100% used; bAV at cap + 1 EUR shows the engine treating excess correctly (existing behaviour); rules-engine cap-headroom = 0 in both cases.
- **Per-instance KV/PV apportionment**: 2 bAV + 1 pAV combined retirement income hits the BBG ceiling correctly via proportional scaling, identical to today's single-instance behaviour at equivalent gross.

### 5.3 UI / integration tests

- **Inventory wizard happy paths**: Anna (no contracts), Bernd (5 contracts, 1 paid-up), Dilan (2 bAV).
- **Edit-baseline-in-place flow**: edit a value → derived what-if shows "Baseline hat sich geändert" badge.
- **Three-card decision template**: Karin's pAV → 4 named what-ifs in scenario library.
- **Equal-input compare-mode**: 3 pAV candidates at €200/Monat → 3 product cards with side-by-side metrics.

### 5.4 Verification cadence

- After every slice: `npm run verify` (lint + tests + build).
- After every M1.x slice: integration goldens green (the load-bearing assertion).
- After M2 / M3 / M4 milestone close: dogfood walk-through of the affected personas (Anna, Bernd, Dilan, Jens, Karin, generic broker) in dev preview.

## 5.5 P1 scope vs BACKLOG.md (intentional expansion)

Several capabilities the PRD lists as P1 are flagged P2 or P3 in `BACKLOG.md`:

- **Vintage detection in UI** — BACKLOG P2 ("Existing-contract vintage detection in UI"). Promoted to P1 because Karin (F23) and Inge (F30) cannot make their decisions without it; the engine paths exist already and surfacing them is small UI work.
- **Evidence states** — BACKLOG P2 ("Contract-card evidence states"). Promoted to P1 because PRD G1 (no silent default) is a hard guardrail; without `evidenceMap`, the dashboard can't honour G1.
- **Three-card per-contract template** — BACKLOG P2 ("Contract decision templates"). Promoted to P1 because Dilan (F21) and Karin (F23) cannot reach a decision without it.
- **Recommender + rules engine (thin layer)** — BACKLOG P3 ("Recommendation rule engine"). The thin P1 layer ships; the rich P3 layer remains deferred. Bernd (F20), Jens (F22) cannot reach a recommendation without the thin layer.

This is a deliberate scope shift driven by the persona analysis in §3 of the PRD. Items still on the BACKLOG at P2/P3 — household mode, OCR, Monte Carlo prominence, year-by-year tax tables — stay deferred per their original priority.

## 6. Risk register

- **R1. Migration breaks share URLs.** Mitigation: M1.2 covers every legacy state shape; v1 share URL → v2 produces deterministic instance ids (`${productId}-singleton`). The migration is idempotent and the test set covers v1, v2, mixed, and partial-write scenarios.
- **R2. Engine changes leak into oracle goldens.** Mitigation: M1.3 asserts byte-identical results before any engine extension. M3.6 (transferEvents engine support) gets its own oracle set.
- **R3. Recommender produces useless / hallucinated recommendations.** Mitigation: rules engine is closed (no LLM); each rule has a unit test; the trade-off labels are templated, not generated. UI never shows a candidate without a label.
- **R4. Inventory wizard is too long and abandoned.** Mitigation: per-product cards are progressive; Layer 1 fields only required, Layer 3 collapsed by default. Time-to-baseline measured in dogfood (S2). If Bernd takes >15 min, narrow the field set.
- **R5. Compare-mode regression.** Mitigation: compare-mode uses the same engine as today. M1.4 (state-hook split) keeps compare-mode behaviour byte-identical until M3.9 introduces the equal-input sub-mode.
- **R6. Confidence indicator becomes visual noise.** Mitigation: yellow "🤔 Schätzung" badge appears once per affected figure, not per estimate input. The "Wert ist okay" promote-to-confirmed flow lets users hide the badge.
- **R7. Per-spouse storage shape locks us in early.** Mitigation: P1 reserves the slot but keeps it unused. P2 tests can revisit the shape if `partner?: PersonalProfile` proves wrong; the migration v2→v3 cost is contained because no UI surfaces the field yet.
- **R8. Brokers don't pay because product comparison stays free.** Out of scope for Group G — license-tier feature matrix decision (Group P P1) handles this. Group G ships compare-mode as today (free); broker-specific differentiators (white-label, batch scenarios, branded PDF) are tracked separately.

## 7. Out-of-scope decisions deferred to implementation PRs

- **Per-rule template tone and length.** The rules engine API is fixed in M3.1; the actual template strings (Karin's "Vertreter verdient an der Provision" wording, etc.) iterate during dogfood.
- **Inventory card visual design.** Layer 1 / 2 / 3 disclosure pattern is fixed; pixel-level layout iterates with the existing component-styling conventions (`disclosure-section` base classes).
- **CSV/PDF export schema for combine-mode.** New columns for confidence indicator, partner attribution (P2). M2.7 sets the minimum; iteration follows.
- **Trigger-bias on recommender.** The infrastructure ships in M4; specific bias rules per trigger (`pre_retirement` emphasising P10) ship per-trigger.

## 8. Document hygiene

- This Plan tracks *how* and *in what order*. The PRD tracks *what* and *why*. Issues track work-in-flight.
- When a slice ships, mark it complete here and tick the matching PRD acceptance criterion. Do not delete completed entries; the trail matters for refresh cycles.
- When architecture deviates from this plan (a slice discovers a constraint not anticipated here), note the deviation in the slice's issue and update the affected `§` here in the same PR. The Plan and the code stay coupled.
