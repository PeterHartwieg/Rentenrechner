# Plan — Optimiere deine Vorsorge

Status: **ready-for-orchestrator** (decisions.md locked 2026-05-05)
Created: 2026-05-05
Source decisions: `decisions.md`. Capability references (Fxx, Exx, Uxx, Lxx, Sxx) point to `PRD.md` "Capability map".

Issues for the slices below are filed under
`.scratch/optimiere-vorsorge/issues/B1..B7-*.md`. Dispatch via the
orchestrator handoff prompt at
`.scratch/optimiere-vorsorge/ORCHESTRATOR-HANDOFF.md`.

## 1. Architecture principles

These trump local optimisation. If a slice tempts breaking one, escalate.

- **A1. Reuse the existing decision pipeline.** Every per-contract change
  flows through `applyContractDecision` in `src/app/contractDecisions.ts`.
  The new modal is an audit + selection UI on top of that pipeline; it
  does not invent its own statutory rules, transfer-event encoding, or
  `WorkspaceDelta` mutations beyond the additive `increase_contribution`
  kind in slice B1.
- **A2. Pure helpers in `src/app/optimiereVorsorge.ts`.** Audit
  aggregation and per-decision delta simulation are React-free. They
  consume `runCombineSimulation` (the non-React factory exported from
  `src/app/useCombineSimulation.ts`) and return plain data. The modal
  consumes those pure outputs.
- **A3. Lazy + memoised delta simulation.** Do not compute
  `deltaNettoRente` for all decisions on modal open. Compute it lazily
  per decision when the user drills into an instance, and memoise by
  `(workspaceFingerprint, decision.id)` for the modal's lifetime. Keeps
  modal-open cheap; keeps drill-in latency bounded.
- **A4. Atom-driven flags.** Audit flags are structured atoms emitted by
  the rules engine (`src/app/recommendations.ts`), not free strings.
  Templates live in `src/content/recommendationCopy.ts`. Future
  filters / language packs / export labels work without changes.
- **A5. Disclaimer-acknowledge state is modal-scoped.** Never persisted
  to localStorage / sessionStorage / URL. Mirrors the session-only
  `DisclaimerBanner` invariant. Every modal open returns to the
  acknowledge step.
- **A6. Materialised what-ifs, frozen baseline.** Save flow uses
  `forkBaselineScenario` then assigns `applied.baseline.assumptions` to
  the resulting what-if's `assumptions`. Same model as
  `ContractDecisionMenu`. Baseline is untouched until the final save and
  even after save (each what-if carries its own `assumptions`).
- **A7. UI rounding boundary.** EUR/month deltas display via
  `formatCurrency(value, 0)`; percent values via `formatPercent(value, 1)`.
  Engine returns floats; rounding stays at the display layer per
  `CLAUDE.md` "UI rounding boundary".

## 2. Slice list

Each slice is a candidate AFK issue under
`.scratch/optimiere-vorsorge/issues/`. Slice IDs map to capability
references in `PRD.md`.

### B1 — Engine: `Beitrag erhöhen` decision (E1, E4)

**Files:**
- `src/app/contractDecisions.ts`
- `src/app/contractDecisions.test.ts`
- `src/app/recommendations.ts` (atom id only)
- `src/content/recommendationCopy.ts` (atom template)

**Changes:**
- Extend `WorkspaceDelta` discriminated union with
  `{ kind: 'increase_contribution'; instanceId: string; newMonthlyEUR: number }`.
- New generator `beitragErhoehenWhatIf(workspace, instanceId, newMonthlyEUR)`:
  returns a `ContractDecision` with `kind: 'beitrag-erhoehen'`. Note the
  existing `ContractDecision.kind` union must also be extended with
  `'beitrag-erhoehen'`.
- New applier `applyIncreaseContribution(wsa, delta)`: writes
  `monthlyContribution = newMonthlyEUR` on the matching instance. Keep
  acquisition-cost handling consistent with how other contribution
  changes are modelled (the existing engine treats
  `monthlyContribution` as the canonical input).
- Statutory cap check (E4): emit `funding_cap_hit` atom when
  `newMonthlyEUR × 12` exceeds the per-product cap (see `decisions.md`
  §4 for cap source per slot). Do **not** clamp.
- Generator skips for `status` ∈ `{surrendered, offered}` (returns
  `null`, caller filters).
- Default `newMonthlyEUR` for first-render: `currentMonthly × 1.5`,
  rounded to nearest €10. UI lets the user edit.

