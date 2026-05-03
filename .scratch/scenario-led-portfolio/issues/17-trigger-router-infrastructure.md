# 17 — TriggerRouter infrastructure + triggers.ts schema extension

Status: needs-triage
Milestone: M4 (Trigger router)
Plan section: §4 M4.1 + M4.2
PRD capabilities: F32 (foundation), G2-G6
Depends on: 04

## What

Replace the hard-coded path-specific routing inside `GuidedSetup.tsx` with a data-driven dispatch in a new `TriggerRouter.tsx` (or extended `GuidedSetup`). The four existing triggers (`bav_offer`, `etf_vs_insurance`, `rentengap`, `expert`) migrate without behaviour change. Schema-extends `src/content/triggers.ts` with `wizardComponent`, `whatIfTemplates`, and recommender-bias fields.

## Scope

- `src/content/triggers.ts` extended schema:
  ```ts
  interface GuidedPathOption {
    id: GuidedPath
    title: string
    description: string
    wizard: ComponentType<{ onComplete: ... }>
    visibleProducts: ProductId[]
    whatIfTemplates?: string[]               // names of pre-built scenarios in recommendations.ts
    recommenderBias?: { emphasiseP10?: boolean, emphasiseTaxLeverage?: boolean }
  }
  ```
- Existing triggers' bodies (today's hard-coded path-specific input flows in `GuidedSetup.tsx`) extracted into per-trigger components: `BavOfferWizard.tsx`, `EtfVsInsuranceWizard.tsx`, `RentengapWizard.tsx`, `ExpertWizard.tsx` (or trivial pass-through).
- `TriggerRouter.tsx` (or extended `GuidedSetup`) reads the trigger by id and dispatches to the data-defined `wizardComponent`. No `switch` statement on path.
- Existing 4 triggers migrate without behaviour change (visual + interaction parity).

## Out of scope

- New trigger entries (issue 18).
- Per-trigger recommender bias rules (P2).
- Removing today's `useGuidedSetup` hook (it stays as the hosting hook).

## Acceptance

- All 4 existing triggers (bav_offer, etf_vs_insurance, rentengap, expert) behave identically before and after.
- Adding a new trigger is one row in `triggers.ts` + one new component file, no edits in router code.
- `npm run verify` green.

## Test plan

- Existing `GuidedSetup` integration tests pass against the new dispatch.
- New unit test: `triggers.ts` is the single source of truth for the active trigger list; the router reads from it.
