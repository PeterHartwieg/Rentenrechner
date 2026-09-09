# State contract — simplification project, Phase 0

Author: Opus 5 (Claude Code CLI), mechanical/state owner. Prepared against branch
`codex/fix-comparison-input-reset`, HEAD `1786fc2`. No `src/` file was modified in Phase 0.

Scope: types and public helpers that downstream Phase 1–3 packages depend on. Code observations
below beat the architecture docs where they disagree.

---

## 1. Findings

### 1.1 Validator strictness — permissive on keys, strict on values

`src/utils/scenarioSchema.ts` is a **value allowlist, not a shape lock**.

- No validator rejects unknown keys. `validateProfile` returns `p`; `validateAssumptions` returns `a`;
  `validateScenario` returns `{ ...s, assumptions }`; `validateWorkspace` returns `{ ...w, baseline, whatIfs }`.
  Every unknown key survives verbatim.
- Optional fields are tolerated by explicit `!== undefined` guards
  (`desiredNetMonthlyPension` :44, `pensionBaselineType` :84, `contributionInput` :126, `ownedBy`/`anbieter`/`transferEvents` :251–262).
- Values are strict: enum allowlists (`VALID_EVIDENCE_STATES` :152, `VALID_INSTANCE_STATUSES` :151,
  `VALID_PENSION_BASELINE_TYPES` :66), numeric ranges, and cross-object invariants
  (`retirementEndAge > retirementAge`, :390).
- Failure mode is mostly **all-or-nothing** (`return null` → whole workspace discarded → defaults).
  The one precedent for *sanitising instead of rejecting* is transfer events: `isUsableTransferEvent`
  + `sanitizeInstances` (:329–347) drop stale events and keep the workspace.

**The only key-dropping stage in the whole pipeline is `mergeDeep` (`src/storage.ts:61`).** It iterates
`Object.keys(defaults)` only, so any persisted key absent from the corresponding defaults object is
silently deleted on load and re-persisted as missing. Three live consequences already exist in main:

| Key | Default present? | Result |
|---|---|---|
| `Scenario.lastEditedAt` | no | dropped every load — documented at `portfolioState.ts:250–263`, worked around by a first-effect-run skip |
| `WorkspaceAssumptionsV2.visibleInstanceIds` | no | dropped every load |
| `WorkspaceAssumptionsV2.contributionInput` | no | rescued by a bespoke `readContributionInput` special case (`storage.ts:126`, `mergeWorkspaceWithDefaults` :233) |

Arrays are the exception: `mergeDeep` takes a saved array wholesale without recursion
(`if (Array.isArray(defaults)) return saved`). **Therefore anything stored *inside* a product instance
array round-trips verbatim today**, which is why `evidenceMap` works while `lastEditedAt` does not.

### 1.2 How legacy data looks

- Two coexisting keys: `rentenrechner-state-v1` (compare writer) and `-v2` (combine writer);
  `loadSavedState` prefers V1 when the V2 workspace says `mode: 'compare'`.
- `EvidenceState = 'user_confirmed' | 'model_estimate' | 'statement'` (`src/domain/instances.ts:8`) — **no
  unknown variant**; `evidenceMap` is required but often `{}`. `StatutoryPensionAssumptions` has no
  `evidenceMap` at all.
- Inventory drafts have no notion of empty: `ProductDraftState` numeric fields are plain `number` seeded with
  defaults (`contractStartYear: CURRENT_YEAR`, `currentValueEUR: 0`, `monthlyContribution: 200|100`,
  `GrvDraft.yearsWorked: 5`), and `InvNumber` (`fields.tsx:91`) refuses to commit an empty string, so blanks
  never reach the draft. `InstanceCard.tsx:104` compensates with heuristics — exactly the guesswork this
  project must replace.
- Share URLs (`?s=`) carry only the **v1 singleton** payload, so per-instance data including `evidenceMap` is
  already lost through a share link. Pre-existing; not a regression to introduce or to fix here.

### 1.3 Current household-total shape

`combinePortfolio` (`src/engine/portfolioCombine.ts:559`) returns `CombinedResult` (:117):

```ts
{ monthlyNetIncome, monthlyGrossPayouts, aggregateTax, aggregateKvPv,
  byInstance: Record<string, CombinedInstanceShare>, statutoryPensionMonthlyNet, notes }
// CombinedInstanceShare (:86): { instanceId, productId, monthlyGross, monthlyNet,
//                                taxShareAnnual /* EUR/YEAR */, kvPvShare /* EUR/MONTH */ }
```

Statutory pension is **not** a `byInstance` row; it is the separate scalar `statutoryPensionMonthlyNet`.
Invariant: `sum(byInstance.monthlyNet) + statutoryPensionMonthlyNet === monthlyNetIncome` (< 1 ct).

**There is no inflation deflation anywhere in the combine path.** The engine deflates only accumulation
balances (`accumulation.ts:281` `realBalance`). Three unrelated ad-hoc real-terms implementations exist:
`MeinPlanPage.tsx:142` (`(1+i)^-yearsUntilRetirement`), `inflationStress.ts:24`, and the chart's
`showRealValues` reading the engine's precomputed `realBalance`. KapitalPage computes none.

`useCombineSimulation` (`:112`) is a bare `useMemo(runCombineSimulation)` — **no error and no loading
state**; a throw inside `simulatePortfolio` reaches the renderer.

### 1.4 Current mutation and undo capabilities

- **No undo exists anywhere in `src/`** (the only "undo" hit is a comment in `storage.ts`).
- `removeInstanceFromWorkspace` (`workspaceIdentity.ts:141`) cleans `pinnedComparisonIds` only — not
  transfer events on other instances referencing the removed id, not `visibleInstanceIds`, no
  `lastEditedAt` stamp, no staleness marking on dependent what-ifs. Dangling transfer events survive
  in-session and are swept only on the next reload by `isUsableTransferEvent`.
  `addInstanceToWorkspace` also omits the stamp; `addPopulatedInstance` sets it.
- **There is no "apply a what-if to the baseline" mutation.** What-ifs are created in
  `ContractDecisionMenu.tsx:102` (fork + `applyContractDecision`) and can only be rebased, frozen or
  removed. Application is new work.
- `scenarioDiff` matches array entries **by index, not by instanceId** (documented at `scenarioDiff.ts:31`),
  and `applyDiff`'s `setAtPath` silently skips missing paths. Both matter for rebase and apply correctness.
- `applyContractDecision` returns a whole new `Workspace` (deep clone) and does not stamp `lastEditedAt`.

### 1.5 Current routing entry points

`Route` is a 21-variant tagged union over pathnames only (`useRoute.ts:26`); `navigate(route, search?, hash?)`
has no replace API. **`/vergleich` does not exist** (only `/vergleich/details`) and `?view=compare` is
explicitly unsupported (`appViewFromUrl` honours `'landing'` only, `:258`). Compare mode is reached through
five non-deterministic paths — landing CTA, `?topic=` auto-fire (first-time visitors only), saved-mode
detection, `?s=` share override, and a header tab that merely re-runs saved-mode detection.
**No URL forces compare mode today.**

### 1.6 `estimateEpFromYears` discrepancy — quantified

`inventoryHelpers.ts:59` hardcodes `DURCHSCHNITTSENTGELT = 47_079`; the active rule is
`de2026.ts:83` `durchschnittsentgelt: 51_944`. (`BBG = 101_400` matches `pensionCapYear`.) The helper's
own docstring wrongly claims 47,079 is the de2026 value. The engine itself is correct
(`grv.ts:148` divides by `rules.socialSecurity.durchschnittsentgelt`), so the wizard seeds
`currentEntgeltpunkte` about 10 % too high before simulation.

Worked example, 50 000 EUR/yr gross (below BBG), 40 years, `aktuellerRentenwert = 42.52`:

| | EP/yr | EP (40 y) | monthly gross |
|---|---|---|---|
| hardcoded 47 079 | 1.062045 | 42.4818 | 1 806.37 EUR |
| active 51 944 | 0.962575 | 38.5030 | 1 637.15 EUR |
| delta | | −3.9788 EP | **−169.22 EUR/mo** |

The ratio is salary- and year-independent below the BBG: `51 944 / 47 079 = 1.10334`. The old helper
**overstates by +10.33 %**; correcting it **lowers the estimate by 9.37 %**. Only
`src/features/inventory/InventoryWizard.test.ts` references the helper (lines 39, 55–78); its
assertions at :65–66 pin 47 079 as the "1 EP" salary and encode the bug. No oracle snapshot is affected.

---

## 2. Input-status metadata contract

### 2.1 Types

```ts
// src/domain/inputStatus.ts (new, React-free)
export type InputStatus = 'unknown' | 'assumed' | 'entered' | 'document'
export type InputStatusMap = Record<string, InputStatus>

/** How the user supplied the statutory-pension figure. Explains what to show when editing. */
export type PensionEntryMethod =
  | { kind: 'skipped' }
  | { kind: 'document'; monthlyGrossEUR: number }
  | { kind: 'career'; careerStartAge: number; pauseYears: number }
  | { kind: 'years'; contributionYears: number }
  | { kind: 'points'; entgeltpunkte: number }
  | { kind: 'projected-gross'; monthlyGrossEUR: number }
```

Semantics: `unknown` = the user explicitly declined; `assumed` = a model/default value never reviewed;
`entered` = the user typed it (numeric **0 is a valid `entered` value**); `document` = read off a
Renteninformation / PIB. Setting a field to `unknown` must not write 0 and must not touch neighbours.

### 2.2 Where it lives

| Data | Home | Why |
|---|---|---|
| Per-contract fields | `InstanceCommon.inputStatus?: InputStatusMap` (`src/domain/instances.ts`), keyed identically to `evidenceMap` | instances live inside arrays; `mergeDeep` copies arrays wholesale, so this round-trips today with zero storage change |
| Profile + statutory-pension fields | `WorkspaceAssumptionsV2.inputStatus?: InputStatusMap` **and** `ScenarioAssumptions.inputStatus?: InputStatusMap`, keys namespaced `profile.<field>` / `statutoryPension.<field>` | the scenario boundary the plan names; one map covers both v1 and v2 payloads and therefore share URLs |
| Pension entry method | `StatutoryPensionAssumptions.pensionEntryMethod?: PensionEntryMethod` (`src/domain/products/grv.ts`) | travels with the engine input it explains, in both v1 and v2 |

Reserved key set (fixed, exported as `const` so UI and exports cannot drift):
`profile.age`, `profile.retirementAge`, `profile.grossSalaryYear`, `profile.taxClass`,
`profile.publicHealthInsurance`, `profile.pkvMonthlyPremium`, `profile.pPVMonthlyPremium`,
`profile.desiredNetMonthlyPension`, `statutoryPension.pensionBaselineType`,
`statutoryPension.currentEntgeltpunkte`, `statutoryPension.manualMonthlyGross`.

### 2.3 Mapping to and from `EvidenceState`

Extend the existing presentation boundary in `src/features/results/provenanceHelpers.ts`; do not build a
second label map. `ProvKind` (`provenance.tsx:29`) gains `'unknown'`.

```ts
export function inputStatusToEvidenceState(s: InputStatus): EvidenceState | undefined
// entered → 'user_confirmed' | document → 'statement' | assumed → 'model_estimate' | unknown → undefined
export function evidenceStateToInputStatus(e: EvidenceState | undefined): InputStatus
// 'statement' → 'document' | 'user_confirmed' → 'entered' | 'model_estimate' | undefined → 'assumed'
export function inputStatusToProvKind(s: InputStatus): ProvKind
// unknown → 'unknown' | assumed → 'model' | entered → 'confirmed' | document → 'confirmed'
export function formatInputStatusForExport(s: InputStatus): string
// 'Unbekannt' | 'Schätzwert' | 'Bestätigt' | 'lt. Beleg'
export function resolveInputStatus(map: InputStatusMap | undefined,
                                   evidence: EvidenceState | undefined,
                                   key: string): InputStatus
```

