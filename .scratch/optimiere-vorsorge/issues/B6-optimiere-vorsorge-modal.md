---
title: "B6: UI — `OptimiereVorsorgeModal` (full step machine + entry trigger)"
Status: done
Severity: P2
Type: AFK
Area: optimiere-vorsorge / dashboard / UI
---

## What to build

The portfolio-level "Optimiere deine Vorsorge" modal that surfaces the
audit (B4), drills into per-contract decisions (B1 + existing
generators), shows lazily-computed Δ Netto-Rente per decision (B2),
and saves selected `(contract, decision)` pairs as named what-if
scenarios.

This is the user-facing payload of issue 59. Every preceding slice
(B1 + B2 + B3 + B4 + B5) is a prerequisite.

## Acceptance criteria

- [ ] New files:
  - `src/features/dashboard/OptimiereVorsorgeModal.tsx`
  - `src/features/dashboard/OptimiereVorsorgeModal.css`
  - `src/features/dashboard/OptimiereVorsorgeModal.test.tsx`
  - `src/content/optimiereCopy.ts` (German strings — heading,
    disclaimer body, banner, button labels, default scenario name
    templates, atom display lookups for B3 atoms).
- [ ] Modal shell mirrors `LueckeSchliessenModal`:
      backdrop + `role="dialog"` + `aria-modal` + Escape key + X close
      button. Body scroll lock optional but consistent with existing
      modals.
- [ ] Step state machine (component-local `useState`, never persisted):
      `'disclaimer' → 'overview' → 'instance' → 'confirm' → 'saved'`.
      Cancel from any step calls `onClose` without state mutation.
- [ ] **`disclaimer` step** (decisions.md §1):
  - Renders heading `"Hinweis: Modellrechnung, keine Beratung"`.
  - Renders the four paragraphs from `decisions.md` §1 verbatim
    (sourced from `optimiereCopy.ts`).
  - Two buttons: `Verstanden, weiter` (primary, advances to overview),
    `Abbrechen` (secondary, closes modal).
  - **Cannot be skipped.** Re-mounting the component returns to this
    step. Re-opening the modal returns to this step.
- [ ] **`overview` step**:
  - Calls `auditPortfolio(workspace, rules)` once on enter, memoises
    by workspace identity.
  - Renders one row per `InstanceAudit`: contract label, product type
    chip (use `getProductMeta(productId)` for color/label),
    `monthlyContribution` if any, evidence-state chip via
    `evidenceStateToProvKind` from `provenanceHelpers.ts`, audit-flag
    chips (B3 atoms via `optimiereCopy` templates), `Anpassen` CTA.
  - Sorted worst-first per `auditPortfolio` ordering.
  - Persistent banner above the list with the §1 short-form text:
    `"Modellrechnung — keine Steuer-, Renten- oder
    Versicherungsberatung. Vor echten Vertragsänderungen bitte
    unabhängige Fachperson hinzuziehen."`