**Tests:**
- bAV: increase from 200 €/mo to 800 €/mo with `currentSalary` near §3
  Nr. 63 cap → emits `funding_cap_hit` with cap value in atom context.
- Riester: increase past 175 €/mo (€2,100/yr) → `funding_cap_hit`.
- AVD: increase past `de2026.altersvorsorgedepot.contributionCapAnnual /
  12` → `funding_cap_hit`.
- ETF: increase from 100 to 500 → no cap atom (cap = ∞).
- Surrendered instance: returns null from generator.

**Done when:** all per-product cases pass; `applyContractDecision` round-
trips the new delta kind.

### B2 — Engine: `simulateContractDecision` (E2)

**Files:**
- `src/app/optimiereVorsorge.ts` (new)
- `src/app/optimiereVorsorge.test.ts` (new)

**Changes:**
- New pure helper:
  ```ts
  export function simulateContractDecision(
    workspace: Workspace,
    decision: ContractDecision,
    rules: Rules,
    baselineCombined: CombinedResult,
  ): { deltaMonthlyNetEUR: number }
  ```
- Implementation: `applyContractDecision(workspace, decision)` →
  `runCombineSimulation(applied, rules)` → diff
  `combined.monthlyNetIncome` against `baselineCombined.monthlyNetIncome`.
- Memoisation helper: `createDecisionSimulationCache()` returning a
  closure keyed by `(workspaceFingerprint, decision.id)`. The fingerprint
  is the existing JSON-stringify of `workspace.baseline.assumptions` (or
  reuse whatever fingerprint is already used in `useCombineSimulation`).

**Tests:**
- Fixture workspace: one bAV @ 1.5% RIY active. `beitragsfrei` decision
  → expect a small **negative** monthly net delta (less accumulation
  → lower payout).
- Fixture workspace: one Riester. `Riester→AVD` certified transfer
  decision → expect a **positive** delta when the AVD has lower fees.
- `weiterfuehren` decision → delta = 0 (within fp tolerance 1e-6).
- `increase_contribution` from 200 → 400 €/mo on a healthy ETF →
  expect positive delta.
- Cache hit returns same instance reference for repeated calls.

**Done when:** all fixture deltas are within ±1 €/mo of a manually
computed `simulatePortfolio` baseline-vs-applied diff.

### B3 — Atoms: audit-flag taxonomy (E3)

**Files:**
- `src/app/recommendations.ts`
- `src/app/recommendations.test.ts`
- `src/content/recommendationCopy.ts`

**Changes:**
- New atom ids in `AtomId` union: `weak_guarantee`, `low_flexibility`,
  `missing_offer_data`, `high_cost_active`. (`funding_cap_hit` already
  added in B1.)
- New rules in `runRules` per `decisions.md` §4 thresholds:
  - `high_cost_active`: iterates `bav | insurance | basisrente`
    instances with `status === 'active'`; emits when summed-fee > 0.012.
  - `weak_guarantee`: iterates instances with a guarantee component;
    computes `Garantie at retirement / cumulative paid contributions`,
    emits when < 0.8.
  - `low_flexibility`: iterates `bav | insurance | riester`; emits when
    `defaultHaircut ≥ 0.10` AND `payoutMode === 'leibrente'`.
  - `missing_offer_data`: per-instance check against
    `PRODUCT_EVIDENCE_FIELDS`; emits when any field is `model_estimate`.
- German templates in `recommendationCopy.ts` per atom (headline + body).

**Tests:**
- Each atom has at least one positive and one negative case (synthetic
  workspace fixtures).
- `runRules` is order-independent and idempotent for the new atoms.

**Done when:** all four atoms emit on the expected fixtures and not on
the negative cases; copy renders without falling back to the empty
template.

### B4 — Audit aggregator (E5)

**Files:**
- `src/app/optimiereVorsorge.ts`
- `src/app/optimiereVorsorge.test.ts`

**Changes:**
- New aggregator:
  ```ts
  export interface InstanceAudit {
    instance: InstanceCommon
    flags: Atom[]                 // flags emitted for this instance
    decisions: ContractDecision[] // generated via generateContractDecisions + beitragErhoehenWhatIf
  }

  export function auditPortfolio(
    workspace: Workspace,
    rules: Rules,
  ): InstanceAudit[]
  ```
- For each `active | paid_up` instance across all six product slots:
  1. Generate decisions via `generateContractDecisions` plus
     `beitragErhoehenWhatIf` (where applicable per B1's eligibility
     rules — see B1).
  2. Filter atoms returned by `runRules` to those where
     `context.instanceId === instance.instanceId`.
  3. Build `InstanceAudit` row.