`inputStatus` is authoritative when present; `evidenceMap` is the fallback; `evidenceMap` stays the
write target for existing evidence surfaces so nothing regresses. Every write of `inputStatus[k]` also
writes the mapped `evidenceMap[k]`, except `unknown`, which **deletes** `evidenceMap[k]`.

**Legacy fallback rule (binding):** absent metadata resolves to `'assumed'`, never `'unknown'` and never
`'entered'`. Opening a screen must not write metadata; only an explicit user edit or an explicit
"weiß ich nicht" click writes. `formatEvidenceStateForExport`'s current `undefined → 'Unbekannt'` must
change to `'Keine Angabe'` so an explicit unknown stays distinguishable in CSV/PDF (copy decision for
the lead; the distinction itself is not optional).

### 2.4 Additive extension, not a version bump — and the one storage change it requires

**Decision: additive, `schemaVersion` stays 2.** Evidence: no validator rejects unknown keys, and all
four validator layers return spread copies, so new optional fields already survive validation. A bump to
3 would make `parseWorkspaceJson` reject the payload on any older client
(`schemaVersion > 2 → null`, `storage.ts:687`), i.e. data loss on downgrade — strictly worse.

**The single blocking change is `mergeDeep`.** As written it drops `assumptions.inputStatus`,
`statutoryPension.pensionEntryMethod`, and every future additive field, because it iterates default keys.
Phase 1 must change `mergeDeep` to iterate the **union** of saved and default keys, copying saved-only
keys verbatim. This is bounded and net-positive: it also fixes the documented `lastEditedAt` and
`visibleInstanceIds` drops and lets the `readContributionInput` special case retire. Required regression
tests: unknown-key round-trip, `lastEditedAt` survival, type-mismatch still falling back to the default,
and no change to the `visibleProducts: []` preservation behaviour.

Fallback if the lead judges `mergeDeep` too load-bearing: add `inputStatus: {}` to `defaultAssumptions`
and `defaultWorkspace.baseline.assumptions` **and** a `readInputStatus` rescue mirroring
`readContributionInput` — an empty-object default alone does not work, because `mergeDeep` would then
recurse into zero keys and still drop everything.

**Validation must sanitise, not reject.** Add `sanitizeInputStatusMap` (drop entries whose value is not
in the allowlist, drop unknown keys for the scenario-level map) and an optional shape check for
`pensionEntryMethod` that degrades to `undefined` on failure. Follow the transfer-event precedent — a bad
status byte must never discard a user's whole workspace.

### 2.5 Code paths that must carry the metadata

| Path | File | Action |
|---|---|---|
| v2 load | `storage.ts` `parseWorkspaceJson` → `mergeWorkspaceWithDefaults` | mergeDeep union fix |
| v1 load / scenario library | `storage.ts` `migrateAndValidateState` | same fix; library entries inherit it |
| v1 → v2 migration | `storage.ts` `migrateV1ToV2` | copy `assumptions.inputStatus` + `pensionEntryMethod` onto the new baseline |
| Save | `saveWorkspace` / `buildStateJson` | no change (plain `JSON.stringify`) |
| Share URL | `utils/urlShare.ts` | scenario-level map + entry method survive; per-instance maps do **not** (pre-existing singleton projection loss) |
| Singleton projection | `engine/portfolioProjection.ts` `singletonViewOfWorkspace` | carry `assumptions.inputStatus` through |
| Clone / fork | `workspaceIdentity.deepCloneScenario`, `forkBaselineScenario` | structural clone — already covered |
| Diff / rebase | `scenarioDiff` | key-recursive over objects, so a Record map diffs correctly; no change needed |
| Validation | `utils/scenarioSchema.ts` | add sanitisers in `validateInstanceCommon`, `validateAssumptions`, `validateWorkspaceAssumptions`, `validateStatutoryPension` |
| CSV | `utils/csvExport.ts` (`buildExportCsv`, `buildCombinePortfolioCsv` "Datenqualität" column) | route through `formatInputStatusForExport` |
| PDF | `features/results/PrintReport.tsx:163`, `printReportRows.ts:912` | same |

---

## 3. Result-readiness selector

```ts
// src/app/resultReadiness.ts (pure, React-free)
export type ReadinessStatus = 'available' | 'estimated' | 'incomplete' | 'error'
export type ReadinessCode =
  | 'statutory-pension-unknown' | 'pension-entry-skipped' | 'instance-capital-unknown'
  | 'instance-contribution-unknown' | 'pkv-premium-unknown' | 'retirement-age-unknown'
  | 'simulation-error' | 'assumed-fees' | 'assumed-payout-mode' | 'shared-drawdown-horizon'

export interface ReadinessReason {
  code: ReadinessCode
  severity: 'blocking' | 'assumption'
  label: string                              // one German line
  target: { route: Route; anchor?: string }  // where the user fixes it
  instanceId?: string
}

export interface ResultReadiness {
  status: ReadinessStatus
  reasons: ReadinessReason[]
  blocking: ReadinessReason[]
  assumptions: ReadinessReason[]
  canShowHouseholdTotal: boolean             // false for 'incomplete' and 'error'
}

export function selectResultReadiness(
  workspace: Workspace,
  simulation: CombineSimulationBundle | null,
  simulationError?: unknown,
): ResultReadiness
```

Policy (from the plan, restated as executable rules):

1. `error` when `simulationError` is set or `monthlyNetIncome` is non-finite. Never render a plausible
   zero for an invalid calculation.
2. `incomplete` when any blocking reason exists: an `unknown` statutory-pension figure or a skipped
   pension step; an `unknown` `currentValueEUR` or contribution on any active instance; an `unknown`
   PKV premium while `publicHealthInsurance === false`; an `unknown` retirement age.
3. `estimated` when nothing blocks but at least one `assumption` reason exists (model-default fees,
   payout assumptions, the shared drawdown horizon).
4. `available` otherwise.
5. `pensionBaselineType === 'none'` is an explicit, complete answer — **never** a reason.
6. `canShowHouseholdTotal === false` for `incomplete`/`error`; the total must be suppressed, not
   approximated, and exports must suppress the same cell rather than emit a number.

Consumers: `MeinPlanPage` (headline gate + reason list), the alternatives before/after panel (both sides
gated by the same selector), `VergleichPage` where a household scope is implied, and both export
builders. One selector, four call sites — no local re-derivation.

---

## 4. Summary and duration selectors

```ts
// src/app/planSummary.ts (pure)
export type DurationDescriptor =
  | { kind: 'lifelong' }
  | { kind: 'fixed-term'; endAge: number; years: number }
  | { kind: 'drawdown-shared-horizon'; endAge: number; sharedWith: string[] }  // other instanceIds
  | { kind: 'avd-plan'; endAge: number }

export interface PlanSourceRow {
  key: string                    // 'statutory' | instanceId
  instanceId?: string
  productId?: ProductId
  label: string
  netMonthlyNominal: number
  netMonthlyReal: number
  status: InputStatus            // worst status across the row's inputs
  duration: DurationDescriptor
  target?: Route                 // ROUTES.vertrag(instanceId)
}

export interface PlanSummary {
  netMonthlyTotalNominal: number
  netMonthlyTotalReal: number
  deflator: number               // multiply nominal by this to get "heutige Euro"
  yearsUntilRetirement: number
  rows: PlanSourceRow[]
  gap?: { targetMonthly: number; gapNominal: number; gapReal: number }
  readiness: ResultReadiness
}

export function realDeflator(inflationRate: number, yearsUntilRetirement: number): number
  // (1 + max(0, inflationRate)) ** -yearsUntilRetirement
export function selectPlanSummary(
  workspace: Workspace, bundle: CombineSimulationBundle, scenarioId: string,
): PlanSummary
```

- Total and rows come from `CombinedResult.monthlyNetIncome`, `statutoryPensionMonthlyNet` and
  `byInstance` — **never** by re-summing independently taxed product headlines.
- One `realDeflator` for the total, every row, and the target. It replaces the ad-hoc computation at
  `MeinPlanPage.tsx:142`; `inflationStress.ts` keeps its own slider-driven deflator and is out of scope.
  Both sides of an alternative comparison use the **baseline's** deflator so the two numbers stay comparable.
- Duration derivation (product → descriptor), all read from real fields:

| Source | Rule |
|---|---|
| statutory pension | `lifelong` |
| `basisrente` | `lifelong` (mode is a literal `'leibrente'`) |
| `bav`, `versicherung` | `leibrente` → lifelong; `zeitrente` → fixed-term, `endAge = retirementAge + zeitrenteYears`; `kapitalverzehr` → drawdown-shared-horizon |
| `riester` | `leibrente` → lifelong; `zeitrente` → fixed-term |
| `altersvorsorgedepot` | `lifelong_annuity` → lifelong; `certified_payout_plan` → `avd-plan`, `endAge = max(payoutPlanEndAge, rules.altersvorsorgedepot.payoutPlanMinEndAge)` |
| `etf` | always drawdown-shared-horizon |

  `drawdown-shared-horizon.endAge` is `assumptions.retirementEndAge`, and `sharedWith` lists every other
  instance whose descriptor is also `drawdown-shared-horizon` (i.e. every ETF plus every
  `kapitalverzehr` contract), because `buildResult.ts:192` derives one `payoutYears` for all of them.
  Do not invent per-ETF end-age persistence — the engine ignores it.
- Wunschrente gap: emitted **only** when `profile.desiredNetMonthlyPension > 0` (an explicit user value)
  and `readiness.status` is `available` or `estimated`, and only against a total in the same money basis.
  `RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO` (`simulationSelectors.ts:47`) must **not** feed this surface;
  it stays confined to the legacy Rentenlücke dashboard.

---

## 5. Mutation and undo API for `portfolioState`

```ts
export interface WorkspaceUndo {
  id: string
  label: string           // German, supplied by the caller ("Vertrag entfernt")
  createdAt: number
  previous: Workspace     // full deep clone taken before the mutation
}

// additions to UsePortfolioStateApi
addPopulatedInstance(productId, instance, status?: InputStatusMap): { instanceId: string; undo: WorkspaceUndo }
updateInstance(productId, instanceId, patch: Partial<AnyInstance>, status?: InputStatusMap): void
removeInstance(productId, instanceId): WorkspaceUndo
removeWhatIf(id): WorkspaceUndo
applyWhatIf(id): { ok: true; undo: WorkspaceUndo } | { ok: false; reason: 'stale' | 'shape-drift' | 'not-found' }
undo(handle: WorkspaceUndo): void
lastUndo: WorkspaceUndo | null
```

Rules, all binding:

- **Atomicity.** Every mutation is exactly one `setWorkspace(prev => next)` returning a fully-formed
  `Workspace`. No mutation may be composed from two `setState` calls.
- **Stamping.** Any write touching `baseline` sets `baseline.lastEditedAt = Date.now()`.
  `addInstanceToWorkspace` and `removeInstanceFromWorkspace` currently omit it — fix both.
- **Reference cleanup on `removeInstance`,** in the same transaction: (i) `pinnedComparisonIds`
  (already done); (ii) `transferEvents` on *every other* instance whose `sourceInstanceId` or
  `targetInstanceId` is the removed id — today these dangle until the next reload sweeps them via
  `isUsableTransferEvent`; (iii) `visibleInstanceIds`; (iv) what-ifs whose snapshot references the id are
  **marked stale, never auto-deleted** (clear `frozenAt`; the existing stale badge then fires).
- **`applyWhatIf` applies only intended fields.** Compute `scenarioDiff(whatIf.derivedFromBaselineSnapshot,
  whatIf)` and `applyDiff` that list onto the *current* baseline. Refuse with `'stale'` when
  `baseline.lastEditedAt > snapshot createdAt` and the what-if has not been rebased — the user rebases and
  reviews first. Refuse with `'shape-drift'` when any product array's length or `instanceId` sequence
  differs from the snapshot, because `scenarioDiff` matches array entries by index and would otherwise
  write a delta onto the wrong contract.
