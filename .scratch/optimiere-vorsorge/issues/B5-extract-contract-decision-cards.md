---
title: "B5: UI refactor — extract `<ContractDecisionCards>` from `ContractDecisionMenu`"
Status: done
Severity: P3
Type: AFK
Area: optimiere-vorsorge / dashboard / refactor
---

## What to build

Pure refactor: extract the per-decision card rendering and atom→chip
logic from `ContractDecisionMenu.tsx` into a new sibling component
`ContractDecisionCards.tsx`. Both `ContractDecisionMenu` (per-instance,
existing) and `OptimiereVorsorgeModal` (portfolio-level, new in B6)
will consume it.

**Pure refactor — no behaviour change.** Existing
`ContractDecisionMenu` must look and behave byte-identical after this
slice lands.

## Acceptance criteria

- [ ] New file `src/features/dashboard/ContractDecisionCards.tsx`
      exporting:
  ```ts
  export interface ContractDecisionCardsProps {
    decisions: ContractDecision[]
    checkedIds: Set<string>
    onToggle: (id: string) => void
    /** Optional Δ Netto-Rente / Monat per decision id; consumed by the
     *  Optimiere modal in B6. Per-key value:
     *    number  → display chip e.g. "+ 23 €/Mon."
     *    'pending' → loading skeleton
     *    'error' → "—" or short error indicator
     *  Undefined / missing key → no chip (current ContractDecisionMenu behaviour). */
    deltaByDecisionId?: Record<string, number | 'pending' | 'error'>
  }
  ```
- [ ] Co-located CSS file `ContractDecisionCards.css` carrying the
      card-grid + atom-chip + checkbox styles (move from
      `ContractDecisionMenu.css`).
- [ ] Constants `KIND_LABELS`, `chipVariant`, `PRIVILEGE_IDS`,
      `CAVEAT_IDS` move from `ContractDecisionMenu.tsx` to
      `ContractDecisionCards.tsx` (exported if they need re-use; private
      otherwise).
- [ ] `ContractDecisionMenu.tsx` becomes a thin wrapper that owns:
      modal shell + `useState` for `checkedIds` + `handleCreatePlans`
      save dispatch. Renders `<ContractDecisionCards decisions={...}
      checkedIds={...} onToggle={toggleChecked} />`.
- [ ] `deltaByDecisionId` is **not wired** in this slice — it is left
      undefined when called from `ContractDecisionMenu`. The card
      component renders the chip area only when a value exists for that
      id. B6 wires it in the new modal.
- [ ] Existing `ContractDecisionMenu.test.tsx` and
      `ContractDecisionMenu.wiring.test.tsx` pass unchanged.
- [ ] New `ContractDecisionCards.test.tsx`:
  - Snapshot or assertion test on a 4-decision fixture (Weiterführen +
    Beitragsfrei + Kündigen + Übertragen) with mixed atoms (privilege
    + caveat + info).
  - When `deltaByDecisionId === undefined`, no delta chip area is
    rendered. (Confirms regression-safety for the per-instance menu.)
  - When `deltaByDecisionId === { 'beitragsfrei-id': -23, 'kuendigen-id': 'pending' }`:
    the beitragsfrei card shows a chip with `−23 €/Monat` (or similar
    display per `formatCurrency`), the kuendigen card shows a loading
    indicator.
- [ ] **Preview verification**: open the per-instance "Optionen" menu
      on at least one InstanceCard before and after this slice.
      Visual layout, spacing, atom chips, checkbox behaviour, save flow
      all identical. Use the `preview_*` tools per `CLAUDE.md`'s
      preview workflow.

## Implementation notes

- This is a pure structural change. The `decisions.map(...)` body in
  current `ContractDecisionMenu.tsx:185-231` is the cleanest extraction
  unit. Keep the JSX shape exactly as it is.
- Delta chip rendering is **new**. Add a small subcomponent or inline
  `{deltaByDecisionId?.[decision.id] !== undefined && <DeltaChip
  value={...} />}`. Use `formatCurrency(value, 0)` (zero decimals) for
  EUR/month rendering and add a `+` prefix for positive values.
- Loading state: a small spinner or skeleton stripe is fine; no
  Recharts. Match the visual weight of the existing atom chips so the
  card layout doesn't reflow when the chip resolves.
- CSS moving: classes like `contract-decision-card`,
  `contract-decision-atom-*`, `contract-decision-checkbox` move
  verbatim. Update `ContractDecisionMenu.css` to drop those rules and
  keep only modal-shell rules (overlay, dialog, header, footer).
- React-only file; no engine imports.

## Red test (write first)

A failing test that:
1. Renders `<ContractDecisionCards>` with a 4-decision fixture.
2. Asserts at least one card with class `contract-decision-card--kuendigen` is in the DOM.

Fails on missing component file.

## Blocked by

None. Independent of B1 / B2 / B3 / B4. (B6 depends on the extracted
component, so B5 must land before B6 begins.)
