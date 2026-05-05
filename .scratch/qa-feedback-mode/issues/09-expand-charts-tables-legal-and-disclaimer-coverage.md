# Expand charts, tables, legal, and disclaimer coverage

Status: needs-triage
Type: AFK

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Extend feedback target coverage beyond form primitives into charts, tables, legal/footer/disclaimer surfaces, and export-adjacent UI so publication-guardrail feedback can be reported precisely.

## Acceptance criteria

- [ ] Chart labels, legends, and key chart containers expose useful feedback targets or section fallbacks.
- [ ] Table headers, table sections, and important cells expose useful feedback targets or section fallbacks.
- [ ] Disclaimer banner text can be targeted in QA mode.
- [ ] Legal footer and legal-page text can be targeted in QA mode.
- [ ] Details/export UI surfaces can be targeted without changing actual CSV/PDF output.
- [ ] Reports from these surfaces include route/view context and screenshot artifacts.
- [ ] Target coverage follows the convention from issue 01.
- [ ] Smoke tests or focused component tests cover at least one chart/table target and one legal/disclaimer target.

## Blocked by

- .scratch/qa-feedback-mode/issues/04-instrument-reusable-ui-targets.md
- .scratch/qa-feedback-mode/issues/05-capture-workspace-and-flow-context.md