- **Rebase** keeps its existing `rebaseWhatIf` algorithm (diff against the stale snapshot, re-apply onto a
  clone of the new baseline, re-stamp `derivedFromBaselineSnapshot`, clear `frozenAt`). Saved alternatives
  keep their frozen comparison basis until the user rebases; nothing rebases implicitly.
- **Undo restores a whole-workspace snapshot** — metadata, `inputStatus`, visibility, transfer events, pins
  and ids come back together. Depth one per surface; handles are in-memory and session-scoped, never persisted.
- Storage failure must surface: `saveWorkspace` swallows the exception today (`storage.ts:855`). Phase 1
  gives it a boolean/throw contract so the shell can warn visibly.

---

## 6. Routing plan

Add one route. `/vergleich` currently resolves to `not-found`.

1. `src/app/useRoute.ts` — add `{ kind: 'vergleich' }` to `Route`, `ROUTES.vergleich`, a `routeToPath`
   case (`'/vergleich'`) and a `pathToRoute` case. Order matters: match `/vergleich/details` first.
2. `src/App.tsx` — a `switch` case (the `never` default fails typecheck otherwise).
3. `src/ui/chrome/chromeRoutes.ts` — `routeToNavId('vergleich') → 'compare'` (its default is `never` too);
   point `AppHeader.clickableTarget('compare')` and `MobileNav` at `ROUTES.vergleich` instead of bare `/`.
4. `src/seo/publicRouteRegistry.ts` — a `PublicRoute` entry keyed `/vergleich` (title, canonical, CTA).
5. `scripts/prerender.mjs` — a `buildComponentMap` entry, or the build exits 1.

Hosting needs no change: Workers serves `dist/vergleich/index.html` from the asset binding;
`public/_redirects` and `vercel.json` are empty of rules today and stay that way.

What `/` renders:

| State | Render |
|---|---|
| fresh (`detectSavedMode() === null`) | `LandingPage` |
| `?view=landing` | `LandingPage` (unchanged override) |
| saved combine | personal plan (Calculator combine view) |
| saved compare (v1 key, or v2 `mode: 'compare'`) | today's compare view, plus a one-time pointer to `/vergleich` |
| `?s=` share present | compare, as today |

`/vergleich` renders the comparison journey **regardless of saved mode and must not call
`setMode('compare')` on the persisted workspace** — that is what makes the two destinations
non-destructive. It reads a session-scoped compare view state produced by a new pure helper:

```ts
export function seedCompareFromWorkspace(workspace: Workspace):
  { profile: PersonalProfile; assumptions: ScenarioAssumptions }
```

which copies `baseline.profile`, `inflationRate`, `returnScenarios`, `retirementEndAge` and the chosen
`visibleProducts`, and leaves baseline contracts and contributions untouched. Nothing writes back.

Compatibility list to keep green: `?s=` share links, `?topic=<slug>` preselection (first-time visitors
only), `?view=landing`, v1-only localStorage, `/eingaben`, `/eingaben/produkte`, `/vertrag/:instanceId`,
`/kapital`, `/vergleich/details`, browser back/forward, and all ten prerendered topic pages.

---

## 7. Pension career helper

```ts
// src/features/inventory/inventoryHelpers.ts (or a new pensionEstimate.ts)
export interface CareerEstimateInput {
  currentAge: number; careerStartAge: number; pauseYears?: number; grossSalaryYear: number
}
export type CareerEstimateResult =
  | { ok: true; contributionYears: number; entgeltpunkte: number; monthlyGrossEUR: number
      assumptions: { durchschnittsentgelt: number; beitragsbemessungsgrenze: number; aktuellerRentenwert: number } }
  | { ok: false; code: 'start-after-now' | 'pauses-exceed-career' | 'no-salary' }

export function estimateCareerPension(input: CareerEstimateInput, rules?: GermanRules): CareerEstimateResult
```

Validation **rejects, never clips**: `careerStartAge` must be ≥ 14 and ≤ `currentAge`
(`'start-after-now'`); `pauseYears` must be ≥ 0 and ≤ `currentAge − careerStartAge`
(`'pauses-exceed-career'`); `grossSalaryYear > 0` (`'no-salary'`).
`contributionYears = currentAge − careerStartAge − pauseYears`.

It then calls the corrected helper:

```ts
export function estimateEpFromYears(years: number, grossSalaryYear: number, rules: GermanRules = de2026Rules): number
```

reading `rules.socialSecurity.durchschnittsentgelt` and `rules.socialSecurity.pensionCapYear` instead of
the literals. Effect: EP falls by 9.37 % (the old literal overstated by 10.33 %); see §1.6 for the worked
figure. `src/features/inventory/InventoryWizard.test.ts:65–66` deliberately pins the obsolete constant and
is the only test to update; the note that a career estimate is approximate and not an official
contribution record belongs in the returned `assumptions` block, surfaced on demand.

The result seeds `statutoryPension.currentEntgeltpunkte` and writes
`pensionEntryMethod = { kind: 'career', careerStartAge, pauseYears }` plus
`inputStatus['statutoryPension.currentEntgeltpunkte'] = 'assumed'`. Direct years, direct points, and a
manual projected gross keep their existing distinct meanings and their own `pensionEntryMethod` kinds;
credited education, caring, child-rearing and unemployment periods are explicitly not reconstructed.

---

## 8. Ownership and file split

| Phase | Opus (mechanical) | Astra (UI) | Typed contract Astra consumes |
|---|---|---|---|
| 1 | `domain/inputStatus.ts`, `domain/instances.ts`, `domain/products/grv.ts`, `utils/scenarioSchema.ts`, `storage.ts` (`mergeDeep`, migrations, save contract), `features/results/provenanceHelpers.ts`, `app/resultReadiness.ts`, `app/planSummary.ts`, corrected `estimateEpFromYears` + `estimateCareerPension`, tests | — | `InputStatus`, `resolveInputStatus`, `inputStatusToProvKind`, `selectResultReadiness`, `selectPlanSummary`, `realDeflator` |
| 2A | draft types + adapters in `inventory/types.ts`, `inventoryProductRegistry.ts`, `inventoryHelpers.ts`; `buildWorkspaceFromDraft` status stamping; state wiring in `Calculator.tsx` | `LandingPage`, `InventoryWizard`, personal + pension editor presentation | `ProductDraftState` with explicit unknown, `CareerEstimateResult`, `PensionEntryMethod` |
| 2B | registry adapters, `updateInstance`/`addPopulatedInstance` wiring, persistence, tests | `InstanceCard`, product input sections, contract editor | `updateInstance(productId, instanceId, patch, status)`, `resolveInputStatus` |
| 2C | `seedCompareFromWorkspace`, `/vergleich` route plumbing, fair-budget integration (`syncContributions` untouched), tests | `VergleichPage`, cards, selection, scope + payout labels | `{ profile, assumptions }` seed, `DurationDescriptor`, `ResultReadiness` |
| 2D | `Route` union + `App.tsx`/`Calculator.tsx` dispatch, `chromeRoutes`, `selectPlanSummary` wiring | chrome, `MeinPlanPage`, shell composition, progressive disclosure | `PlanSummary` (`rows`, `deflator`, `gap`, `readiness`) |
| 3 | `portfolioState.ts`, `scenarioDiff.ts`, `contractDecisions.ts`, `workspaceIdentity.ts`, undo/apply/rebase, reference cleanup, tests | before/after flow and saved-alternative management in `CombineWhatIfSection` | `WorkspaceUndo`, `applyWhatIf` result union, `PlanSummary` for both sides |

Shared files with one active editor at a time: `App.tsx` and `Calculator.tsx` (Opus owns routing and state
plumbing; Astra owns visible composition — sequence, never parallel), `MeinPlanPage.tsx`,
`VergleichPage.tsx`, `InventoryWizard.tsx`.

---

## 9. Risks and open questions for the lead

1. **`mergeDeep` union-key change (§2.4)** touches the load path for every user. It is the cheapest correct
   option and fixes two live bugs, but it is the single riskiest mechanical edit in Phase 1. Confirm you
   want it rather than a third bespoke rescue function.
2. **`scenarioDiff` is index-based on arrays.** Apply and rebase are only sound while the instance arrays
   have not shifted. I propose refusing with `'shape-drift'` rather than switching to instanceId-keyed
   diffing in this project. Making the diff instanceId-aware is the better fix but is scope growth —
   your call.
3. **Export suppression copy.** When `canShowHouseholdTotal === false`, the CSV/PDF cell must be blank or
   a fixed marker, never 0. Astra needs a German string; I need to know whether a blank cell is acceptable
   to the export guardrails.
4. **`'Unbekannt'` collision.** `formatEvidenceStateForExport` already uses `'Unbekannt'` for *absent*
   evidence. I propose absent → `'Keine Angabe'`, explicit unknown → `'Unbekannt'`. Confirm the wording.
5. **Wizard gaps that block "no misleading total".** The wizard never collects
   `pkvMonthlyPremium` / `pPVMonthlyPremium` (defaults 0) and never collects
   `versorgungswerkMonthlyContribution`. Under the readiness policy a PKV user therefore lands in
   `incomplete` until 2A collects the premium. Confirm 2A takes that scope.
6. **`PensionBaseline` narrowing.** The wizard's union (`inventory/types.ts:103`) lacks `'none'`, which the
   domain and the plan both require. Widening it is 2A work; the domain side is mine.
7. **Corrected EP estimate is user-visible.** Existing users' seeded `currentEntgeltpunkte` does not change
   retroactively (it is persisted), but any re-estimate drops ~9.4 %. Confirm we do not migrate stored
   values, only new estimates.
8. **Undo depth.** I have specified one level per surface, session-only. If the mockup implies a longer
   history or survival across reload, say so now — persisting undo means a new storage key.
9. **`/vergleich` and `?s=` interaction.** A share link currently forces compare on `/`. Should `?s=` on
   `/` redirect to `/vergleich`, or keep rendering compare at `/`? I have assumed the latter for
   compatibility.

---

## 10. Lead decisions on §9 (binding for Phases 1–3)

1. **`mergeDeep` union-key change: approved.** Iterate the union of saved and default keys; saved-only keys copy verbatim; keys present in defaults keep today's type-checked merge. Required tests as listed in §2.4, plus a test that `readContributionInput` behaviour is unchanged (retire it only if the union merge makes its test pass unchanged).
2. **`scenarioDiff` stays index-based.** `applyWhatIf` and `rebaseWhatIf` both refuse when any product array's `instanceId` sequence differs from the snapshot (`'shape-drift'`); the UI explains and offers "Neue Änderung ausprobieren". No instanceId-keyed diff in this project.
3. **Export suppression.** Blocked household total exports as an empty cell, and the export's Hinweis section gains one line: `Netto-Gesamtrente nicht berechnet – fehlende Angaben: <labels>`. Never 0, never a placeholder number.
4. **Labels.** Absent metadata → `Keine Angabe`; explicit unknown → `Unbekannt`. UI badge for unknown: `Unbekannt`; for assumed: `Angenommen`.
5. **2A collects PKV premiums** (`pkvMonthlyPremium`, `pPVMonthlyPremium`, each with an explicit unknown) when `publicHealthInsurance === false`, and `versorgungswerkMonthlyContribution` when the pension baseline is Versorgungswerk. Both go through the draft adapters (Opus) and the pension/personal editor UI (Astra).
6. **Widen the wizard `PensionBaseline` union to include `'none'`** (Opus, 2A mechanical).
7. **No migration of stored `currentEntgeltpunkte`.** Only new estimates use the corrected helper. Document the change in `docs/context/rules-and-tax.md` or the nearest existing note.
8. **Undo: one level per surface, in-memory, session-only.** Not persisted.
9. **`?s=` on `/` keeps rendering compare at `/`.** `/vergleich` additionally honours `?s=` if it is cheap; otherwise document it as not supported.
10. `useCombineSimulation` gains a caught error state (`{ bundle | null, error }`) so `selectResultReadiness` can return `'error'` instead of the renderer crashing.

