Status: ready-for-agent
Type: bug
Priority: minor
Source: local-qa
Source ref: qa-2026-05-06T13-57-13-dashboard-optimieremodal-overview-row-ve.md
Triaged: 2026-05-06T14:07:36Z

# 05 — Optimiere modal: raw atom IDs leak into overview row chips

## Problem

In the "Optimiere deine Vorsorge" modal, on the **overview** step, the row
for the Private Rentenversicherung instance shows two raw recommender atom
IDs as chip labels — `pre_2005_pav_taxfree_capital` and
`pre_2005_pav_high_garantiezins` — alongside the proper German chips ("Hohe
Kosten", "Geringe Flexibilität", "Angebotsdaten fehlen"). Tester comment:
"Shows programmatic tags and does not explain them well." End users should
never see snake_case identifiers; the row currently mixes localized labels
with implementation detail.

## What to change

The render path is `OptimiereVorsorgeModal.tsx` line 411:
`{AUDIT_FLAG_LABELS[flag.id] ?? flag.id}`. `flag` comes from
`auditPortfolio` (`src/app/optimiereVorsorge.ts:243`), which collects every
recommender atom whose `context.instanceId` matches the current contract.
The leaking IDs are recommender atoms registered in
`src/app/contractDecisions.ts` (~lines 200–230) and have full headlines in
`src/content/recommendationCopy.ts` (`Hohe Kosten und kein Kapitalwahlrecht`,
etc.). The audit-flag chip table in `src/content/optimiereCopy.ts:66`
(`AUDIT_FLAG_LABELS`) only knows about five short flag IDs (`high_cost_active`
etc.), so any other atom ID falls through to the raw-key fallback.

Pick whichever fix the implementer judges cleanest; document the choice in
the PR. Order of preference:

1. **Filter at the audit boundary (preferred).** In
   `optimiereVorsorge.ts` `auditPortfolio`, only keep atoms intended as
   audit flags. The five known flag IDs are `AUDIT_FLAG_LABELS`'s keys;
   add a `KNOWN_AUDIT_FLAG_IDS` set there or in `optimiereCopy.ts` and
   filter `flags = allAtoms.filter(... && KNOWN_AUDIT_FLAG_IDS.has(a.id))`.
   This keeps recommender-only atoms (the `pre_2005_pav_*` family and
   anything similar) out of the chip strip without changing recommender
   logic. Lowest-risk and the only fix that survives future atoms being
   added without a chip translation.
2. **Map atom IDs through `recommendationCopy.headline`.** If product
   wants those atoms shown as flags, swap the lookup in
   `OptimiereVorsorgeModal.tsx` from `AUDIT_FLAG_LABELS` to a function that
   first checks `AUDIT_FLAG_LABELS` then falls back to the German headline
   from `src/content/recommendationCopy.ts`. Headlines like "Hohe Kosten
   und kein Kapitalwahlrecht" are full sentences though — verify they fit
   the chip layout at narrow viewports before going this way.
3. **Last resort:** add the missing IDs to `AUDIT_FLAG_LABELS` with short
   chip-friendly German strings. Brittle — every new recommender atom
   risks the same regression — only do this if both options above are
   blocked.

Do **not**:
- Modify `recommendations.ts` or atom rule code (recommender output is
  load-bearing for the recommender card; don't change which atoms fire).
- Restructure `auditPortfolio`'s severity scoring or sort order.
- Change the recommender-card surface — the bug is scoped to the modal.

## Acceptance criteria

- [ ] In combine mode, open the "Optimiere deine Vorsorge" modal with a
      pre-2005 PAV instance present (or any contract that triggers
      `pre_2005_pav_taxfree_capital` / `pre_2005_pav_high_garantiezins`).
      No snake_case identifiers appear in the overview row chip strip.
- [ ] Existing audit flags (`Hohe Kosten`, `Geringe Flexibilität`,
      `Angebotsdaten fehlen`, `Schwache Garantie`, `Fördergrenze
      überschritten`) still render with their German labels.
- [ ] Severity sort order of overview rows is unchanged (regression: a
      filter-based fix in option 1 must run *after* `severityScore` so the
      sort still considers all atoms — or, if the filter applies before
      sorting, add a regression test that two contracts with identical
      audit flags but different total atom counts sort identically).
- [ ] `npx vitest run optimiereVorsorge` passes.
- [ ] `npx vitest run OptimiereVorsorgeModal` passes.
- [ ] `npm run verify` passes.

## Implementation context

- Render site: `src/features/dashboard/OptimiereVorsorgeModal.tsx:405-413`
  (the `optimiere-modal__overview-flags` block).
- Flag source: `src/app/optimiereVorsorge.ts:243` (`auditPortfolio`),
  `flags = allAtoms.filter(... matches instanceId)` ~line 254.
- Label tables:
  - `src/content/optimiereCopy.ts:66` — `AUDIT_FLAG_LABELS` (chips).
  - `src/content/recommendationCopy.ts` — `headline` per atom (longer
    sentences, used by the recommender card).
- Atom IDs in this report (`pre_2005_pav_taxfree_capital`,
  `pre_2005_pav_high_garantiezins`) are referenced from
  `src/app/contractDecisions.ts:202` and `:204`.
- Tests to update / add:
  - `src/features/dashboard/OptimiereVorsorgeModal.test.tsx` — add a
    case rendering an instance whose atoms include a non-flag ID; assert
    the rendered chips contain only German strings (no underscore).
  - `src/app/optimiereVorsorge.test.ts` (if option 1) — assert
    `auditRows[i].flags` only contains known flag IDs.
- Per CLAUDE.md the modal is considered shipped (`Decision UI`) — keep
  changes display-side; do not alter recommender atom shapes.
- Run `npm run verify` before opening the PR.

## Blocked by

Nothing.

## Original report

.scratch/archive/qa-feedback-issues/qa-2026-05-06T13-57-13-dashboard-optimieremodal-overview-row-ve.md
.scratch/archive/qa-feedback-issues/qa-2026-05-06T13-57-13-dashboard-optimieremodal-overview-row-ve-screenshot.png