- Sort rows by **flag severity** descending: `high > medium > low`,
  ties broken by atom count, then by `instanceId` for stability.

**Tests:**
- Synthetic workspace: high-fee bAV active + statement-evidenced ETF +
  Riester with model-estimate fields. Audit returns three rows; the bAV
  is first (1 high or medium flag), Riester second (`missing_offer_data`
  medium), ETF last (no flags).
- Surrendered / offered instances are excluded from the result.

**Done when:** ordering matches the spec on at least 3 fixture
workspaces; no instance is silently dropped.

### B5 — UI: extract `<ContractDecisionCards>` (U1)

**Files:**
- `src/features/dashboard/ContractDecisionCards.tsx` (new — extracted)
- `src/features/dashboard/ContractDecisionCards.css` (new — extracted)
- `src/features/dashboard/ContractDecisionMenu.tsx` (refactored to consume the new component)
- `src/features/dashboard/ContractDecisionMenu.test.tsx` (no behaviour change expected)

**Changes:**
- Extract the `decisions.map(...)` rendering and atom→chip logic from
  `ContractDecisionMenu.tsx:185-231` into a new
  `<ContractDecisionCards>` component. Props:
  ```ts
  interface ContractDecisionCardsProps {
    decisions: ContractDecision[]
    checkedIds: Set<string>
    onToggle: (id: string) => void
    /** Optional Δ Netto-Rente / Monat per decision id (fed by B2). */
    deltaByDecisionId?: Record<string, number | 'pending' | 'error'>
  }
  ```
- Keep the existing `KIND_LABELS`, `chipVariant`, `PRIVILEGE_IDS`,
  `CAVEAT_IDS` constants in this file (not in the menu).
- `ContractDecisionMenu.tsx` becomes a thin wrapper that owns the modal
  shell + checkbox state + save dispatch, and delegates card rendering.
- v1 of this slice does **not** wire `deltaByDecisionId` — left optional
  so existing menu still passes it as `undefined`. B6 wires it in the
  new modal.

**Tests:**
- Existing `ContractDecisionMenu.test.tsx` passes unchanged.
- New `ContractDecisionCards.test.tsx` snapshot of card list with
  decisions × atoms × delta combinations.

**Done when:** existing menu visually identical (verify via Preview),
new component is independently testable, no logic duplicated.

### B6 — UI: `OptimiereVorsorgeModal` shell (F1, F2, F3, F4, F5, F6, U2)

**Files:**
- `src/features/dashboard/OptimiereVorsorgeModal.tsx` (new)
- `src/features/dashboard/OptimiereVorsorgeModal.css` (new)
- `src/features/dashboard/OptimiereVorsorgeModal.test.tsx` (new)
- `src/content/optimiereCopy.ts` (new)
- `src/App.tsx` (entry trigger wiring)

**Changes:**
- Modal shell mirroring `LueckeSchliessenModal` (backdrop, role=dialog,
  Escape key, X close button).
- Step state machine: `'disclaimer' → 'overview' → 'instance' →
  'confirm' → 'saved'`. State + transitions in component-local
  `useState`, never persisted.
- **`disclaimer` step**: heading + body + `Verstanden, weiter` button.
  No back navigation. (F2)
- **`overview` step**: list of `InstanceAudit` rows (B4) sorted worst-
  first. Each row: contract label, product type chip, monthly
  contribution (if any), evidence-state chip (reuses
  `provenanceHelpers.evidenceStateToProvKind`), flag chips, `Anpassen`
  CTA. Persistent banner above the list. (F3)
- **`instance` step**: shows the picked instance's `<ContractDecisionCards>`
  with `deltaByDecisionId` populated lazily via B2.
  Accumulates `Set<{instanceId, decisionId}>` across instance visits as
  the user goes back-and-forth. (F4)
- **`confirm` step**: list of accumulated `(instance, decision)` pairs,
  default scenario name per `decisions.md` §7. Each name editable.
  `Pläne erstellen` button. (F5)
- **`saved` step**: lists created what-ifs by name, `Schließen` button.
  (F6)
- Trigger button F1 added to `RentenluckeDashboard` next to
  `Lücke schließen`. Disabled when zero existing contracts.
- `App.tsx`: `showOptimiereModal` state, mount the modal, wire
  `onCreatePlans` → `whatIfs.forEach(portfolioState.addWhatIf)`.
- `optimiereCopy.ts`: all German strings (heading, banner body, button
  labels, default scenario name templates, atom display lookups for
  flags new in B3) — keeps the modal React-light.