---

## 11. Phase 1 delivered (Opus 5, `claude-opus-5[1m]`)

Implemented on branch `codex/fix-comparison-input-reset`, uncommitted. Signatures below are the
contract Phase 2/3 agents code against.

### `src/domain/inputStatus.ts` (new, React-free)

```ts
type InputStatus = 'unknown' | 'assumed' | 'entered' | 'document'
type InputStatusMap = Record<string, InputStatus>
type PensionEntryMethod =
  | { kind: 'skipped' }
  | { kind: 'document'; monthlyGrossEUR: number }
  | { kind: 'career'; careerStartAge: number; pauseYears: number }
  | { kind: 'years'; contributionYears: number }
  | { kind: 'points'; entgeltpunkte: number }
  | { kind: 'projected-gross'; monthlyGrossEUR: number }

const INPUT_STATUSES: readonly InputStatus[]
const PROFILE_INPUT_STATUS_KEYS: readonly [...]        // 'profile.age' … 'profile.desiredNetMonthlyPension'
const STATUTORY_PENSION_INPUT_STATUS_KEYS: readonly [...]
const RESERVED_INPUT_STATUS_KEYS: readonly [...]       // union of the two above
type ProfileInputStatusKey | StatutoryPensionInputStatusKey | ReservedInputStatusKey

function isInputStatus(value: unknown): value is InputStatus
function sanitizeInputStatusMap(
  value: unknown, options?: { restrictToReservedKeys?: boolean },
): InputStatusMap | undefined                          // undefined when nothing usable survives
function sanitizePensionEntryMethod(value: unknown): PensionEntryMethod | undefined
```

Re-exported from `src/domain/index.ts`.

### Domain fields added (all optional, `schemaVersion` stays 2)

- `InstanceCommon.inputStatus?: InputStatusMap` (`src/domain/instances.ts`), keyed like `evidenceMap`.
- `StatutoryPensionAssumptions.pensionEntryMethod?: PensionEntryMethod` (`src/domain/products/grv.ts`).
- `WorkspaceAssumptionsV2.inputStatus?: InputStatusMap` (`src/domain/workspace.ts`).
- `ScenarioAssumptions.inputStatus?: InputStatusMap` (`src/domain/results.ts`).

### `src/features/results/provenanceHelpers.ts`

```ts
function inputStatusToEvidenceState(status: InputStatus): EvidenceState | undefined
function evidenceStateToInputStatus(evidence: EvidenceState | undefined | null): InputStatus
function inputStatusToProvKind(status: InputStatus): ProvKind
function formatInputStatusForExport(status: InputStatus): string
function formatExportProvenance(
  status: InputStatus | undefined, evidence: EvidenceState | undefined | null,
): string                                              // 'Keine Angabe' when both absent
function resolveInputStatus(
  map: InputStatusMap | undefined, evidence: EvidenceState | undefined, key: string,
): InputStatus                                         // absent → 'assumed'
```

`ProvKind` gains `'unknown'` (`provenance.tsx`); `ProvLabel` renders it as `Unbekannt` via a new
`PROV_LABELS` record. `formatEvidenceStateForExport(undefined)` now returns **`Keine Angabe`**
(was `Unbekannt`).

### `src/app/resultReadiness.ts` (new, pure)

```ts
type ReadinessStatus = 'available' | 'estimated' | 'incomplete' | 'error'
type ReadinessCode = /* the ten codes from §3 */
interface ReadinessReason { code; severity: 'blocking' | 'assumption'; label: string;
                            target: { route: Route; anchor?: string }; instanceId?: string }
interface ResultReadiness { status; reasons; blocking; assumptions; canShowHouseholdTotal: boolean }

function selectResultReadiness(
  workspace: Workspace, simulation: CombineSimulationBundle | null, simulationError?: unknown,
): ResultReadiness
function householdTotalBlockedLabels(readiness: ResultReadiness): string[]

// shared workspace walk, also used by planSummary:
type AnyWorkspaceInstance = InstanceCommon & Partial<{ monthlyContribution; monthlyGrossConversion;
  monthlyGrossContribution; monthlyOwnContribution; payoutMode; zeitrenteYears; payoutPlanEndAge }>
interface WorkspaceInstanceEntry { productId: ProductId; instance: AnyWorkspaceInstance }
function listWorkspaceInstances(wsa: WorkspaceAssumptionsV2): WorkspaceInstanceEntry[]
function isCountedInstance(instance: AnyWorkspaceInstance): boolean   // active | paid_up
const CONTRIBUTION_FIELD_BY_PRODUCT: Record<ProductId, string>
```

### `src/app/planSummary.ts` (new, pure)

```ts
type DurationDescriptor =
  | { kind: 'lifelong' }
  | { kind: 'fixed-term'; endAge: number; years: number }
  | { kind: 'drawdown-shared-horizon'; endAge: number; sharedWith: string[] }
  | { kind: 'avd-plan'; endAge: number }
interface PlanSourceRow { key; instanceId?; productId?; label; netMonthlyNominal; netMonthlyReal;
                          status: InputStatus; duration: DurationDescriptor; target?: Route }
interface PlanSummary { netMonthlyTotalNominal; netMonthlyTotalReal; deflator; yearsUntilRetirement;
                        rows: PlanSourceRow[]; gap?: {...}; readiness: ResultReadiness }

function realDeflator(inflationRate: number, yearsUntilRetirement: number): number
function durationOfInstance(productId, instance, retirementAge, retirementEndAge, rules?): DurationDescriptor
function selectPlanSummary(
  workspace: Workspace, bundle: CombineSimulationBundle, scenarioId: string,
  options?: { simulationError?: unknown; rules?: GermanRules },
): PlanSummary
```

### `src/app/useCombineSimulation.ts`

```ts
type CombineSimulationState = CombineSimulationBundle & { error: unknown | null }
function useCombineSimulation(workspace, rules?): CombineSimulationState
```

`runCombineSimulation` is unchanged (still throws) — the catch lives in the hook.

### `src/features/inventory/inventoryHelpers.ts`

```ts
function estimateEpFromYears(years: number, grossSalaryYear: number, rules?: GermanRules): number
interface CareerEstimateInput { currentAge; careerStartAge; pauseYears?; grossSalaryYear }
type CareerEstimateResult =
  | { ok: true; contributionYears; entgeltpunkte; monthlyGrossEUR;
      assumptions: { durchschnittsentgelt; beitragsbemessungsgrenze; aktuellerRentenwert } }
  | { ok: false; code: 'start-after-now' | 'pauses-exceed-career' | 'no-salary' }
function estimateCareerPension(input: CareerEstimateInput, rules?: GermanRules): CareerEstimateResult
```

### Export wiring

```ts
// src/utils/csvExport.ts
interface CombinePortfolioCsvOptions { …; householdTotalBlocked?: { reasonLabels: string[] } }
function householdTotalSuppressedNotice(reasonLabels: string[]): string
// src/features/results/PrintReport.tsx
interface Props { …; combineHouseholdTotalBlocked?: { reasonLabels: string[] } }
```

Blocked total → empty CSV cell / `—` in the PDF, plus one Hinweis line
`Netto-Gesamtrente nicht berechnet – fehlende Angaben: <labels>`.

### Storage

- `mergeDeep` now iterates the union of saved and default keys; saved-only keys copy verbatim.
  `lastEditedAt`, `visibleInstanceIds` and future additive fields survive; type mismatches still
  fall back to the default; `visibleProducts: []` preservation is unchanged.
- `migrateV1ToV2` carries `inputStatus` and `pensionEntryMethod` (both sanitised) onto the baseline.
- `saveWorkspace(workspace): boolean` — `false` on quota/security failure (was silent). The
  compare-mode write path already returned the same boolean through `safeSetItem`.
- `singletonViewOfWorkspace` carries `inputStatus`; `statutoryPension` (and its `pensionEntryMethod`)
  was already copied wholesale.

### Deviations from the spec, and why

1. **`readContributionInput` was kept, and now also *deletes* a malformed value.** With the union
   merge a corrupt `contributionInput` reaches the strict validator and would fail the whole load —
   the opposite of the intent. Both v1 and v2 paths now normalise it (valid → set, otherwise →
   delete). `src/storage.contributionInput.test.ts` passes unchanged.
2. **Instance-level `inputStatus` is sanitised in `validateWorkspaceAssumptions`'s
   `sanitizeInstances`, not inside `validateInstanceCommon`.** That function is a boolean type guard
   and cannot return a repaired object; it only rejects a non-object `inputStatus`.
3. **Export suppression is a *prop/option*, not a self-computed gate.** `PrintReport` and
   `buildCombinePortfolioCsv` take `combineHouseholdTotalBlocked` / `householdTotalBlocked`; the
   caller (Calculator, phase 2D) passes `householdTotalBlockedLabels(readiness)`. Wiring it inside
   the components would have meant editing `Calculator.tsx`, which this phase does not own. **Until
   2D wires it, exports behave exactly as today.**
4. **`assumed-fees` fires for every contract with no explicit fee metadata**, so a workspace with
   contracts is `estimated`, not `available`, until the user confirms costs. That follows from the
   binding legacy rule "absent → assumed".
5. **A career-estimated statutory pension is not a readiness reason** — the ten `ReadinessCode`s are
   fixed by §3 and none covers it. It surfaces as `PlanSourceRow.status === 'assumed'` on the
   statutory row instead.
6. **`gapNominal` re-inflates the target** (`target / deflator − nominalTotal`) rather than
   comparing a today's-euro wish against a retirement-year total. `gapReal` is
   `target − realTotal`. Both sides of each gap are in one money basis, per §4.
7. **`ProvKind: 'unknown'` has no CSS class yet.** `pec-prov--unknown` (web) and the print pill
   (which maps `unknown` → the neutral `default` class) need styling from the UI owner; the label
   text already distinguishes the two cases.
8. `emptyBundle()` in `useCombineSimulation` casts `portfolioFunding` — constructing a zeroed
   `SalaryResult` there would be a second, silently wrong payroll source. Consumers must gate on
   `error` / readiness before reading it.

### Tests added

`src/domain/inputStatus.test.ts`, `src/app/resultReadiness.test.ts`, `src/app/planSummary.test.ts`,
`src/app/useCombineSimulation.error.test.tsx`, `src/features/inventory/careerPension.test.ts`,
`src/storage.inputStatus.test.ts`, plus cases appended to `src/utils/csvExport.test.ts`,
`src/features/results/PrintReport.test.tsx` and `src/features/results/provenance.test.ts`.
Updated for the deliberate value/label changes: `InventoryWizard.test.ts` (EP constant),
`provenance.test.ts` and `PrintReport.test.tsx` (`Keine Angabe`). No oracle snapshot touched.

---

## 12. Routing/plan plumbing delivered (2C/2D mechanical, Opus 5 `claude-opus-5[1m]`)

Branch `codex/fix-comparison-input-reset`, uncommitted. Signatures below are what the 2B/2C/2D
UI agents code against.

### Routes (`src/app/useRoute.ts`)

```ts
| { kind: 'vergleich' }                                  // /vergleich
| { kind: 'vorsorge-neu' }                               // /vorsorge/neu  (+ ?produkt=<ProductId>)
| { kind: 'vertrag-bearbeiten'; instanceId: string }     // /vertrag/:instanceId/bearbeiten

ROUTES.vergleich
ROUTES.vorsorgeNeu
ROUTES.vertragBearbeiten(instanceId)
```

`pathToRoute` tests `/vertrag/:id/bearbeiten` **before** the bare `/vertrag/:id` pattern — the
latter's `(.+)` is greedy and would otherwise fold `/bearbeiten` into the instance id. Both dynamic
matches keep the `decodeURIComponent` guard (malformed escape → `not-found`, never a throw).
`?produkt=` is read by the page container, not carried in the tagged variant (same convention as
`?scenario=` on `/vergleich/details`).

