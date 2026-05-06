# Orchestrator handoff — Optimiere deine Vorsorge

You are orchestrating implementation of the `Optimiere deine Vorsorge`
feature in **Rentenrechner** (React + TypeScript + Vite, frontend-only).

The work is fully pre-planned: 7 issue briefs B1–B7 under
`.scratch/optimiere-vorsorge/issues/`. Each is self-contained with
acceptance criteria + red test + blocked-by + implementation notes —
**do not paraphrase**; pass each file content verbatim as part of each
agent's brief.

The product/legal sign-off happened 2026-05-05 — `decisions.md` is
`locked`, with all 27 maintainer checkboxes ticked. Engineering may
proceed AFK from here.

---

## Repo and verification

Working directory: `C:/Users/Peter/Coding_Projects/Rentenrechner`

After every agent completes, run the standard verify pipeline in their
worktree before merging:

```bash
npm run verify    # lint + tests + build — must be clean
```

A wave is not done until every item in it passes `npm run verify` and is
merged to `main`. Do not start the next wave until the current wave is
fully merged.

---

## Inputs to read

Pass these to every implementer prompt:

- The relevant `B*.md` issue file under `.scratch/optimiere-vorsorge/issues/` — verbatim.
- `.scratch/optimiere-vorsorge/PRD.md` — scope and reuse map. Optional
  for engine slices (B1-B4); load-bearing for B5/B6/B7.
- `.scratch/optimiere-vorsorge/decisions.md` — locked product/legal
  decisions. Especially §1 (disclaimer copy), §4 (audit thresholds),
  §6 (surrender haircuts), §7 (save model) for B6.
- `CONTEXT.md` — domain glossary + module ownership map. Especially
  the "Cross-cutting invariants" section.
- `CLAUDE.md` — guardrails (rounding boundary, engine React-free,
  disclaimer session-only, brand name, license posture).