**Tests:**
- Step machine: from `disclaimer` you can only go to `overview`. From
  `overview` you can drill to `instance` and back.
- Disclaimer cannot be skipped: re-mounting the component returns to
  `disclaimer`.
- Save dispatches one what-if per `(instance, decision)` pair, each
  with the expected default name.
- Cancel from any step does not call `onCreatePlans`.
- Empty workspace: trigger button is disabled with the spec'd tooltip.

**Done when:** modal flows end-to-end in unit tests + Preview.

### B7 — Preview verification + `npm run verify`

**Files:** none new; manual verification of the live app.

**Steps:**
1. Run `npm run dev`.
2. Use `preview_start` + `preview_eval` to seed a workspace with one
   high-fee bAV (`wrapperAssetFee + fundAssetFee + pensionPayoutFeePct
   > 0.012`), one Riester with `evidence === 'model_estimate'` on at
   least one offer field, one ETF.
3. Click the new `Optimiere deine Vorsorge` button.
4. Verify acknowledge step appears and cannot be skipped.
5. Verify overview lists all three instances; bAV first with
   `high_cost_active`; Riester second with `missing_offer_data`; ETF
   last with no flags.
6. Drill into Riester. Verify `Riester→AVD` certified transfer card is
   shown (with virtual `create_new` target if no AVD instance exists).
7. Drill into bAV. Verify `Beitrag erhöhen` card is shown; verify
   `funding_cap_hit` atom appears when the proposed value exceeds the
   §3 Nr. 63 cap.
8. Tick at least 2 decisions across at least 2 contracts. Save. Verify
   N what-ifs appear in the workspace scenario list with the spec'd
   default names.
9. Cancel from any step. Verify `baseline.monthlyNetIncome` is
   unchanged.
10. Re-open modal. Verify acknowledge step renders again.
11. Run `npm run verify` (lint + vitest + build) — expect green.

**Done when:** all 11 steps pass, no console errors, no network
requests originating from the new modal (preserves the no-backend
posture).

## 3. Sequencing

```
B1 (Beitrag erhöhen)         ─┐
B3 (audit atoms)             ─┼─► B4 (audit aggregator) ─┐
B2 (simulateContractDecision)─┘                          │
                                                         ▼
                                          B5 (extract cards) ─► B6 (modal shell)
                                                                       │
                                                                       ▼
                                                                  B7 (verify)
```

- B1, B2, B3 are independent and can be parallelised by separate AFK
  agents.
- B4 depends on B1 + B3 (it imports the new generator and the new
  atoms).
- B5 depends on nothing in this batch (pure refactor of existing menu).
- B6 depends on B2 + B4 + B5.
- B7 depends on B6.

## 4. Risk and rollback

- **Risk: B5 refactor regresses `ContractDecisionMenu`.** Mitigation:
  Preview-verify the per-instance "Optionen" flow after B5 lands and
  before B6 begins. The existing `ContractDecisionMenu.test.tsx` suite
  is the structural safety net.
- **Risk: B2 simulation is slow.** Mitigation: A3 (lazy + memoised).
  If a single drill-in is still > 200 ms on a realistic workspace,
  add a `requestIdleCallback`-based precompute for the currently-
  selected instance only.
- **Risk: B6 ships UI with the disclaimer step accidentally
  skippable.** Mitigation: explicit unit test asserting that
  re-mounting the component lands on `disclaimer`. Mirrors the
  `DisclaimerBanner` regression-blocking pattern.
- **Rollback:** all changes are additive. Feature can be hidden by
  removing the entry button (F1) without touching the engine slices.
  Engine slices (B1-B4) ship behind no flag — they are correct in
  isolation.

## 5. Issue file conventions

Each slice becomes one file in `.scratch/optimiere-vorsorge/issues/`,
named `NN-slug.md`. Frontmatter mirrors the existing convention:

```
---
title: "..."
Status: ready-for-agent | in-progress | done
Severity: P2
Type: implementation
Area: optimiere-vorsorge
---
```

`ready-for-agent` is the default after `decisions.md` is `locked`. Use
the slice tests + Preview steps from this file as the issue's
acceptance criteria.

## 6. Out of scope (re-affirmed)

- OCR / document upload — Group B.
- Cross-flow combination with `Lücke schließen` — v2.
- Auto-clamp Beitrag erhöhen — emits flag, never clamps.
- Beitrag senken — v2.
- Persistent disclaimer-acknowledge — never.
- Commercial-license gating — default free.