SEO: only `/vergleich` is registered in `publicRouteRegistry` and prerendered
(`Sparformen vergleichen 2026 | RentenWiki.de`, H1 "Sparformen vergleichen", `inSitemap: true`).
`/vorsorge/neu` and `/vertrag/:id/bearbeiten` are dynamic like `/vertrag/:id`.

### Chrome (`src/ui/chrome/`)

`ChromeNavId` gains `'plan'`. **"Mein Plan" (`/`) and "Vergleich" (`/vergleich`) are now two tabs
with fixed labels and always-distinct destinations** — the mode-dependent relabelling of one shared
tab is gone, and with it the last inert MobileNav placeholder. Six tabs on both desktop and phone.

```
routeToNavId: vergleich, vergleich-detail            → 'compare'
              vertrag, vertrag-bearbeiten,
              vorsorge-neu, kapital                  → 'plan'
activeChromeNavId(home, search, appView):
              ?view=landing                          → 'home'
              appView 'compare' | 'combine'          → 'plan'
```

`navItemLabel(id)` no longer takes `appView`.

### `/` dispatch

| State | Renders |
|---|---|
| fresh (`detectSavedMode() === null`) | `LandingPage` (unchanged) |
| `?view=landing` | `LandingPage` (unchanged) |
| `?s=` share link | compare journey inside `Calculator`, exactly as before |
| saved combine | plan |
| saved compare-only (v1 key, or v2 `mode: 'compare'`) | plan, in its **not-started** state |

Calculator decides with `const [isShareView] = useState(() => hasShareStateInUrl())`; everything
else is the plan. **Nothing on this path writes `workspace.mode`** — the wizard's `onComplete` stays
the only promotion to `'combine'`. `LandingChoice { kind: 'compare' }` navigates to
`ROUTES.vergleich` and carries `visibleProducts` through the existing `pendingChoice` prop, so
`?topic=` preselection keeps working for both kinds.

### `src/app/compareSeed.ts` (new, pure)

```ts
interface CompareSeed { profile: PersonalProfile; assumptions: ScenarioAssumptions }
function seedCompareFromWorkspace(
  workspace: Workspace,
  base: ScenarioAssumptions = defaultAssumptions,
): CompareSeed
```

Copies `baseline.profile`, `inflationRate`, `returnScenarios`, `retirementEndAge` onto `base` and
deep-clones everything it takes. Contracts, contributions, `visibleProducts` and
`equalInputAmountEUR` come from `base` untouched. Neither argument is mutated and no array is
aliased (`compareSeed.test.ts` pins both).

### `src/app/portfolioState.ts`

```ts
function hasStartedPlan(workspace: Workspace): boolean   // pure, React-free
// UsePortfolioStateApi gains:
storageError: boolean
```

`hasStartedPlan` is true when any product array holds an instance or `baseline.lastEditedAt` is set.
`storageError` is `!saveWorkspace(workspace)` from the persist effect; Calculator renders it as an
`ErrorStatePanel` banner reading *"Speichern nicht möglich. Deine Änderungen sind noch nicht
dauerhaft gesichert."*

### Container props the UI agents implement against

```ts
// src/features/vergleich/VergleichJourneyPage.tsx
interface VergleichJourneyControls {
  hasSavedPlan: boolean
  seedFromPlan: () => void
  selectedProducts: readonly ProductId[]
  setSelectedProducts: (next: readonly ProductId[]) => void
  ownMoneyMonthly: number                       // assumptions.equalInputAmountEUR
  setOwnMoneyMonthly: (value: number) => void   // via setSyncedMonthlyContribution
}

// src/features/vorsorge/VorsorgeNeuPage.tsx
interface ContractPickerProps {
  selectedProductId: ProductId | null           // from ?produkt=, null when unknown/absent
  selectedProduct: ProductManifestEntry | undefined
  availableProducts: readonly ProductManifestEntry[]
  onSelectProduct: (productId: ProductId) => void
  onCancel: () => void
  navigate: (target: Route, search?: string) => void
}

// src/features/vertrag-detail/VertragBearbeitenPage.tsx
interface ContractEditorHostProps {
  instance: AnyWorkspaceInstance | null
  productId: ProductId | null
  productLabel: string | null
  instanceId: string
  workspace: Workspace
  onSaved: () => void
  onCancel: () => void
  onOpenDetail: () => void
  navigate: (target: Route, search?: string) => void
}
```

All three render a clearly-marked `PLACEHOLDER` body wired to real state. `VergleichJourneyPage`
also renders today's `VergleichPage` with the results **filtered to the selected products**, and its
CSV / print / copy-link handlers are scoped to the same filtered set. Instance resolution in
`VertragBearbeitenPage` goes through `listWorkspaceInstances`, so the `versicherung` ↔ `insurance`
key mismatch is handled by the registry's `assumptionsKey`, not a second lookup table.

### `MeinPlanPageProps` — new optional props (internals unchanged)

```ts
summary?: PlanSummary
readiness?: ResultReadiness
planNotStarted?: boolean                        // !hasStartedPlan(workspace)
onAddContract?: () => void                      // → ROUTES.vorsorgeNeu
onEditSource?: (row: PlanSourceRow) => void     // → row.target, else ROUTES.vertragBearbeiten(id)
onEditProfile?: () => void                      // → wizard, initialStep 'profile'
onEditPension?: () => void                      // → wizard, initialStep 'pension'
```

### Export suppression is now armed

`Calculator.tsx` computes `selectResultReadiness(workspace, combineSimulation, combineSimulation.error)`
and passes `householdTotalBlockedLabels(readiness)` into both export paths:
`PrintReport.combineHouseholdTotalBlocked` and a local `handleExportCsvCombine` that calls
`buildCombinePortfolioCsv({ …, householdTotalBlocked })`. A blocked total exports as an empty cell
plus the Hinweis line, never a number. Pinned by `Calculator.readiness-export.test.tsx`.

### Deviations from the brief

1. **`storageError` is surfaced in `Calculator.tsx`, not `AppShell`/`StatusBar`.** Those two files
   were outside the allowed set; the banner uses the same `ErrorStatePanel` pattern as `invalidLink`
   and sits in the same place. Moving it into the shell is a one-line prop thread when 2D-UI owns
   those files.
2. **The combine CSV is built in `Calculator.tsx` rather than in `useDerivedViews`.**
   `CombineExportBundle` has no slot for `householdTotalBlocked`, and widening it would edit a file
   this phase does not own. `useDerivedViews.handleExportCsv` is untouched and still correct for
   every other caller.
3. **`wizardInitialStep` is Calculator-local state and is not yet passed to `InventoryWizard`.**
   The wizard does not declare the prop, and adding it would edit a 2A file. The TODO at the call
   site names the follow-up; `onEditProfile` / `onEditPension` already record which editor the user
   asked for.
4. **The chrome now has six tabs, not five.** Making "Mein Plan" and "Vergleich" always-distinct
   destinations requires two tab ids. Phone keeps all six; if that is too dense, the fix is a
   layout decision for the UI owner, not a routing one.
5. **`kapital` moved from the `compare` tab to `plan`.** It is dual-source, but it is reached from
   Mein Plan, and leaving it on `compare` would have lit the comparison tab from inside the plan.

---

## 12. 2A mechanical delivered (Opus 5, `claude-opus-5[1m]`)

Onboarding/profile/pension draft state and adapters. Implemented on branch
`codex/fix-comparison-input-reset`, uncommitted. `InventoryWizard.tsx` was **not** touched — the UI
agent owns it. Signatures below are the contract the 2A UI package codes against.

### `src/features/inventory/onboardingDraft.ts` (new, pure, React-free)

```ts
// --- Field<T> ---
type FieldStatus = 'entered' | 'document' | 'assumed'        // = Exclude<InputStatus, 'unknown'>
type Field<T> =
  | { value: T; status: FieldStatus }
  | { value: null; status: 'unknown'; previousValue?: T }

function entered<T>(v: T): Field<T>
function documented<T>(v: T): Field<T>
function assumed<T>(v: T): Field<T>
function unknownField<T>(previousValue?: T): Field<T>        // also exported as `unknown`
function fieldFromStatus<T>(value: T, status: InputStatus): Field<T>
function isUnknown<T>(f: Field<T>): boolean
function fieldValue<T>(f: Field<T>): T | null                // null exactly for 'unknown'
function fieldValueOr<T>(f: Field<T>, fallback: T): T
function previousFieldValue<T>(f: Field<T>): T | undefined
function setUnknown<T>(f: Field<T>): Field<T>                // preserves previousValue
function setValue<T>(f: Field<T>, value: T, status?: FieldStatus): Field<T>   // typing 0 clears unknown
// one-key draft mutators — neighbours are never touched:
function markFieldUnknown<D extends object, K extends keyof D>(draft: D, key: K): D
function setDraftFieldValue<D extends object, K extends keyof D>(
  draft: D, key: K, value: unknown, status?: FieldStatus,
): D

// --- Profile ---
type EmploymentKind = 'employee' | 'self_employed' | 'civil_servant' | 'other'
type PensionSystem = PensionBaselineType                     // 'grv'|'versorgungswerk'|'beamtenpension'|'none'
type RetirementHealthStatusValue = 'kvdr' | 'freiwillig_gkv' | 'pkv'

const PROFILE_FIELD_KEYS: readonly [
  'age', 'grossSalaryYear', 'employment', 'publicHealthInsurance',
  'pkvMonthlyPremium', 'pPVMonthlyPremium', 'retirementAge', 'desiredNetMonthlyPension',
]
type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number]

interface ProfileDraft {
  age: Field<number>
  grossSalaryYear: Field<number>          // same engine field for employees and self-employed;
                                          // only the label switches ("Gewinn vor Steuern pro Jahr")
  employment: Field<EmploymentKind>
  publicHealthInsurance: Field<boolean>
  pkvMonthlyPremium: Field<number>        // profile.pkvMonthlyPremium
  pPVMonthlyPremium: Field<number>        // profile.pPVMonthlyPremium
  retirementAge: Field<number>
  desiredNetMonthlyPension: Field<number>
  // carried through untouched so editing never loses them:
  taxClass: PersonalProfile['taxClass']
  childBirthYears: number[]
  churchTax: boolean
  healthAdditionalContributionPct: number
  partner?: PersonalProfile
}

const PENSION_SYSTEMS_BY_EMPLOYMENT: Record<EmploymentKind, readonly PensionSystem[]>
// employee → ['grv']; civil_servant → ['beamtenpension'];
// self_employed → ['grv','versorgungswerk','none']; other → all four.
function defaultPensionSystemFor(e: EmploymentKind): PensionSystem
function employmentChoosesPensionSystem(e: EmploymentKind): boolean   // true for self_employed/other
function employmentFromPensionSystem(s: PensionSystem): EmploymentKind

// --- Pension ---
type PensionMethod = PensionEntryMethod['kind']
  // 'skipped' | 'document' | 'career' | 'years' | 'points' | 'projected-gross'
const PENSION_FIELD_KEYS: readonly [
  'monthlyGrossEUR', 'careerStartAge', 'pauseYears', 'contributionYears', 'entgeltpunkte',
  'versorgungswerkMonthlyContribution', 'versorgungswerkEmployerMonthly', 'retirementHealthStatus',
]
type PensionFieldKey = (typeof PENSION_FIELD_KEYS)[number]

interface PensionDraft {
  system: PensionSystem
  method: PensionMethod
  monthlyGrossEUR: Field<number>          // shared by 'document' and 'projected-gross'
  careerStartAge: Field<number>
  pauseYears: Field<number>
  contributionYears: Field<number>
  entgeltpunkte: Field<number>
  versorgungswerkMonthlyContribution: Field<number>
  versorgungswerkEmployerMonthly: Field<number>
  retirementHealthStatus: Field<RetirementHealthStatusValue>
}
function pensionMethodsForSystem(s: PensionSystem): readonly PensionMethod[]
// grv → all six; versorgungswerk/beamtenpension → document | projected-gross | skipped; none → []

// --- Validation (rejects, never clips) ---
type ProfileDraftErrors = Partial<Record<ProfileFieldKey, string>>
type PensionDraftErrors = Partial<Record<PensionFieldKey | 'method' | 'system', string>>
function validateProfileDraft(d: ProfileDraft): ProfileDraftErrors
function validatePensionDraft(d: PensionDraft, profile: ProfileDraft): PensionDraftErrors
function isValid(errors: Record<string, string | undefined>): boolean
const MIN_AGE = 18, MAX_AGE = 80, MAX_RETIREMENT_AGE = 90, MIN_CAREER_START_AGE = 14

// --- Estimation ---
interface PensionEstimateAssumptions { durchschnittsentgelt; beitragsbemessungsgrenze; aktuellerRentenwert }
type PensionDraftEstimate =
  | { ok: true; method: PensionMethod; contributionYears: number | null;
      entgeltpunkte: number | null; monthlyGrossEUR: number;
      assumptions: PensionEstimateAssumptions; note: string }
  | { ok: false; code: 'start-after-now' | 'pauses-exceed-career' | 'no-salary'
                     | 'not-estimable' | 'invalid-input'; message: string }
function estimateFromPensionDraft(d: PensionDraft, p: ProfileDraft, rules?: GermanRules): PensionDraftEstimate

// --- Adapters ---
function profileDraftFromScenario(scenario: Scenario): ProfileDraft
function pensionDraftFromScenario(scenario: Scenario): PensionDraft
function applyOnboardingToScenario(
  scenario: Scenario, profileDraft: ProfileDraft, pensionDraft: PensionDraft, rules?: GermanRules,
): Scenario
function createFreshOnboardingScenario(now?: Date): Scenario
```