- `memory/multi_agent_orchestration.md` — operational gotchas.
  Re-read before dispatch; gotchas #1 (worktree base SHA), #5
  (implementers don't always commit), #9 (rebase before review),
  #19 (concise prompts) are load-bearing for this batch.

---

## Critical guardrails — tell every implementer

These are non-negotiable across all slices:

1. **Engine code is React-free.** No file under `src/engine/**` may
   import React. The new pure helpers in `src/app/optimiereVorsorge.ts`
   may be consumed by React but must not import React themselves.
2. **Statutory rounding only where the law requires it.** Engine returns
   floats; UI rounding is at `formatCurrency` / `formatPercent` /
   `<NumberField decimals=...>`. EUR/month deltas in the modal use
   `formatCurrency(value, 0)`.
3. **Disclaimer-acknowledge state is modal-scoped, never persisted.**
   Not localStorage, not sessionStorage, not URL. Every modal open
   returns to the acknowledge step. **Regressing this is publication-
   blocking** per the session-only `DisclaimerBanner` invariant in
   `CLAUDE.md`. B6 must include a regression test pinning this.
4. **`PRODUCT_REGISTRY` is the source of truth for product identity.**
   Don't hardcode the union or add local color/order maps.
5. **Reuse, don't reimplement.** The pure factory
   `runCombineSimulation` (`src/app/useCombineSimulation.ts`) is the
   simulation entry point for B2. The per-instance card layout in
   `ContractDecisionMenu.tsx:185-231` is the source for B5's extracted
   component. The modal pattern in `LueckeSchliessenModal.tsx` is the
   shell for B6.
6. **Public copy uses RentenWiki.de, not Rentenrechner.** Internal
   identifiers can stay; user-facing strings (modal heading, banner,
   buttons) follow the public-brand convention. (No new copy in this
   batch hits launch surfaces directly — disclaimer body reads
   `Rentenrechner` in code symbols only never in rendered text.)
7. **No new backend / fetch / cookies / telemetry** introduced by any
   slice. The modal must produce **zero** outbound network requests.
   B7 verifies this with `preview_network`.
8. **`addWhatIf` per `(contract, decision)` pair**, `origin: 'recommender'`.
   Mirror `ContractDecisionMenu.tsx:131-153` exactly. Do not invent a
   combined-mutation save model.

---

## Wave A — Run all four in parallel (Sonnet)

4 agents. No prerequisites. Start immediately. All four are
independent — no shared file overlaps.

| Agent | Issue | Issue file | Primary files | Notes |
|-------|-------|-----------|---------------|-------|
| A1 | B1 | `issues/B1-beitrag-erhoehen-decision.md` | `src/app/contractDecisions.ts` + tests; small additions to `src/app/recommendations.ts` (`AtomId` only) and `src/content/recommendationCopy.ts` (`funding_cap_hit` template) | Extend `WorkspaceDelta` + `ContractDecision['kind']`. Statutory caps from `de2026Rules` — do not invent thresholds. **No auto-clamp.** |
| A2 | B2 | `issues/B2-simulate-contract-decision.md` | new `src/app/optimiereVorsorge.ts` + tests | Reuses `runCombineSimulation` from `src/app/useCombineSimulation.ts`. Memo cache keyed by `(workspaceFingerprint, decision.id)`. React-free. |
| A3 | B3 | `issues/B3-audit-flag-atoms.md` | `src/app/recommendations.ts` + tests; `src/content/recommendationCopy.ts` | Four new atoms with thresholds locked in `decisions.md` §4. May need to export `defaultHaircutFor` from `contractDecisions.ts` — coordinate with A1 if both touch helpers. |
| A4 | B5 | `issues/B5-extract-contract-decision-cards.md` | new `src/features/dashboard/ContractDecisionCards.tsx` + co-located CSS + tests; refactor `ContractDecisionMenu.tsx` | **Pure refactor** — existing menu must look + behave byte-identical. Verify via Preview before declaring done. |

**Coordination note**: A1 (B1) and A3 (B3) both touch
`src/app/recommendations.ts` (atom-id type union) and
`src/content/recommendationCopy.ts` (atom templates). The unions and
template tables are append-only at the bottom of each file — give A1
the `funding_cap_hit` slot and A3 the four audit-flag slots. Rebase A3
on top of A1 before review (gotcha #9).

After Wave A merges, all four engine slices + the refactor are in
place. B4 unblocks (it depends on B1's `beitragErhoehenWhatIf` +
`'beitrag-erhoehen'` kind, and on B3's atoms).

---

## Wave B — B4 alone (Sonnet)

| Agent | Issue | Issue file | Primary files | Notes |
|-------|-------|-----------|---------------|-------|
| B1 (this wave's only agent) | B4 | `issues/B4-audit-portfolio-aggregator.md` | `src/app/optimiereVorsorge.ts` + tests | Add `auditPortfolio` to the file A2 created. Reuse `generateContractDecisions` + B1's `beitragErhoehenWhatIf` rather than calling each generator directly. |

After B4 merges, B6 unblocks.

---

## Wave C — B6 alone (Opus)

This is the integration step. It composes everything from Wave A + B
into the user-facing modal, wires the entry trigger, and is the
slice where "the feature works".

| Agent | Issue | Issue file | Primary files | Notes |
|-------|-------|-----------|---------------|-------|
| C1 | B6 | `issues/B6-optimiere-vorsorge-modal.md` | new `src/features/dashboard/OptimiereVorsorgeModal.tsx` + co-located CSS + tests; new `src/content/optimiereCopy.ts`; modify `src/App.tsx` (entry trigger wiring); modify `RentenluckeDashboard` (button placement) | **Use Opus.** This slice composes 5 prior slices, owns the disclaimer-step regression test, owns the lazy-compute pattern for delta chips, and is the largest single chunk of UI in this batch. |

Disclaimer regression test is mandatory: re-mounting the component
must land on the `disclaimer` step. If the test is missing, round-2
is required.

---

## Wave D — B7 alone (Sonnet)

Verification gate. Not a normal implementation slice — produces a
report + screenshots, not code (modulo small inline fixes ≤ 30 LOC).

| Agent | Issue | Issue file | Primary files | Notes |
|-------|-------|-----------|---------------|-------|
| D1 | B7 | `issues/B7-preview-and-verify.md` | none new (verification only) | Run the 11 Preview steps using `preview_*` tools. Capture `preview_screenshot` for disclaimer + overview + instance steps. Capture `preview_network` showing zero outbound requests from the modal lifecycle. After everything passes, flip `Status:` on `.scratch/group-g-qa/issues/59-optimiere-vorsorge-backlog.md` to `done` with a short Resolution block. |

If verification surfaces a structural defect (not a mechanical fix),
**stop** and open a follow-up issue under
`.scratch/optimiere-vorsorge/issues/`. Do not patch structural defects
in B7.

---

## Per-issue dispatch policy

- **Pre-create worktrees manually from current `main`** for each
  parallel-wave issue (gotcha #1). Have each agent early-check base
  SHA via `git log -1 --oneline` and STOP-and-report if the SHA is
  wrong.
- **Dispatch the Opus reviewer the moment each implementer reports
  completion** (gotcha #20).
- **Round-2 review fixes always permitted; round-3 only if round-2
  introduces new blockers** (gotcha #18). User policy: 1 mandatory
  Opus review per slice, additional rounds only when ≥3 blocking
  concerns surface.
- **Concise prompts** (gotcha #19): under ~400 words for B1/B2/B3/B4/B5/B7;
  ~600 for B6 (more files, more dependencies).
- **Always run `git -C <worktree> status` and `git -C <worktree> log
  --oneline main..HEAD` before merging** (gotcha #5 — implementers
  don't always commit; the orchestrator may need to commit on their
  behalf with a Co-Authored-By trailer).
- **Discard CRLF noise** before review/merge (gotcha #4): never
  include `src/engine/__snapshots__/simulate.integration.test.ts.snap`
  in a diff unless the diff-stat shows non-zero content lines.
- **Do not commit on `main`** unless explicitly instructed; merge
  Wave-A branches sequentially with `--ff-only` after each is
  reviewed clean.

---

## Done criteria

The Optimiere Vorsorge batch is complete when:

- All 7 issue files under `.scratch/optimiere-vorsorge/issues/B*.md`
  have `Status:` set to `done` (or, for B7, the verification report
  embedded with screenshot + network proof).
- All 7 corresponding branches are merged to `main`.
- `npm run verify` is green on `main`.
- `.scratch/group-g-qa/issues/59-optimiere-vorsorge-backlog.md`
  `Status:` is flipped from `ready-for-human` to `done` with a
  Resolution block linking to `.scratch/optimiere-vorsorge/`.
- The `Optimiere deine Vorsorge` button is visible in combine mode
  next to `Lücke schließen` on the dashboard, and clicking it walks
  through disclaimer → overview → instance → confirm → saved without
  any console errors or outbound network requests.

---

## Out of scope (do not let any agent expand into these)

- OCR / document upload of existing contracts — Group B; gated on
  backend introduction.
- Combining `Optimiere` with `Lücke schließen` in one what-if — v2.
- Auto-clamping `Beitrag erhöhen` to statutory caps — emit
  `funding_cap_hit` flag, never clamp.
- `Beitrag senken` action — symmetric counterpart, not in spec.
- Persistent disclaimer-acknowledge state — never. Modal-scoped only.
- Commercial-license gating on this surface — default free per
  `CLAUDE.md` "License posture".

If an agent proposes scope creep into any of these, redirect them to
the in-scope issue and add the proposed work as a new file under
`.scratch/optimiere-vorsorge/issues/` with `Status: ready-for-human`.