- [ ] **`instance` step**:
  - Renders the picked instance's `<ContractDecisionCards>` (B5)
    with `decisions` from the audit row and `deltaByDecisionId`
    populated lazily via `simulateContractDecision` (B2). Use the
    cache from `createDecisionSimulationCache()`; mark each decision
    `'pending'` until the cache fills.
  - **`Beitrag erhöhen` card**: includes a `<NumberField>` for the
    proposed `newMonthlyEUR` (default from B1's helper). When the
    user changes the value, regenerate the decision (so the
    `funding_cap_hit` atom and the cached delta key both refresh)
    and re-trigger the lazy compute for that card only.
  - Accumulates ticked decisions in a `Set<{instanceId, decisionId}>`
    that persists across instance ↔ overview navigation.
  - `Zurück` → overview. `Weiter` → confirm (only enabled when at
    least one tick has accumulated across this drill or any prior).
- [ ] **`confirm` step**:
  - List of accumulated `(instance, decision)` pairs with the default
    scenario name from `decisions.md` §7. Each name editable via
    `<input type="text">` next to the row.
  - Default-name templates in `optimiereCopy.ts`:
    - `Beitrag erhöhen`: `"{contractLabel} – Beitrag {neuerEUR} €/Monat"`
    - `Beitragsfrei`: `"{contractLabel} – beitragsfrei ab Alter {age}"`
    - `Kündigen`: `"{contractLabel} – kündigen"` (or `"{contractLabel} → {targetLabel}"` if reallocate)
    - `Übertragen` (certified): `"{contractLabel} → {targetLabel}"`
    - `Übertragen` (create_new): `"{contractLabel} → neues {productLabel}"`
  - Two buttons: `Pläne erstellen` (primary, advances to saved with
    onCreatePlans dispatch), `Zurück` (back to overview, ticks
    preserved).
- [ ] **`saved` step**:
  - Renders a confirmation list of created what-ifs by name.
  - `Schließen` button → `onClose`.
- [ ] **Save dispatch** (B6 wires F1 + S1):
  - For each ticked `(instance, decision)` pair, build one
    `WhatIfScenario` mirroring `ContractDecisionMenu`'s save model:
    `forkBaselineScenario(workspace.baseline, scenarioName,
    'recommender')`, then `applyContractDecision(workspace, decision)`,
    then assign `applied.baseline.assumptions` to the result's
    `assumptions`, then `id = newScenarioId('whatif')`.
  - Call `onCreatePlans(whatIfs)` once with the array. The parent
    routes through `whatIfs.forEach(portfolioState.addWhatIf)`.
- [ ] **Entry trigger** (F1):
  - Add an `Optimiere deine Vorsorge` button to
    `RentenluckeDashboard` next to the existing `Lücke schließen`
    button. Wire `onOpenOptimiere` callback up to `App.tsx`.
  - In `App.tsx`: add `showOptimiereModal` state mirroring
    `showLueckeModal`. Mount the modal when true; pass `onCreatePlans`
    that calls `whatIfs.forEach(portfolioState.addWhatIf)` then closes
    the modal (existing `ContractDecisionMenu` save pattern).
  - Disabled state with tooltip when the workspace has zero active or
    paid-up instances:
    `"Sobald du mindestens einen Vertrag erfasst hast, kannst du Optionen durchspielen."`
  - Visible only in combine mode (decisions.md §8). Mirror existing
    `combineMode &&` gating used for `LueckeSchliessenModal` mounting.
- [ ] Tests in `OptimiereVorsorgeModal.test.tsx`:
  - From `disclaimer` you can only go to `overview` (no shortcut to
    other steps without acknowledgement).
  - Re-mounting the component lands on `disclaimer` (regression test
    for the "never persisted" invariant).
  - Save dispatches one what-if per ticked pair, each with the spec'd
    default name.
  - Cancel from any step does not call `onCreatePlans`.
  - Empty workspace: trigger button is disabled and the tooltip text
    matches.
- [ ] **Preview verification** (run end-to-end on the dev server):
  1. Workspace with one high-fee bAV (RIY > 1.2%), one Riester with
     at least one offer field marked `model_estimate`, one ETF.
  2. Click `Optimiere deine Vorsorge`. Verify acknowledge step
     appears and cannot be skipped.
  3. Verify overview lists the three contracts; bAV first with
     `Hohe Kosten` chip; Riester second with `Angebotsdaten fehlen`
     chip; ETF last with no flags.
  4. Drill into the Riester. Verify the `Riester→AVD` certified
     transfer card appears (with `create_new` virtual target if no
     AVD instance exists).
  5. Drill into the bAV. Verify the `Beitrag erhöhen` card. Type a
     value above the §3 Nr. 63 cap; verify the `funding_cap_hit`
     atom chip appears.
  6. Tick at least 2 decisions across at least 2 contracts. Save.
     Verify N what-ifs appear in the workspace scenario list with
     the spec'd default names.
  7. Cancel from the instance step on a fresh open. Verify
     `baseline.monthlyNetIncome` is unchanged.
  8. Re-open the modal. Verify acknowledge step renders again.

## Implementation notes

- Imports: `runRules` from `recommendations.ts`, `auditPortfolio` +
  `simulateContractDecision` + `createDecisionSimulationCache` from
  `optimiereVorsorge.ts`, `<ContractDecisionCards>` from
  `ContractDecisionCards.tsx` (B5), copy from `optimiereCopy.ts`.
- The `instance` step's lazy compute pattern: on enter, kick off
  `simulateContractDecision` for each decision via the cache; show
  `'pending'` chips; replace with numeric values as the cache fills.
  In practice these are sync (no Promise) — the chip transitions
  inside one render cycle. If a future async path is added, the
  `'pending'` state is already there.
- `Beitrag erhöhen` value-change pattern: keep a separate
  `<{ instanceId: string; eur: number }>` map in component state that
  overrides the audit row's pre-built decision. When the user types,
  rebuild the decision via `beitragErhoehenWhatIf(workspace, instanceId,
  newEur)` and route the new decision id through the cache.
- The cache resets when the modal closes — `useEffect`
  cleanup returning `cache.invalidate()`.
- Engine code remains React-free: this slice imports React in the new
  modal file and the (already-React) `App.tsx` and `RentenluckeDashboard`.
  `optimiereVorsorge.ts` stays React-free.

## Red test (write first)

A failing test that mounts `<OptimiereVorsorgeModal>` and asserts the
disclaimer heading text is in the document. Fails on missing component
file.

## Blocked by

- B1 (`Beitrag erhöhen` decision + `funding_cap_hit` atom)
- B2 (`simulateContractDecision` + cache)
- B3 (audit-flag atoms)
- B4 (`auditPortfolio` aggregator)
- B5 (`<ContractDecisionCards>` extraction)

All four engine slices + the refactor must merge before B6 starts. B6
is the integration step.