Binding behaviour:

- **Legacy-conservative reads.** Both `*FromScenario` adapters resolve every status through
  `resolveInputStatus`, so absent metadata is `'assumed'` — never `'unknown'`, never `'entered'`.
  Neither adapter writes anything; opening an editor confirms nothing.
- **Method reconstruction.** `pensionEntryMethod` rebuilds the method *and* its inputs (career start
  and pauses, direct years, direct points, the gross amount). Legacy data with no entry method infers
  `projected-gross` when `manualMonthlyGross !== null`, otherwise `points`.
- **Unknown never writes 0.** `applyOnboardingToScenario` leaves the engine field at its previous
  value (or its default) and records `'unknown'` in `assumptions.inputStatus`.
- **`'none'` vs `'skipped'`.** `system: 'none'` writes `pensionBaselineType: 'none'` with status
  `entered`, carries **no** `pensionEntryMethod`, and *clears* the two statutory status keys so a
  stale `'unknown'` from an earlier skip cannot keep blocking the total. `method: 'skipped'` writes
  `{ kind: 'skipped' }` and marks both statutory keys `'unknown'` while leaving the engine values
  alone.
- **Method semantics.** `career` seeds `currentEntgeltpunkte` from `estimateCareerPension` and marks
  it `'assumed'` (§7); `years` seeds it from `estimateEpFromYears` and also marks it `'assumed'`
  (the years are entered, the points are derived); `points` writes the user's Entgeltpunkte with the
  field's own status; `document` writes `manualMonthlyGross` with status `'document'`;
  `projected-gross` writes it with the field's own status. `career`/`years`/`points` reset
  `manualMonthlyGross` to `null` so a stale override cannot silently win.
- Only the reserved scenario-level keys are written. `retirementHealthStatus` and the two
  Versorgungswerk contributions have no reserved key, so their engine values persist but their status
  always reads back `'assumed'`. `employment` is UI-only (no `PersonalProfile` field) and is
  reconstructed from `pensionBaselineType`.

### `src/features/inventory/useOnboardingDraft.ts` (new)

```ts
type OnboardingStep = 'profile' | 'pension'
interface UseOnboardingDraftOptions { scenario: Scenario; initialStep?: OnboardingStep; rules?: GermanRules }

function useOnboardingDraft(options: UseOnboardingDraftOptions): {
  step: OnboardingStep
  setStep: (step: OnboardingStep) => void
  profile: ProfileDraft
  pension: PensionDraft
  patchProfile: <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => void
  patchPension: <K extends keyof PensionDraft>(key: K, value: PensionDraft[K]) => void
  setProfileValue: (key: ProfileFieldKey, value: unknown, status?: FieldStatus) => void
  setPensionValue: (key: PensionFieldKey, value: unknown, status?: FieldStatus) => void
  setFieldUnknown: { (section: 'profile', key: ProfileFieldKey): void
                     (section: 'pension', key: PensionFieldKey): void }
  errors: { profile: ProfileDraftErrors; pension: PensionDraftErrors }
  isComplete: boolean
  estimate: PensionDraftEstimate
  commit: () => Scenario | null        // null when either step is invalid
  reset: () => void
}
```

No persistence inside the hook: the caller passes the committed `Scenario` to `replaceWorkspace` /
`setBaseline`. **The `scenario` option must be stable across renders** — the hook re-seeds both
drafts when `scenario.id` changes, so a scenario constructed inline in the render body re-seeds
forever. Hold it in `useState`/`useMemo`, or key the host component.

### Other changes

- `src/features/inventory/types.ts` — `PensionBaseline` widened to include `'none'` (lead decision
  §10.6). `inventoryProductRegistry.ts`, `inventoryHelpers.ts` and `fieldHelpers.ts` needed no
  change; `InventoryWizard.tsx` still compiles untouched.
- Copy catalog: `landing.copy.json` lost the `en` values on the three `landing.step.*.body` entries
  (the deliberate partial-EN-coverage fixture the bilingual/inventory tests assert against); every
  other EN string kept. `catalog.test.ts` updated to the new landing DE/EN strings
  (`Meine Rente einschätzen`, `Sparformen vergleichen`, `Deine Vorsorge. Verständlich.` and the new
  hero keys).

### Tests

`src/features/inventory/onboardingDraft.test.ts` (38 cases) and
`useOnboardingDraft.test.tsx` (7 cases): field helpers (typed 0 clears unknown, unknown preserves the
previous value, neighbours untouched), validation rejecting without clipping, the estimate going
through the corrected rules-backed helper, legacy round-trip with no metadata (`assumed`, values
preserved), fully-entered round-trip, `'none'` vs `'skipped'`, stale-unknown clearing, and unknown
PKV leaving the engine value unchanged.

Verification: `npx tsc -b` clean, `npm run lint` clean,
`npx vitest run src/features/inventory src/content/copy src/app src/storage` → 58 files, 1076 tests
passing. `npm run verify` deliberately not run (shared checkout). Nothing committed.

### Deviations

