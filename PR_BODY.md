## Summary

The Kapital page now reads the scenario query on mount and validates it against the active mode's return scenarios. Missing or unknown IDs fall back to basis by ID. A return picker above the product filters updates local selection and replaces the URL query, keeping the lifecycle chart and Wendepunkte table on the same scenario. The Vergleich link and all Mein Plan entry points now carry the selected scenario, including readiness reasons and native links that open in another tab. The shared picker owns its styles so direct Kapital visits render consistently.

## Preflight

- Invariant preserved: CLAUDE.md, Non-obvious architecture — "`returnScenarios[0]` is not necessarily 'basis'." Scenario resolution uses IDs. The CONTEXT.md invariant "Engine is React-free" is preserved; this change stays in the UI.
- User-visible surface affected: `/kapital` return picker, lifecycle chart and Wendepunkte table in compare and combine modes; drill-in links from Vergleich and Mein Plan.
- Regression tests updated: `src/features/kapital/KapitalPage.test.tsx`, `src/features/vergleich/VergleichPage.test.tsx`, and `src/features/mein-plan/MeinPlanPage.test.tsx`.

## Tests

- Added route regressions for konservativ product results, missing/unknown scenario fallback, and scenario selection in both modes. Assertions check displayed retirement capital against real simulation results.
- Added picker coverage for result updates, URL replacement, retained source query/hash/history state, and selection after remount.
- Updated drill-in assertions for the active scenario, stale-ID fallback on Vergleich, and both current and legacy Mein Plan entry points.
- Observed the regressions fail before implementation; all 91 targeted tests pass afterward.
- Final `npm run verify` (review round 1): PASS. Frontend: 274 test files, 5,183 tests passed and one skipped. Workers: 37 tests passed. Lint, Worker type checks, production build and prerender passed.
- `npm run scenario:report`: PASS, all 27 cases and 5,869 stages reproduce the captured baselines. No oracle snapshots or scenario baselines changed.
- Regenerated `public/og/` images discarded before the implementation commit.

## Not done

- Nothing from the maintainer decision was skipped.

## Review round 1

- Fixed the readiness-reason callback dropping the scenario query. All three Mein Plan navigation paths to Kapital, plus the native link, now use one `kapitalSearch` helper.
- Made readiness assumption chips clickable through the existing reason callback; they previously rendered as plain text.
- Added a test that clicks the drawdown-horizon chip with konservativ selected. Observed the missing-query failure before the fix; all 71 tests in the affected Mein Plan and PlanOverview suites pass afterward.
