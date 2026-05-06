---
title: "B1: Engine — `Beitrag erhöhen` decision + `funding_cap_hit` atom"
Status: done
Severity: P2
Type: AFK
Area: optimiere-vorsorge / engine / contract decisions
---

## What to build

Extend the per-contract decision pipeline in `src/app/contractDecisions.ts`
with a new `Beitrag erhöhen` action so the upcoming
`OptimiereVorsorgeModal` can offer it alongside the existing
`Weiterführen | Beitragsfrei | Kündigen | Übertragen` decisions.

The new decision changes a single instance's monthly contribution to a
caller-supplied value. Statutory caps are checked but **not auto-clamped**;
exceedance emits a flag the UI surfaces.

## Acceptance criteria

- [ ] `WorkspaceDelta` discriminated union extended with
      `{ kind: 'increase_contribution'; instanceId: string; newMonthlyEUR: number }`.
- [ ] `ContractDecision['kind']` extended with `'beitrag-erhoehen'`.
- [ ] New generator `beitragErhoehenWhatIf(workspace, instanceId,
      newMonthlyEUR)` returns a `ContractDecision`. Returns `null` when the
      target instance has `status === 'surrendered'` or `status === 'offered'`.
- [ ] `applyContractDecision` handles the new delta kind by writing
      `monthlyContribution = newMonthlyEUR` on the matching instance,
      preserving every other field (deep-clone semantics, like the existing
      appliers).
- [ ] New atom id `funding_cap_hit` (priority `high`) added to
      `recommendations.ts` `AtomId` type. Emitted by the generator when
      `newMonthlyEUR × 12` exceeds the relevant statutory cap:
  - bAV: `de2026Rules.bav.section363LimitAnnual` (§3 Nr. 63 EStG, single-employer aggregate).
  - Basisrente: `de2026Rules.basisrente.section10Limit` (§10 Abs. 3 EStG).
  - Riester: `2_100` flat (§10a EStG).
  - AVD: `de2026Rules.altersvorsorgedepot.contributionCapAnnual` (per-contract).
  - Insurance / ETF: cap = `Infinity` — never emits.
  Atom `context` carries `{ instanceId, capAnnualEUR, proposedAnnualEUR }`.
- [ ] German display template for `funding_cap_hit` added to
      `src/content/recommendationCopy.ts`. Headline e.g. `"Über dem
      gesetzlichen Förderdeckel"`; body explains that contributions above
      the cap are still possible but lose tax/Zulagen advantages.
- [ ] **No auto-clamp.** The applier writes `newMonthlyEUR` verbatim — the
      simulation result then reflects the cap consequence (e.g. lost
      Zulagen / no §3 Nr. 63 deferral on the excess) naturally via the
      existing engine.
- [ ] Default first-render `newMonthlyEUR` (used by the modal's UI) =
      `currentMonthly × 1.5` rounded to nearest €10. Expose as a small
      named constant or helper from `contractDecisions.ts`.
- [ ] Tests in `src/app/contractDecisions.test.ts`:
  - bAV `Beitrag erhöhen` from 200 €/mo to 800 €/mo with a salary above
    BBG → emits `funding_cap_hit` with cap value in atom context.
  - Riester increase past 175 €/mo (€2,100/yr) → `funding_cap_hit`.
  - AVD increase past `de2026.altersvorsorgedepot.contributionCapAnnual / 12` → `funding_cap_hit`.
  - ETF increase from 100 to 500 → no cap atom.
  - Surrendered instance: generator returns `null`.
  - `applyContractDecision` round-trips the new delta kind and writes
    `monthlyContribution` correctly across all six product slots that
    have a `monthlyContribution` field.

## Implementation notes

- Reuse `findInstanceById`, `detectSlot`, `runRules`, and the cloning
  pattern from existing appliers in `contractDecisions.ts`. Do **not**
  open-code instance lookups in the new generator.
- The generator needs `runRules` only if it wants to filter relevant
  privilege/caveat atoms (mirror `BEITRAGSFREI_RELEVANT_ATOM_IDS`
  pattern). For v1, no privilege/caveat atoms attach to `Beitrag
  erhöhen`; only `funding_cap_hit` emits.
- Description text proposal: `"${label}: Beitrag von ${oldEUR} € auf
  ${newEUR} € pro Monat erhöhen."` — keep the German style consistent
  with the other generators.
- Statutory cap source modules already exist; do not invent thresholds.
  bAV cap aggregation across multiple instances is a P2 concern (single-
  employer assumption holds — see decisions.md §4).
- Engine code is React-free. `contractDecisions.ts` already imports
  nothing from React.

## Red test (write first)

Add a failing test asserting:
1. `beitragErhoehenWhatIf(ws, riesterInstanceId, 200).atoms` contains an
   atom with `id === 'funding_cap_hit'`.
2. `applyContractDecision(ws, decision).baseline.assumptions.riester[0].monthlyContribution === 200`.

The first test fails on missing atom id; the second fails on missing
delta kind in the applier.

## Blocked by

None. `decisions.md` is locked. Independent of B2 / B3 / B5.