1. **`estimateFromPensionDraft` returns a discriminated union, not a `Calc<>`** as the journey map
   sketched. `ok: false` carries the `estimateCareerPension` code plus `'not-estimable'` (skipped /
   `system: 'none'`) and `'invalid-input'` (the method's own field is unknown), each with a German
   `message`; `ok: true` carries `contributionYears`/`entgeltpunkte` as `number | null` because
   `document` and `points` do not produce both.
2. **Each method requires its own primary input.** `validatePensionDraft` rejects e.g. a `document`
   method with an unknown amount and tells the user to pick "Später ergänzen" instead. The unknown
   path for the statutory pension is the `skipped` method, not an emptied-out method.
3. **`employment` is not persisted.** `PersonalProfile` has no occupation field and adding one is
   outside this package; it is reconstructed from `pensionBaselineType` and always reads back
   `'assumed'`. If the UI needs the distinction to survive a reload, that is a domain change for a
   later package.
4. **`retirementHealthStatus` and the Versorgungswerk contributions have no status key.** The
   reserved scenario-level key set is fixed in `domain/inputStatus.ts` and
   `sanitizeInputStatusMap({ restrictToReservedKeys: true })` drops anything else, so their values
   round-trip but their provenance does not. Extending the reserved set would be a Phase 1 change.
5. **The hook adds `setProfileValue` / `setPensionValue` / `isComplete`** beyond the specified
   surface, so the UI never has to compose `setValue` by hand — which is where a "typing 0 keeps the
   unknown" bug would otherwise creep back in.

---

## 13. 2B mechanical + Phase 3 delivered (Opus 5, `claude-opus-5[1m]`)

Contract-draft adapters and the mutation/undo API. Branch `codex/fix-comparison-input-reset`,
uncommitted. Signatures below are what the 2B UI package and `CombineWhatIfSection` code against.
`InventoryWizard.tsx` and `src/features/vergleich/**` were **not** touched.

### `src/features/inventory/contractDraft.ts` (new, pure, React-free)

Reuses the `Field<T>` vocabulary from `onboardingDraft.ts` verbatim — no second unknown model.

```ts
type ContractFieldValue = number | string | boolean
type ContractFieldKind  = 'number' | 'boolean' | 'text' | 'select'
type ContractFieldUnit  = 'EUR' | 'EUR/Monat' | 'ratio' | 'year' | 'age' | 'years' | 'count' | 'none'
type ContractFieldSection = 'minimum' | 'details' | 'fees'
type ContractUnknownMode  = 'explicit-unknown' | 'assumed-default' | 'none'
type ContractInstanceLike = object
type ContractFieldState   = InputStatus | 'empty'

interface ContractFieldSpec {
  id; path; labelKey; label; kind; unit; section
  min?; max?; step?; options?: readonly { value: string; label: string }[]
  supportsUnknown: boolean; unknownMode: ContractUnknownMode
  core?: boolean; mirrorPaths?: readonly string[]
  visibleWhen?: (draft: ContractDraft) => boolean
}

interface ContractDraft {
  productId: MultiInstanceProductId
  instanceId?: string
  base: Record<string, unknown>          // edited instance, or the registry default
  fields: Readonly<Record<string, Field<ContractFieldValue>>>
  pending: readonly string[]             // core fields still unanswered
  evidenceMap: Readonly<Record<string, EvidenceState>>
  inputStatus: Readonly<InputStatusMap>
}

const CONTRACT_FIELD_SPECS: Record<MultiInstanceProductId, readonly ContractFieldSpec[]>
const FEE_STATUS_KEY_BY_PRODUCT: Record<MultiInstanceProductId, string>   // mirrors resultReadiness
function fieldSpecs(productId): readonly ContractFieldSpec[]
function visibleFieldSpecs(draft): readonly ContractFieldSpec[]

function draftFromInstance(productId, instance: ContractInstanceLike): ContractDraft
function newDraft(productId, context?: { currentYear?: number; age?: number }): ContractDraft
function newDraftFromWorkspace(productId, workspace, currentYear?): ContractDraft

function draftFieldValue(draft, id): ContractFieldValue | null      // null for unknown AND empty
function draftFieldState(draft, id): ContractFieldState
function isDraftFieldUnknown(draft, id): boolean
function patchDraftField(draft, id, value, status?: FieldStatus): ContractDraft
function setDraftFieldUnknown(draft, id): ContractDraft

type ContractDraftErrors = Record<string, string>
function validateDraft(draft): ContractDraftErrors
function isDraftValid(errors): boolean
function contractDraftDirty(draft, initial): boolean

interface ContractDraftPatch {
  patch: Record<string, unknown>          // nested objects (fees/eligibility) complete
  inputStatus: InputStatusMap
  evidenceMap: Record<string, EvidenceState>
}
function draftToInstancePatch(draft): ContractDraftPatch
function draftToNewInstance(draft, makeId?): Record<string, unknown>
function contributionFieldId(productId): string
```

Fields per product (only what exists on the domain instance type):

| Product | minimum | details | fees |
|---|---|---|---|
| bAV | `currentValueEUR`, `monthlyGrossConversion`, `contractStartYear`, `durchfuehrungsweg`, `statutoryMinimumSubsidyEnabled`, `contractualFixedMonthly` | name, `anbieter`, `status`, `contractualMatchPercent`, `pre2005EligibleTaxFree` (only for §40b), `payoutMode`, `rentenfaktor` (leibrente), `zeitrenteYears` (zeitrente), `annualContributionGrowthRate` | all 7 `FeeModel` fields |
| pAV | `currentValueEUR`, `monthlyContribution`, `contractStartYear` | + `oldContractTaxFreeEligible` (only ≤ 2004), `payoutMode`, `rentenfaktor`, `zeitrenteYears`, `surrenderHaircutPct`, `annualContributionGrowthRate` | all 7 |
| Basisrente | `currentValueEUR`, `monthlyGrossContribution` | + `contractStartYear`, `payoutMode` (leibrente only), `rentenfaktor` | all 7 |
| Riester | `currentValueEUR` (mirrors `existingCapital`), `monthlyOwnContribution`, `eligibility.directlyEligible` | + `contractStartYear`, `eligibility.{indirectSpouseEligible,ageAtContractStart,careerStarterBonusUsed}`, `payoutMode`, `rentenfaktor`, `zeitrenteYears` | all 7 |
| AVD | `currentValueEUR`, `monthlyOwnContribution`, `eligibility.directlyEligible` | + `contractStartYear`, `eligibility.{eligibleChildren,indirectSpouseEligible,ageAtContractStart,careerStarterBonusUsed}`, `subtype`, `payoutMode`, `payoutPlanEndAge`, `rentenfaktor` | all 7 |
| ETF | `currentValueEUR`, `monthlyContribution` | + `contractStartYear`, `annualAssetFee` (TER), `annualContributionGrowthRate` | — |

Binding behaviour:

- **Legacy-conservative reads.** `draftFromInstance` resolves every status through `resolveInputStatus`,
  so an instance with no metadata reads back entirely `'assumed'`. Opening an editor writes nothing.
- **Unknown never writes a value.** `draftToInstancePatch` omits the path entirely, records
  `inputStatus[id] = 'unknown'` and **deletes** `evidenceMap[id]`. A typed `0` writes a real 0 with
  status `'entered'` and clears the unknown. Neighbouring fields are never touched.
- **`'empty'` is a fourth, draft-only state.** A new contract's `currentValueEUR` and contribution start
  in `pending`; `validateDraft` rejects them until the user types a number or ticks unknown. Nothing
  persists an `'empty'`; a committed pending field records `'assumed'` and keeps the registry default.
- **bAV Durchführungsweg unknown = model default as `assumed`** (`unknownMode: 'assumed-default'`,
  lead decision). It is the only field with that mode.
- **Fees.** `FEE_STATUS_KEY_BY_PRODUCT` is stamped `'entered'` as soon as one fee input carries a user
  status, so a fully-specified contract can reach readiness `available`; untouched fee metadata stays
  `'assumed'`.
- **Bounds reject, never clip** — an existing over-threshold Eigenbeitrag survives opening the editor.

### `src/features/inventory/useContractDraft.ts` (new)

```ts
function useContractDraft(options: {
  productId: MultiInstanceProductId
  instance: Record<string, unknown> | null      // null → new contract
  workspace: Workspace
  currentYear?: number
}): {
  draft: ContractDraft
  specs: readonly ContractFieldSpec[]           // all, including hidden
  visibleSpecs: readonly ContractFieldSpec[]    // visibleWhen applied
  patchField: (id, value, status?: FieldStatus) => void
  setFieldUnknown: (id) => void
  errors: ContractDraftErrors
  valid: boolean
  dirty: boolean
  toPatch: () => ContractDraftPatch
  reset: () => void
}
```

Re-seeds only when `productId` or the instance id changes — a background re-render of the plan never
throws away what the user is typing.

### `src/app/portfolioState.ts` — mutation and undo API (§5)

```ts
interface WorkspaceUndo { id: string; label: string; createdAt: number; previous: Workspace }
type WhatIfApplyFailure = 'stale' | 'shape-drift' | 'not-found'
type ApplyWhatIfResult  = { ok: true; undo: WorkspaceUndo } | { ok: false; reason: WhatIfApplyFailure }
type RebaseWhatIfResult = { ok: true; undo: WorkspaceUndo } | { ok: false; reason: 'not-found' | 'shape-drift' }

// pure, exported
function whatIfSnapshotTime(whatIf): number
function whatIfIsStale(whatIf, baseline): boolean
function productArrayShapeMatches(a: Scenario, b: Scenario): boolean
function applyWhatIfToBaseline(whatIf, baseline): Scenario

// UsePortfolioStateApi additions / changes
addPopulatedInstance(productId, instance, status?: InputStatusMap): { instanceId: string; undo: WorkspaceUndo }
updateInstance(productId, instanceId, patch: Partial<AnyInstance>, status?: InputStatusMap): void
removeInstance(productId, instanceId): WorkspaceUndo
removeWhatIf(id): WorkspaceUndo
applyWhatIf(id): ApplyWhatIfResult
tryRebaseWhatIf(id): RebaseWhatIfResult
rebaseWhatIf(id): void            // unchanged signature; now a no-op on shape drift
undo(handle: WorkspaceUndo): void
lastUndo: WorkspaceUndo | null
```

- **Atomicity.** Every mutation goes through one internal `commit(label, next)` → exactly one
  `setWorkspace` with a fully-formed workspace, plus the undo handle for the state it replaced.
- **Stamping.** `addInstanceToWorkspace` and `removeInstanceFromWorkspace` now stamp
  `baseline.lastEditedAt` (both were missing it), as do add/update/remove/apply.
- **`removeInstanceFromWorkspace` reference cleanup**, one transaction: instance removed; `transferEvents`
  naming it as source or target dropped from **every other** instance in every product array;
  `visibleInstanceIds` and `pinnedComparisonIds` filtered; what-ifs referencing the id have `frozenAt`
  cleared (marked stale, never deleted).
- **Staleness** = `baseline.lastEditedAt > max(Date.parse(snapshot.createdAt), snapshot.lastEditedAt ?? 0)`.
  The `max` is what lets a rebase clear staleness — `snapshot.createdAt` alone never moves. Freezing
  does **not** grant apply permission.
- **`applyWhatIf`** diffs `derivedFromBaselineSnapshot → whatIf` and applies that list to the *current*
  baseline, preserving baseline identity. Refusal order: `not-found` → `shape-drift` → `stale`
  (drift first: it is the failure a rebase cannot fix).

### `src/app/whatIfPreview.ts` (new, pure)

```ts
type WhatIfChange = { kind: 'contribution'; monthly: number } | { kind: 'paid_up' }
function whatIfLabel(instanceLabel: string, change: WhatIfChange): string
function buildContributionWhatIf(workspace, instanceId, change): WhatIfScenario | null
function describeWhatIf(whatIf): WhatIfDescription
function whatIfStatus(whatIf, workspace): 'current' | 'stale' | 'shape-drift' | 'missing-source'

interface WhatIfDescription {
  instanceId: string | null; instanceLabel: string | null; productId: ProductId | null
  decision: 'contribution' | 'paid_up' | 'other'
  beforeContributionMonthly: number | null; afterContributionMonthly: number | null
  sourceRevision: { baselineId: string; createdAt: string; snapshotTime: number; frozenAt?: number }
}
```

No simulation here: the caller runs `runCombineSimulation` on the baseline and on the returned what-if,
so both preview sides come from the same engine. The baseline is never mutated (`forkBaselineScenario`
and `applyContractDecision` both deep-clone). `paid_up` reuses the shipped `beitragsfreiWhatIf`
decision rather than re-deriving what beitragsfrei means. Labels per §4: `"{label}: {Betrag} Beitrag /
Monat"` / `"{label}: keine weiteren Beiträge"`.

### Containers wired (placeholder bodies kept)

`ContractEditorHostProps` (`VertragBearbeitenPage.tsx`) and `ContractPickerProps`
(`VorsorgeNeuPage.tsx`) both gain: `draft`, `fieldSpecs` (visible only), `patchField`,
`setFieldUnknown`, `errors`, `dirty`, `save(): boolean`, `undo(handle)`; the editor additionally has
`cancel()` and `remove(): WorkspaceUndo | null`. `save` validates first and writes nothing when
invalid; the editor routes through `updateInstance`, the picker through `draftToNewInstance` +
`addPopulatedInstance`.

### Deviations

1. **`ContractDraft` is one shape with a spec-driven `fields` record, not a six-member discriminated
   union.** A union would have meant six hand-written adapter pairs; the declarative table gives
   `fieldSpecs()`, the adapters, the bounds and the conditional visibility from one source, and
   per-product field sets are still enumerated exhaustively in `CONTRACT_FIELD_SPECS`. Field ids are
   plain strings rather than a per-product literal union — the UI drives off `fieldSpecs()` anyway.
2. **`'empty'` lives in `ContractDraft.pending`, not inside `Field<T>`.** Widening `Field<T>` would have
   forked the shared 2A helper. Read it via `draftFieldState`, which returns `'empty'`; `draftFieldValue`
   returns `null` for both empty and unknown.
3. **`updateInstance` returns `void` as specified**, but still records `lastUndo`, so an edit is
   undoable from the status bar without changing the contracted signature.
4. **`rebaseWhatIf(id)` keeps its `void` signature and becomes a silent no-op on shape drift.**
   `tryRebaseWhatIf` is the reporting variant. Existing callers (`AngabenProduktePage` →
   `CombineWhatIfSection`) compile unchanged; they now refuse a corrupting rebase instead of performing it.
5. **`workspaceRef` is synced in an effect, not during render** (`react-hooks/refs` forbids the latter).
   Two mutations in the *same* tick still compose because `commit` writes the ref directly; a mutation
   fired in the same tick as `replaceWorkspace` / `patchBaseline` (which use functional updaters) would
   read a one-render-old workspace. No current call site does that.
6. **Riester `existingCapital` is mirrored from `currentValueEUR`** via `mirrorPaths`, matching the
   existing `draftToInstance` behaviour, so the two copies of the balance cannot disagree.
7. **Both containers call `usePortfolioState()` independently** (pre-existing pattern from the routing
   package). Persistence is through localStorage, so a save on `/vorsorge/neu` reaches the plan on
   navigation; there is no shared context. Worth revisiting in Phase 4 if two hosts ever mount at once.

### Tests

`src/features/inventory/contractDraft.test.ts` (26), `useContractDraft.test.tsx` (8),
`src/app/portfolioState.mutations.test.tsx` (18), `src/app/whatIfPreview.test.ts` (14). Covered:
unknown ≠ 0 through draft → patch, typed 0 clears unknown, unknown leaves neighbours alone, legacy
instance with no metadata → all `assumed`, bounds rejected not clipped, the Durchführungsweg
`assumed-default` path, fee-status stamping, the Riester mirror; `removeInstance` transfer/pin/
visibility cleanup + `lastEditedAt` + what-if staleness + deep-equal undo restore; `applyWhatIf`
writing only the intended field and refusing `stale` / `shape-drift` / `not-found`; rebase refusing
shape drift; `buildContributionWhatIf` leaving the baseline untouched. Paired compare-mode singleton
assertions per the `CLAUDE.md` cron guardrails in both `contractDraft.test.ts` and
`whatIfPreview.test.ts`, plus a compare-mode no-instance `updateInstance` no-op.

Verification: `npx tsc --noEmit -p tsconfig.app.json` clean apart from six pre-existing errors in
`src/features/qa-feedback/__tests__/modal-coverage.test.tsx` (concurrent `InventoryWizardProps`
rewrite). `npm run lint` clean. `npx vitest run src/app src/features/inventory
src/features/vertrag-detail src/features/vorsorge src/engine/portfolioTransfer` → 957 passing, 2
failing in `src/App.simplification-routes.test.tsx` (`/vergleich` renders the concurrent 2C agent's
result view instead of `data-testid="vergleich-setup"`, because `VergleichJourneyView` now opens on
`'result'` whenever products are pre-selected — that test's expectation needs updating by the
`/vergleich` owner). `npm run verify` deliberately not run (shared checkout). Nothing committed.

---

## 13. Active-method validation + `/alternativen` route (Opus 5, `claude-opus-5[1m]`)

Branch `codex/fix-comparison-input-reset`, uncommitted. Two small mechanical changes.

### `validatePensionDraft` validates only the active method

`PensionDraft` keeps every method's raw inputs simultaneously so switching between "Renteninformation
liegt vor", "Ohne Unterlagen grob schätzen" and the direct years/points entries never discards typing.
The validator did not honour that: it range-checked **every** field regardless of `method`, so a stale
number left behind in a field the user could no longer see blocked saving — including after choosing
"Später ergänzen", where nothing at all is committed.

```ts
// src/features/inventory/onboardingDraft.ts (new export)
function activePensionFields(system: PensionSystem, method: PensionMethod): readonly PensionFieldKey[]
```

| system / method | active fields |
|---|---|
| `system === 'none'` | none — a complete answer in itself |
| `skipped` | none (plus the Versorgungswerk pair when that is the system) |
| `document` / `projected-gross` | `monthlyGrossEUR` |
| `career` | `careerStartAge`, `pauseYears` |
| `years` | `contributionYears` |
| `points` | `entgeltpunkte` |
| `system === 'versorgungswerk'` | the two `versorgungswerk*` contributions, for **every** method — they belong to the system, not to a method |

`validatePensionDraft` now checks exactly those, and the per-method "primary input missing" messages
folded into the same pass (the old two-pass structure — range checks first, required-input checks
after — could not survive the narrowing). The method-vs-system compatibility error (`errors.method`)
is unchanged and still fires for every system except `none`.

`useOnboardingDraft` needed **no** edit: `isComplete` and `commit` both call `validatePensionDraft`,
so they inherit the rule. `applyOnboardingToScenario` already committed the active method's fields
only, so no commit-path behaviour changed.

Tests (`onboardingDraft.test.ts`, new `validatePensionDraft — active method only` block, +6):
`skipped` and `system: 'none'` validate clean with garbage in every field; an active `career` ignores
an out-of-range `contributionYears` left over from the years method; switching method surfaces exactly
that method's error keys; the Versorgungswerk pair stays active under `skipped`.

### `/alternativen`

```ts
| { kind: 'alternativen' }   // /alternativen  (+ ?id=<whatIfId>)
ROUTES.alternativen
routeToNavId('alternativen') → 'plan'
```

The what-if id travels in the query string, read by the container — same convention as `?produkt=` on
`/vorsorge/neu`. **Not** registered in `publicRouteRegistry` and not prerendered: the surface depends
entirely on workspace state, like `/vertrag/:id`.

`src/features/alternativen/AlternativenPage.tsx` is the container; `alternativenParams.ts` holds
`resolveWhatIfParam` (split out so the page module exports components only — react-refresh). It
resolves the workspace via `usePortfolioState` and the baseline via `useCombineSimulation`, keeps the
selection in step with `rentenwiki:navigated`, and falls back to the list when `?id=` names a what-if
the workspace no longer holds. The body below the PLACEHOLDER marker is throwaway.

```ts
export interface AlternativenHostProps {
  workspace: Workspace
  baselineSimulation: CombineSimulationState   // carries its own `error`
  whatIfs: readonly WhatIfScenario[]
  openWhatIfId: string | null                  // null for absent or stale ?id=
  navigate: (target: Route, search?: string) => void
  onReturnToPlan: () => void                   // → ROUTES.home
}
```

No Phase 3 mutation API is consumed: none is exported from `portfolioState.ts` yet, and importing a
not-yet-existing symbol would break the shared checkout. The UI agent wires those in when they land.

Tests: route round-trip + trailing slash (`useRoute.test.ts`), nav-tab mapping
(`chromeRoutes.test.ts`), and `AlternativenPage.test.tsx` (param parsing, App dispatch, `?id=` opens
the alternative, stale id falls back to the list).

Verification: `npx tsc -b` clean apart from the same five pre-existing errors in
`src/features/qa-feedback/__tests__/modal-coverage.test.tsx` (concurrent `InventoryWizardProps`
rewrite). `npm run lint` clean. `npx vitest run src/features/inventory/onboardingDraft
src/features/inventory/useOnboardingDraft src/app/useRoute src/ui/chrome src/features/alternativen`
→ 199 passing, 0 failing. `src/App.combine-mode.test.tsx` and `src/App.simplification-routes.test.tsx`
time out on the concurrent `Calculator` / `MeinPlanPage` work — verified identical with HEAD's
`App.tsx` swapped in, so unrelated to this change. Nothing committed.

---

## 14. Alternativen flow delivered (Opus 5, `claude-opus-5[1m]`)

Branch `codex/fix-comparison-input-reset`, uncommitted. The `/alternativen` container now consumes the
Phase 3 mutation and preview APIs, so the UI agent builds the before/after flow purely from props.

### `src/features/alternativen/useAlternativenFlow.ts` (new)

```ts
useAlternativenFlow({
  workspace, portfolioState, baselineSimulation, scenarioId,
  requestedWhatIfId?, onOpenSaved?, rules?,   // see "Deviations"
}): AlternativenFlow
```

`AlternativenHostProps` is now `AlternativenFlow` plus the surrounding context, so every field below
reaches the surface as a prop:

```ts
export interface AlternativenHostProps extends AlternativenFlow {
  workspace: Workspace
  baselineSimulation: CombineSimulationState   // carries its own `error`
  whatIfs: readonly WhatIfScenario[]
  scenarioId: string                           // `basis`, via pickBasisScenarioId
  navigate: (target: Route, search?: string) => void
  onReturnToPlan: () => void                   // → ROUTES.home
}

export interface AlternativenFlow {
  contracts: AlternativenContract[]
  draft: AlternativenDraft
  selectContract: (instanceId: string | null) => void
  setDecision: (decision: AlternativeDecision) => void
  setContribution: (monthly: number | null) => void
  preview: AlternativenPreview | null
  previewError: string | null
  runPreview: () => void
  invalidatePreview: () => void
  saveAlternative: (label?: string) => string | null
  saved: SavedAlternative[]
  openSaved: (id: string | null) => void
  openWhatIfId: string | null
  apply: (id: string) => AlternativenApplyResult
  rebase: (id: string) => AlternativenRebaseResult
  remove: (id: string) => WorkspaceUndo
  undo: () => void
  notification: AlternativenNotification | null
}

export interface AlternativenContract {
  instanceId: string
  label: string
  productId: ProductId
  contributionMonthly: number | null
  contributionStatus: InputStatus
  contributionKind:
    | 'netCost' | 'grossConversion' | 'grossContribution' | 'ownContribution' | 'savingsRate'
  allowedDecisions: ('contribution' | 'paid_up')[]
}

export interface AlternativenDraft {
  instanceId: string | null
  decision: 'contribution' | 'paid_up'
  newContribution: number | null
}

export interface AlternativenPreview {
  whatIf: WhatIfScenario
  before: PlanSummary
  after: PlanSummary
  delta: number | null            // real-basis; null when either side is suppressed
  description: WhatIfDescription  // describeWhatIf
}

export interface SavedAlternative {
  id: string
  label: string
  savedAt: string                 // ISO fork stamp — "Stand beim Speichern"
  status: 'current' | 'stale' | 'shape-drift' | 'missing-source'
  description: WhatIfDescription
  before: PlanSummary | null      // frozen snapshot, simulated
  after: PlanSummary | null       // the what-if, on the snapshot's money basis
  canApply: boolean               // status === 'current'
  blockReason?: string
}

export type AlternativenApplyResult =
  | { ok: true; undo: WorkspaceUndo }
  | { ok: false; reason: 'stale' | 'shape-drift' | 'not-found'; message: string }

export type AlternativenRebaseResult =
  | { ok: true; undo: WorkspaceUndo }
  | { ok: false; reason: 'not-found' | 'shape-drift'; message: string }

export interface AlternativenNotification { message: string; canUndo: boolean }
```

German copy is exported as `ALTERNATIVEN_COPY` so the surface never re-types a sentence:
`stale`, `shapeDrift`, `notFound`, `missingSource`, `noContract`, `noContribution`, `invalidChange`,
`simulationFailed`, `noPreview`, `removed` ("Alternative entfernt."), `applied` ("Änderung in den Plan
übernommen."), `rebased`, `undone` ("Rückgängig gemacht.").

Behaviour worth knowing:

- **Only `apply` writes the baseline.** `runPreview` forks via `buildContributionWhatIf` and simulates
  the fork through `runCombineSimulation`; `saveAlternative` appends via `addWhatIf` + `freezeWhatIf`.
- **One money basis.** `after` is re-deflated with the baseline's deflator (exported `withDeflator`),
  and `delta` is `null` unless both sides have `readiness.canShowHouseholdTotal`.
- **Preview invalidation is structural**, not a convention: the preview records the `baseline` object
  it was built on and resolves to `null` once that reference changes. Draft edits clear it directly;
  `invalidatePreview()` is exposed anyway.
- **Frozen before/after are memoised in a module-level `WeakMap` keyed by the what-if scenario object**,
  so a rebase or a freeze recomputes and a removed alternative is collected.
- **`notification`** maps `portfolioState.lastUndo.label`; because `undo()` clears `lastUndo`, the
  consumed handle id is tracked separately so "Rückgängig gemacht." can be shown at all.

### `src/features/alternativen/alternativenParams.ts`

New `pickBasisScenarioId(workspace)` — `find(s => s.id === 'basis') ?? returnScenarios[0]`, never
positional (CLAUDE.md, "`returnScenarios[0]` is not necessarily 'basis'").

### Deviations

1. **`requestedWhatIfId` / `onOpenSaved` added to the hook input.** The brief's signature has four
   fields, but `openWhatIfId` must stay URL-driven (`?id=`, browser back/forward). When the container
   passes `requestedWhatIfId` the URL wins outright and `openSaved` reaches the selection by pushing
   the query string through `onOpenSaved`; without it the hook keeps the selection itself, which is
   what the hook tests exercise. `rules` is injectable for the same reason it is everywhere else.
2. **`selectPlanSummary` untouched** (not in the allowed set, as the brief anticipated). The baseline
   deflator is applied by re-deflating the "after" summary inside `withDeflator` — nominal figures are
   never rewritten, only `netMonthlyTotalReal`, each row's `netMonthlyReal`, and the gap pair.
3. **`allowedDecisions` guards ETF by registry `productId` on top of `generateContractDecisions`.**
   That helper stays the authority on beitragsfrei, but its `detectSlot` classifies an instance id
   without a known prefix as insurance, which would offer beitragsfrei for an ETF depot. The product id
   from the registry walk is exact. A throwing decision generator falls back to the structural rule
   rather than silently removing a legitimate option.
4. **`saved` is computed eagerly for every stored alternative** (the list shows "Vorher → Nachher"), so
   opening the route runs 2 simulations per saved alternative once; the `WeakMap` makes re-renders free.

### Tests

`src/features/alternativen/useAlternativenFlow.test.tsx` (new, 13 cases, jsdom, real
`usePortfolioState` + `useCombineSimulation` over a storage-seeded two-ETF combine plan): contract list
and contribution kinds; beitragsfrei offered for bAV and withheld for ETF; preview leaves the workspace
deep-equal untouched and shares one deflator; German errors for no contract / no contribution; a draft
edit drops the preview; save survives a `loadSavedWorkspace()` round trip; reopen reproduces the frozen
before/after; a baseline edit makes it `'stale'` with `canApply: false` and the German message while the
frozen basis stays put; removing a *different* contract gives `'shape-drift'`, removing the changed one
gives `'missing-source'`; apply writes only the intended contribution field and leaves the sibling
contract byte-identical; undo restores the workspace deep-equal; remove + undo restores the what-if.

Verification: `npx tsc -b` clean apart from the same five pre-existing
`src/features/qa-feedback/__tests__/modal-coverage.test.tsx` errors (concurrent `InventoryWizardProps`
rewrite). `npm run lint` clean. `npx vitest run src/features/alternativen src/app/whatIfPreview
src/app/portfolioState` → 67 passing, 0 failing. Nothing committed.
