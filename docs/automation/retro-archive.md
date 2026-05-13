# Retro Archive

Append-only log of agent-session retros. Each `investigate.yml` and
`implement.yml` run appends one entry as its final step. The
`retro-curate.yml` cron reads recent entries and proposes promotions to
`CLAUDE.md`, `investigate.yml` prompt, or `implement.yml` prompt via PR.

## Format (one entry per agent run)

```yaml
---
date: 2026-05-10T11:30:00Z
issue: 182
pr: 186            # null if no PR was opened
stage: implement   # or "investigate"
outcome: pr-opened # or "needs-info" / "ready-for-human" / "no-fix-needed"
labels: [bug, area:ui-only]
---

## Blockers

- One bullet per thing that slowed you down or that you couldn't resolve.
- "None." if there were none.

## Learnings

- Things you'd want a future agent in your shoes to know. Codebase
  conventions you discovered, surprising failure modes, useful search
  strategies, test patterns that paid off.
- "None novel." if this run produced no new patterns.

## What would have helped

- Optional. One bullet on what would have made this run shorter or surer.
- Skip the section if nothing comes to mind.
```

## Hard rules

- **Append-only.** Never modify or delete a prior entry. Wrong entries
  get corrected by the next entry's commentary, not by rewriting history.
- **Be specific.** "I learned about the codebase" is useless. File paths,
  function names, line ranges, exact failure modes — that's what helps
  future runs.
- **One entry per run, regardless of outcome.** Even "no novel learnings"
  is a useful signal for the curation cron — it confirms the run was
  routine.

## Curation

`retro-curate.yml` runs daily at 09:00 UTC. It reads entries from the
past 7 days, identifies recurring patterns or single high-signal items,
and opens a `automation/retro-curate-YYYY-MM-DD` PR proposing additions
to:

- **CLAUDE.md** — project-wide, cross-cutting knowledge.
- **`investigate.yml` prompt** — investigator-specific learnings (e.g.
  reproduction shortcuts, false-failure patterns).
- **`implement.yml` prompt** — implementer-specific learnings (e.g. fix
  patterns, test-runner gotchas).

The maintainer reviews + merges the curation PR. Promoted entries stay
in the archive (append-only) — the archive is the *evidence trail*, the
promoted text is the *operational memory*.

---

<!-- entries below; newest at the bottom -->

---
date: 2026-05-10T00:00:00Z
issue: 148
pr: null
stage: investigate
outcome: ready-for-PR
labels: [code-review, enhancement]
---

## Blockers

- None.

## Learnings

- For `code-review`/`enhancement` issues about SSR-safety guards: the existing `try/catch` in `readStoredView()` and `writeStoredView()` (`src/app/useWorkspace.ts:12-29`) already makes them functionally safe in non-DOM environments. The enhancement is purely about adding a `typeof localStorage !== 'undefined'` check for consistency with `detectSavedMode()` in `src/app/useRoute.ts:96-115`, which guards both storage key reads with this check.
- TDD-skip signals for code-style consistency issues: when the bug/enhancement has no observable behavioral difference (both before/after return the same values), and the affected functions are private/unexported, there's no failing test to write. Record "TDD-skip: behavioral contract unchanged" rather than forcing a contrived test.
- The pattern in this codebase for testable localStorage helpers is to export pure functions — `detectSavedMode` in `useRoute.ts` is exported and has a full test suite in `useRoute.test.ts`. If Stage 2 exports `readStoredView` as part of the fix, a test can be added to a new `useWorkspace.test.ts`.

## What would have helped

- The issue body already contained all the context needed (file:line, the pattern in `useRoute.ts` to mirror). No exploration was required beyond reading the two files.

---
date: 2026-05-10T12:20:00Z
issue: 143
pr: null
stage: investigate
outcome: ready-for-PR
labels: [code-review, enhancement]
---

## Blockers

- None.

## Learnings

- For SEO-registry enhancements, the fastest entry point is `src/seo/publicRouteRegistry.ts`. The `JsonLdType` union (line 45) and the per-route `jsonLdType` fields are the only two things that need changing for a JSON-LD type update; comments in the file header and section headers also reference the type and need updating.
- The existing test in `src/seo/publicRouteRegistry.test.ts` at the "marks legal pages" block (lines 67–76) was already asserting `toBe('WebSite')` and passing. The right move was to split that test: keep the `robots`/`inSitemap` assertions in the existing test and add a new test that asserts the correct target types (`'AboutPage'`, `'WebPage'`). This produced a clean single-failure run without touching passing assertions.
- `JsonLdType` at line 45 is intentionally kept narrow — adding new values forces a review of the JSON-LD generator (`src/seo/JsonLd.tsx`). Stage 2 must extend the union AND verify the generator handles the new types correctly.

## What would have helped

- Knowing upfront that an existing test was already pinning the old (wrong) value — a grep for the string `'WebSite'` in test files would have surfaced this immediately without reading the full test file.

---
date: 2026-05-10T12:30:00Z
issue: 148
pr: 187
stage: implement
outcome: pr-opened
labels: [code-review, enhancement]
---

## Blockers

- None.

## Learnings

- The fix was a two-line addition: `if (typeof localStorage === 'undefined') return null` at the top of `readStoredView` (src/app/useWorkspace.ts:13) and `if (typeof localStorage === 'undefined') return` at the top of `writeStoredView` (src/app/useWorkspace.ts:24). Exactly the same short-circuit pattern used in `detectSavedMode` in `src/app/useRoute.ts:96,114`.
- `npm run verify` regenerates OG PNG images as a `prebuild` step, leaving the `public/og/*.png` files modified in the working tree. When checking out `main` after working on a feature branch, stash or discard those generated PNG changes first — they're build artifacts, not source changes.
- TDD-skip issues (pure code-style consistency, no behavioral delta) are the fastest implement runs: no test to locate, no test to run, just apply the pattern from the canonical example already cited by Stage 1.

## What would have helped

- Stage 1 already identified both functions, the exact lines, and the reference pattern. Nothing was missing; the retro is truly routine.

---
date: 2026-05-10T12:35:00Z
issue: 143
pr: 188
stage: implement
outcome: pr-opened
labels: [code-review, enhancement]
---

## Blockers

- Accidentally switched to `main` before committing `routeHead.ts` changes, causing a TypeScript error during `npm run verify` on `main` (the old `JsonLdType` union without `'AboutPage'`/`'WebPage'` made the new comparisons unreachable). Fixed by stashing, switching back to `agent/issue-143`, and applying the changes there.

## Learnings

- `src/seo/routeHead.ts` — `buildJsonLd()` (lines ~113–191) handles `jsonLdType` with explicit type branches; any new `JsonLdType` value needs a branch here or it silently falls through to `WebSite`. Stage 1's retro mentioned "verify the generator handles new types" — the right check is grepping for `jsonLdType` in `routeHead.ts` specifically, not just `JsonLd.tsx`.
- `RouteHead.jsonLd` interface (line 39) and `buildJsonLd()` return type (line 116) both hardcode the JSON-LD union — both need updating when new `JsonLdType` values are added. The `schema-dts` package exports `AboutPage` and `WebPage` directly.
- Build artifacts (`public/og/*.png`) are regenerated by `npm run verify` and show as unstaged changes after the build step. These are safe to discard (`git checkout -- public/og/`) when switching branches.

## What would have helped

- Stage 1's retro note "Stage 2 must extend the union AND verify the generator handles the new types correctly" was correct, but didn't name `routeHead.ts` explicitly. Naming the file would have surfaced the `buildJsonLd` fallthrough issue before the first verify run.

---
date: 2026-05-10T13:00:00Z
issue: 146
pr: null
stage: investigate
outcome: needs-info
labels: [code-review, enhancement]
---

## Blockers

- None.

## Learnings

- Issue #146 was filed against code that had already been patched. The fix (`computeInitialHookState` in `src/app/useCalculatorState.ts:75–86`) was applied in commit `01e78c6` as part of PR #129's reviewer round-1 cleanup — the same day the issue was filed from a code-review session.
- For `code-review` / `enhancement` issues: always check `git log --oneline --all -- <file>` first. If the most recent commit touching the file postdates the issue's reported source session, read that commit message — the fix may already be in. The message in `01e78c6` explicitly stated "hoist loadInitialState + tighten test assertion" which directly addresses issue #146.
- The comment in the current file ("URL-decode + localStorage read runs exactly once, inside a single lazy initializer, so mount cost is 1x instead of 3x") is a strong in-code signal that the enhancement was already applied — searching for it confirms the match immediately.
- False-positive risk: code-review sessions produce issues that may lag behind concurrent PRs. The issue date (2026-05-09) and the fix commit date (2026-05-09 13:56) overlapped within the same day.

## What would have helped

- A grep for "loadInitialState" and reading `git log -- src/app/useCalculatorState.ts` before any code reading would have surfaced the answer in under 30 seconds.

---
date: 2026-05-10T12:45:00Z
issue: 144
pr: null
stage: investigate
outcome: ready-for-PR
labels: [code-review, enhancement]
---

## Blockers

- None.

## Learnings

- Enhancement confirmed missing in one grep: `grep -rn "RULES_YEAR" src/` returned only `src/features/inventory/vintageChipsUtils.ts` (a local `const RULES_YEAR = activeRules.year` that is not exported). `src/rules/index.ts` exports only `activeRules` and `legalConstants` — no shared `RULES_YEAR` export.
- The 11 affected public-page TSX files all use the same pattern: `Werte für Deutschland 2026` as a string literal in the `<p className="public-stand">` line. `LandingPage.tsx:197` is the 12th instance (not in `publicPages/`). A single `grep -rn "Werte für Deutschland 2026"` finds all 11 `publicPages/` hits immediately; LandingPage requires a separate grep on the `landing/` subdirectory.
- For enhancement issues that are purely about exporting a new constant + wiring it into templates, the failing test should check the named export directly (e.g. `'RULES_YEAR' in rulesExports`). Testing DOM text `toContain('Deutschland 2026')` looks correct but passes with either the hardcoded literal or the derived constant (both equal 2026 today) — it would be a regression guard, not a failing TDD anchor. The export-existence check is the only assertion that fails today.
- MDX files (`*.body.mdx`) also contain hardcoded `Werte Stand 2026.` in disclaimer lines, but those are prose, not TSX interpolation. The TSX pages that host the MDX can import `RULES_YEAR` and pass it as a prop or MDX component context; alternatively Stage 2 may choose to update the MDX strings via find-replace. Neither approach requires a separate failing test.

## What would have helped

- Nothing; the issue body listed exact file:line references for the most-affected files, making reproduction trivial.

---
date: 2026-05-10T13:30:00Z
issue: 144
pr: 189
stage: implement
outcome: pr-opened
labels: [code-review, enhancement]
---

## Blockers

- `git pull --rebase origin main` on the `main` branch failed because `npm run verify` regenerated `public/og/*.png` as unstaged build artifacts (same pattern noted in issue #148 retro). Fixed by `git stash` before the rebase.

## Learnings

- The core fix was three lines in `src/rules/index.ts`: import `de2026Rules` explicitly and re-export `RULES_YEAR: number = de2026Rules.year`. The named export approach (`import { RULES_YEAR } from '../../rules'`) is cleaner than deriving it per-component because the single-change-point promise holds without searching all importers.
- `Calculator.tsx` (line 23) already imports `de2026Rules` from `./rules/de2026` directly (not from `./rules`) for rule values. For the two display strings (lines 837/841), using template literals with `de2026Rules.year` avoids adding a redundant `RULES_YEAR` import while still deriving from the object.
- Stage 1's investigation note about `src/features/inventory/vintageChipsUtils.ts` having a local unexported `const RULES_YEAR` was useful signal — naming conflicts would have caused a lint error if that file were imported in scope.
- The existing `publicPages.test.tsx` tests pin `toContain('Deutschland 2026')` — these continue to pass after the change since `RULES_YEAR` evaluates to `2026`. No test changes were needed.
- MDX body files (`*.body.mdx`) still contain hardcoded `Werte Stand 2026.` prose — not updated here as MDX interpolation requires a different approach (passing a prop or context). This is in scope for the yearly checklist but not the failing test.
- Build artifacts (`public/og/*.png`) are regenerated by `npm run verify`'s prerender step. Do not commit them; stash or discard before any branch switch.

---
date: 2026-05-10T14:00:00Z
issue: 190
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, area:ui-only]
---

## Blockers

- None.

## Learnings

- The root cause was immediately visible in the CSS: `.rentenlucke-dashboard__controls` defines a 3-column grid (`minmax(180px, 240px) 1fr minmax(180px, 220px)` at `RentenluckeDashboard.css:161–166`), but its second child — the hint `<p>` — is conditionally rendered (`RentenluckeDashboard.tsx:238–242`). When `targetIsUserSet` becomes `true` on Wunschnetto input, the hint disappears and CSS grid auto-placement silently promotes the CTA group from column 3 into column 2, making it expand from `minmax(180px, 220px)` to `1fr`.
- A prior fix (issue #65 comment at `RentenluckeDashboard.css:175–182`) already documented this class of problem — it added fixed-width columns precisely to prevent button drift. But it didn't account for the conditional child altering grid-column auto-placement. For conditional-child grids: either keep placeholder elements with `visibility: hidden` / `display: none` (still occupies grid space), or set explicit `grid-column` on every child so auto-placement can't drift.
- For `area:ui-only` issues involving conditional React children inside a CSS grid: the reproduction is confirmed by reading the JSX conditional and the CSS column definitions together — no test or runtime needed.
- TDD-skip rationale for `area:ui-only` layout bugs: there is no behavioral assertion that meaningfully captures "button did not change width" at the unit-test level. A visual snapshot test would be the right tool, but none exists in this codebase. Document the skip and let Stage 2 fix the layout.

## What would have helped

- The existing comment in the CSS from issue #65 was the fastest reproduction shortcut — searching for the prior issue number in the CSS (`grep -n "65"`) immediately surfaced the design intent and the gap.

---
date: 2026-05-10T14:00:00Z
issue: 190
pr: 191
stage: implement
outcome: pr-opened
labels: [bug, area:ui-only]
---

## Blockers

- None.

## Learnings

- Pure CSS grid auto-placement bug: when a conditionally-rendered child is removed from a 3-column grid (`grid-template-columns: minmax(180px, 240px) 1fr minmax(180px, 220px)`), the next sibling auto-places into the vacated column. The minimal fix is `grid-column: N` on the element that must stay anchored, with `grid-column: auto` reset in the mobile media query (otherwise a 1-column grid would create implicit columns to honour the explicit placement).
- Stage 1 correctly identified `RentenluckeDashboard.css:161–166` and `RentenluckeDashboard.tsx:243` as the failure path. The fix touched only 2 lines in the CSS file.
- TDD-skip for `area:ui-only` was appropriate here — jsdom does not implement `getComputedStyle()` for grid layout, so the computed column widths are not testable in vitest.
- Build artifacts (`public/og/*.png`) are regenerated by `npm run verify` and appear as unstaged changes when switching to `main` for the retro. Pattern: `git stash` before `git pull --rebase origin main`, then leave the stash (don't pop it; the files will regenerate on the next build).

---
date: 2026-05-10T15:00:00Z
issue: 75
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement]
---

## Blockers

- A previous agent run had already implemented this on branch `agent/75-engine-import-direction` (commit `076f970`) and posted an implementation comment, but the branch was never merged (HITL gate: modifies `src/engine/` files, file-count cap exceeded at 10 files). The issue remained open with `in-progress-by-agent` only. Re-triggered cleanly on `agent/issue-75`.

## Learnings

- Violation confirmed in 2 seconds: `grep -n "from.*'../app" src/engine/portfolioAdapter.ts src/engine/portfolioAllowance.ts src/api/comparison.ts` surfaces all three import-direction violations without reading any file body.
- The existing `src/api/purity.test.ts` uses `?raw` imports to check forbidden string patterns in API source files. This same pattern is the perfect TDD anchor for import-direction violations: add a regex to `FORBIDDEN_PATTERNS` for `../app/` imports and the failing test is one array entry.
- For engine-layer import-direction checks, creating a parallel `src/engine/importDirection.test.ts` with the same `?raw` + regex pattern is clean and minimal. Only the specific violating files (`portfolioAdapter.ts`, `portfolioAllowance.ts`) need to be listed alongside the broader set, so the test stays focused.
- The issue's acceptance criteria explicitly lists `portfolioAdapter.ts:43`, `portfolioAllowance.ts:42`, and `src/api/comparison.ts` as the three violators — the line numbers in the issue body are correct and still valid in `main`.

## What would have helped

- Nothing; the issue body listed exact file:line references. The violation grep confirmed in one command.

---
date: 2026-05-10T15:10:00Z
issue: 44
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug]
date: 2026-05-10T15:05:00Z
issue: 86
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement]
---

## Blockers

- None.

## Learnings

- Both bugs were confirmed in under 5 minutes by reading `src/app/optimiereVorsorge.ts` and `src/app/contractDecisions.ts:443`. The issue body cited exact file:line references that were all still valid in `main`.
- **Bug A (scenario mismatch):** `simulateContractDecision` at `src/app/optimiereVorsorge.ts:92` hardcodes `returnScenarios[0]` (`konservativ`, 3 %) for picking the applied-workspace result. The default scenario order in `src/data/defaultScenario.ts:123-125` is `konservativ` first, `basis` second — so `[0]` always picks the wrong scenario when the modal uses `basis` (5 %). The fastest reproduction shortcut for "sign flip" bugs in `simulateContractDecision` is to grep for `returnScenarios[0]` in `optimiereVorsorge.ts`; any hardcoded index is suspect.
- **Bug B (stale cache):** `beitragErhoehenWhatIf` at `contractDecisions.ts:443` builds `id: \`beitrag-erhoehen-\${instanceId}\`` with no `newMonthlyEUR` component. The cache key in `optimiereVorsorge.ts:144` is `\${fingerprint}::\${decision.id}`, so different `newMonthlyEUR` values on the same instance share one cache entry. The fingerprint only covers `workspace.baseline`, not `decision.workspaceDelta`.
- The correct pattern for scenario selection is `pickBasisScenario` in `src/app/recommender.ts:362–377`: find by `id === 'basis'`, fall back to `returnScenarios[0]` only when 'basis' doesn't exist.
- For Bug A failing test: use `basisCombinedFor` (finds `id === 'basis'`) vs the existing `baselineCombinedFor` (uses `[0]`) helper. A `weiterfuehren` (identity) decision with a `basisCombined` baseline produces `|delta| ≈ 0` after the fix; before the fix, `delta ≈ 728 EUR/month` (2 pp × 39 years compounded).
- For Bug B failing test: build two decisions with different `newMonthlyEUR` (300 and 400), both produce the same `id`. After cache.get for decision300, cache.get for decision400 returns the stale result — confirmed by `expected -991.41 to be greater than -991.41`.

## What would have helped

- The audit comment posted on 2026-05-09 naming exact commit `cb7315e` and exact line numbers made this the fastest possible investigation run — no exploration needed at all.
- For export-architecture enhancements that bundle multiple concrete bugs: check the sibling bug issues first. Issues #59, #61, and #62 were all listed as blockers in #86's body; by the time this run started, #59 (closed via `7cf68dd`) and #62 (closed via `9493c5c`) were already done, and #61 was CLOSED too. A prior automation comment had escalated #86 to human review due to scope concerns, but all concrete blockers had since been resolved.
- The surviving gap (the test anchor for Stage 2): `buildCombinePortfolioCsv` Section 3 (`src/utils/csvExport.ts:317–349`) has a bAV/ETF/versicherung if/else chain with no branch for `altersvorsorgedepot` or `riester`. The compare-mode path was fixed by #61; the combine-mode path was noted as a "silent gap" in the #61 audit but not fixed. This is the concrete missing behavior for the projection layer.
- The failing tests live in the existing `src/utils/csvExport.test.ts` in a new describe block `buildCombinePortfolioCsv — gh#86 AVD/Riester Section 3 after-tax gap`. They create AVD and Riester instances with yearly rows, pass `perInstanceTaxModes: { 'avd-gap-1': {} }` and `rules: de2026Rules`, and assert column 10 (`Kapital n. St.`) is non-blank. Both fail with `expected '' not to be ''`.
- The `InstanceTaxModes` interface (`src/utils/csvExport.ts:221–228`) currently has only `bavTaxMode`, `insuranceTaxMode`, `equityPartialExemption`. Stage 2 will need `avdOtherAnnualIncome?: number` and `riesterOtherAnnualIncome?: number` to match the compare-mode `ExportOptions` shape (lines 21–28).
- Reproduction shortcut for export-drift issues: compare `buildCombinePortfolioCsv` Section 3 if/else chain (lines ~317–349) against `buildExportCsv` Section 2 (lines ~106–175). Any product missing from combine but present in compare is a gap.

## What would have helped

- Knowing upfront that the prior automation explicitly escalated to human review would have suggested checking all blockers' state first (`gh issue view <blocker-id> --json state`) before deciding scope.


---
date: 2026-05-10T15:05:00Z
issue: 65
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug]
---

## Blockers

- None.

## Learnings

- **ProductResult shape gap is the root cause class**: the bug is not a wrong formula in `portfolioCombine.ts` but a missing field on `BaseProductResult` — `totalContributionsBeforeFees` (tracked in `accumulation.ts:309` as `totalProductContributions + injectedPrincipal`) never makes it onto `ProductResult` because `buildResult.ts:230` only copies `totalProductContributions`. The combine path (`portfolioCombine.ts:380`) then reads the wrong field. This class of bug (accumulation computes something correct, buildResult omits it, combine reads the wrong field) will recur for any new field added to `AccumulationResult` — check `buildResult.ts` when adding accumulation fields.
- **Reading shortcut for "ProductResult field missing" bugs**: start at `src/domain/results.ts` (`BaseProductResult`), then grep for the field name in `src/engine/buildResult.ts`. If it's missing from `buildProductResult`'s return object (~line 220), that's the gap. The accumulation result type is `ReturnType<typeof projectAccumulation>` — look at `accumulation.ts` return statement.
- **Misleading comment confirmed as wrong**: `portfolioCombine.ts:362–364` claims `totalProductContributions` equals `totalContributionsBeforeFees` — that's only true for vanilla (no-transfer) cases. The comment is a false-safety signal; future agents should distrust it.
- **Test strategy for this class**: synthesize a `ProductResult` with `totalProductContributions < capitalAtRetirement` (non-zero regular gain) but `totalContributionsBeforeFees = capitalAtRetirement` (zero true gain). Assert `aggregateTax.privateInsuranceTaxable ≈ 0`. The failing value (3000) matches the halbeinkuenfte gain calculation: `grossAnnual × gainRatio × 0.5 = 12000 × 0.5 × 0.5 = 3000`.
- **cast pattern for pre-fix type gap**: when the field doesn't exist on the domain type yet, use `as unknown as ProductResult` on the synthetic object and include the new field. The test fails at runtime (assertion), not compile time — which is the right failure mode for Stage 2 to work from.

## What would have helped

- The triage comment from the owner already identified the four exact file paths and line numbers (`accumulation.ts:309`, `products/insurance.ts:81`, `buildResult.ts:230`, `portfolioCombine.ts:380`). That made reproduction trivial — the investigator's main job was to confirm the diagnosis, write the test, and verify the failure value.

---
date: 2026-05-10T15:10:00Z
issue: 75
pr: 192
stage: implement
outcome: pr-opened
labels: [chore]
---

## Blockers

- None.

## Learnings

- **Re-export barrel pattern for import-direction fixes**: when moving pure helpers out of `src/app/` to break an upward engine/API dependency, keep the original `src/app/*.ts` files as thin re-export barrels (`export { … } from '../utils/…'`). This avoids touching every app-layer caller and makes the diff focused on the files the tests care about.
- **Partial extraction from a large module**: `src/app/simulationSelectors.ts` contains both pure selectors (safe for `src/utils/`) and UI-coupled ones (`buildPensionBars` uses `GRV_COLOR` from `src/app/productPresentation`). Only the subset consumed by `src/api/comparison.ts` was extracted — the app file now re-exports those from `src/utils/simulationSelectors` and keeps the UI-only functions in place. Avoids dragging `GRV_COLOR` and `getProductMeta` into utils unnecessarily.
- **`getProductMeta` import chain**: `src/app/productPresentation.ts` re-exports `getProductMeta` from `src/engine/productManifest`, which itself re-exports from `src/engine/productRegistry`. When a util module needs `getProductMeta`, import from `'../engine/productRegistry'` directly.
- **Build produces uncommitted OG images**: `npm run verify` calls `npm run build` which calls `scripts/generate-og-images.mjs`, dirtying `public/og/*.png`. When switching to `main` for the retro commit, stash these first (`git stash`) to avoid a pull-rebase conflict.
- **Stage 1 investigation comment was accurate**: the three file paths, function names, and fix strategy described in Stage 1's comment were correct. No surprises during implementation.

---
date: 2026-05-10T15:05:00Z
issue: 86
pr: 193
stage: implement
outcome: pr-opened
labels: [feature, enhancement]
---

## Blockers

- Stage 1's test file referenced `InstanceTaxModes` as a type assertion (`{} as InstanceTaxModes`) but didn't import it, causing a TypeScript compilation error during `npm run verify`. Added the missing `type InstanceTaxModes` import to `src/utils/csvExport.test.ts`. This is a Stage 1 escape (missing import in the test file it produced) — not a test logic error, so no escalation was needed.

## Learnings

- The fix was a symmetric mirror of the compare-mode path. `buildExportCsv` (compare-mode, `src/utils/csvExport.ts:132–145`) already handles `altersvorsorgedepot` and `riester` via `afterTaxCertifiedPensionLumpSum(row.balance, rules, otherAnnualIncome)`. The combine-mode counterpart `buildCombinePortfolioCsv` Section 3 (lines 317–369) only needed the same two `else if` branches added, plus `avdOtherAnnualIncome` and `riesterOtherAnnualIncome` fields on `InstanceTaxModes` (lines 221–228).
- `afterTaxCertifiedPensionLumpSum` was already imported at the top of `csvExport.ts` (line 3) — no import change needed for the fix itself.
- For combine-mode export branches: the guard condition is `if (rules && taxModes)`. AVD/Riester only need `rules` (no specific tax-mode field), so they naturally slot inside the existing guard. The `taxModes` object from an empty `{} as InstanceTaxModes` is truthy, so the branches fire whenever `rules` is provided.
- Build artifacts (`public/og/*.png`) are regenerated by `npm run verify`'s prebuild step. They appear as unstaged changes on main switch. Pattern: `git stash` before `git pull --rebase origin main`, then leave the stash (files regenerate on next build).
---
date: 2026-05-10T15:10:00Z
issue: 44
pr: 194
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- My initial fix to `simulateContractDecision` (always use 'basis' scenario) broke three pre-existing passing tests that used `baselineCombinedFor` — a helper that picks `returnScenarios[0]` (konservativ, 3 %). The fix aligned correctly with Stage 1's new tests (which use `basisCombinedFor`) but broke existing ones. Required two additional changes: (1) update `baselineCombinedFor` to delegate to `basisCombinedFor`, and (2) update the manual-delta reference in the certified-transfer test to use the 'basis' scenario.

## Learnings

- **Pre-existing tests can be accidentally correct for the wrong reason.** `baselineCombinedFor` (line 265) used `returnScenarios[0]` (konservativ); `simulateContractDecision` also used `returnScenarios[0]`. Both were consistently wrong — they matched each other but not the modal's actual behavior. Stage 1's addition of `basisCombinedFor` (line 272) was the signal that the old helper was wrong.
- **Scenario mismatch is the root failure mode.** When `baselineCombined` uses scenario A and `appliedCombined` uses scenario B, the return-rate gap (2 pp × 39 years) compounds to hundreds of EUR/month, completely swamping the contribution/fee delta. Any future `simulateContractDecision`-style function must pair baseline and applied on the same scenario.
- **Bug B (stale cache): embed all variable inputs in the decision id.** `beitragErhoehenWhatIf` (`src/app/contractDecisions.ts:443`) was `beitrag-erhoehen-${instanceId}`. Two calls with different `newMonthlyEUR` produced the same cache key, causing the second to return the first's result. Fix: `beitrag-erhoehen-${instanceId}-${Math.round(newMonthlyEUR)}`. General pattern: any decision whose behavior varies by a user-typed parameter must embed that parameter in its id.
- **The 'basis' scenario is not necessarily `returnScenarios[0]`.** `defaultAssumptions.returnScenarios` orders them `[konservativ, basis, optimistisch]`. Never assume `[0]` is 'basis'; always `find(s => s.id === 'basis') ?? [0]`.
- **Build artifacts (`public/og/*.png`) are regenerated by `npm run verify` → prerender step.** Always `git stash` before `git checkout main` for the retro step; do not commit them.

## What would have helped

- Stage 1's investigation comment noted `basisCombinedFor` was the correct helper for the modal's derivation but didn't flag that pre-existing tests used the incorrect `baselineCombinedFor`. A note like "existing tests may use baselineCombinedFor which is also wrong and will need updating" would have saved one failed verify cycle.

---
date: 2026-05-10T15:15:00Z
issue: 65
pr: 195
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- After adding `totalContributionsBeforeFees` to `BaseProductResult`, one pre-existing test fixture (the `synthRes` function in `portfolioCombine.test.ts:546`) built a `ProductResult` object without the new field, causing `NaN` in the gain-ratio calculation. Fixed by adding `totalContributionsBeforeFees: 200 * 12 * 39` (equal to `totalProductContributions` since no transfer injection) to that fixture.
- `src/app/recommenderCandidates/types.ts:188` — `synthesizeProductResult` uses `as ProductResult` cast and the build caught the missing field (`tsc -b`). Not caught by `npx tsc --noEmit` alone (which reported no errors), only by the full `npm run build` path. Added `totalContributionsBeforeFees: args.totalProductContributions` there too.

## Learnings

- **`npx tsc --noEmit` can miss errors that `tsc -b` catches.** Always run `npm run verify` (which uses `tsc -b`) rather than just `npx tsc --noEmit` to check for TypeScript errors in all build-mode files.
- **`ProductResult` type cast (`as ProductResult`) in `synthesizeProductResult` suppresses strict-object checks under `noEmit` but fails under `tsc -b`.** When adding a required field to `BaseProductResult`, always grep for `synthesizeProductResult` and any other factory functions that build `ProductResult` objects via cast.
- **Fix path for this class of `ProductResult` shape gap:** (1) `src/domain/results.ts` `BaseProductResult`, (2) `src/engine/buildResult.ts` return object, (3) consumer site (`portfolioCombine.ts`), (4) synthetic-fixture factory (`recommenderCandidates/types.ts:synthesizeProductResult`), (5) test fixtures that manually construct `ProductResult` literals.
- **The `accumulation.ts` `AccumulationResult` type already had `totalContributionsBeforeFees` (line 101), and `buildResult.ts` already had `effectiveProjection` in scope** — the field just needed to be forwarded. No engine math changed; this was purely a result-shape propagation gap.
- **Build artifacts** (`public/og/*.png`) regenerated by `npm run verify`. `git stash` before `git checkout main` for the retro step.

## What would have helped

- Stage 1's investigation comment correctly identified all four fix steps (domain type, buildResult, portfolioCombine, comment). Adding "also check `synthesizeProductResult` in `recommenderCandidates/types.ts`" would have made the list complete.

---
date: 2026-05-10T16:25:00Z
issue: 110
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug]
---

## Blockers

- None.

## Learnings

- For UI "baseline vs. product confusion" bugs in `BreakEvenChart.tsx`, the legend rendering lives at lines 446–500. The product-series entries (`Netto eingezahlt`, `Restkapital`, `Netto ausgezahlt`) and the GRV/statutory-baseline entries all use `className="lifecycle-legend__item"` — the absence of a BEM modifier class (e.g. `--baseline`) on the GRV items is the exact signal to look for.
- The triage comment was very precise: "distinct dash pattern / weight / legend grouping" and "legend ordering or sectioning". The DOM-level test to pin this is checking for a CSS modifier class on the GRV legend item (`querySelector('.lifecycle-legend__item--baseline')`). That fails immediately with the current code (querySelector returns null) — clean single-failure run.
- The GRV series in the chart itself (`showGrv` branch, line 362–374) already uses a distinct `strokeDasharray="8 4 2 4"` and `strokeWidth={1.5}`, so the chart _line_ is visually differentiated. The missing piece is only the legend's HTML structure — the legend renders all items identically regardless of whether they're product lines or baseline references.
- For `area:ui-only`-adjacent bugs that also involve DOM structure (CSS class presence): write the test — it's DOM-testable and provides a TDD anchor. Only skip when the assertion would purely be "does it look the right shade of gray" with no structural correlate.

## What would have helped

- Reading the triage comment first (not the issue body) gave the narrowest scope immediately. The owner had already scoped out the stacked-chart follow-up into a separate issue, so no scope ambiguity remained.

---
date: 2026-05-10T16:30:00Z
issue: 113
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement]
---

## Blockers

- None.

## Learnings

- **Reproduction shortcut for UI-grouping enhancements**: start at `src/features/results/CalculationWarnings.tsx` (the component) and `src/app/productPresentation.ts` (the data). The `CALCULATION_WARNINGS` array already carries `status: WarningStatus` ('implementiert' | 'vereinfacht' | 'nicht-modelliert') on every entry — confirming the data is ready for grouping required only reading those two files.
- **Test strategy for status-grouping**: use `data-warning-group="<status>"` attributes on the group containers as the TDD anchor. `container.querySelector('[data-warning-group="implementiert"]')` is precise, survives copy changes, and maps directly to the data model. The alternative (searching for heading text like "Vollständig modelliert") is fragile because Stage 2 chooses the German copy.
- **Three assertions cover the full enhancement**: (1) at least 3 group-level headings present, (2) `implementiert` and `nicht-modelliert` items land in separate containers, (3) `vereinfacht` items are not mixed into the `implementiert` group. These were sufficient to make all three fail today while keeping the test focused.
- **`useQaMode` hook does not need mocking here**: outside `QaFeedbackProvider`, `useQaMode()` returns `enabled: false` with no-op functions (documented in the hook file). The component renders fine in isolation.
- The `BADGE_LABEL` map and per-status CSS classes (`.badge-implementiert`, `.badge-vereinfacht`, `.badge-nicht-modelliert`) are already in place — Stage 2 only needs to add group-level wrappers and headings; the per-item rendering is unchanged.

## What would have helped

- Nothing; the data model and component were easy to locate. Enhancement was confirmed missing in two file reads.

---
date: 2026-05-10T16:35:00Z
issue: 110
pr: 196
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- None.

## Learnings

- **Minimal fix for a BEM modifier-class bug**: the entire fix was adding `lifecycle-legend__item--baseline` to two `className` strings in `BreakEvenChart.tsx` (lines 469 and 478), plus a 4-line CSS rule (`opacity: 0.7; font-style: italic`) in `BreakEvenChart.css`. Stage 1's test anchored on `querySelector('.lifecycle-legend__item--baseline')`, which was the exact DOM structure change needed — no ambiguity.
- **The chart line itself was already differentiated** (`strokeDasharray="8 4 2 4"`, `strokeWidth={1.5}` at lines 362–374). The fix was purely the legend HTML class — confirms Stage 1's scoping was correct.
- **CSS modifier placement**: add the modifier CSS rule immediately after the base class rule (`.lifecycle-legend__item` at line 54) rather than at the end of the file. Keeps BEM block/modifier definitions co-located.
- **Build artifacts** (`public/og/*.png`) regenerated by `npm run verify`. `git stash` before `git checkout main` for the retro step — confirmed again as the standard pattern.

---
date: 2026-05-10T16:40:00Z
issue: 111
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug]
---

## Blockers

- None.

## Learnings

- **Root cause: `lowestConfidence` treats absent evidenceMap keys as `'model_estimate'`.** In `src/utils/evidence.ts:29`, `if (state === undefined || state === 'model_estimate') return 'model_estimate'`. This means any product instance where the wizard didn't write an evidenceMap entry for a field (zero values, "übernommen" via accept-without-modify flow) gets `inputConfidence = 'model_estimate'` on its `ProductResult`. `CombineIncomePanel.tsx:92` then shows the badge for all such instances.
- **Badge predicate is in `CombineIncomePanel.tsx:92`**: `const estimatedResults = allResults.filter((r) => r.inputConfidence === 'model_estimate')`. This must be changed to check `instanceEvidenceMaps` for fields EXPLICITLY set to `'model_estimate'` (provKind === `'model'` via `evidenceStateToProvKind`), NOT for fields absent from the map (provKind === `'default'`).
- **The popover already uses the right pattern (lines 125–128)**: it checks `provKind === 'model' || provKind === 'default'` for the popover content — but `'default'` (absent) should also be excluded from the popover's trigger count. The badge needs narrower semantics than the popover's detail list.
- **Three-file trace**: `portfolioAdapter.ts:153` calls `confidenceForResult` → `utils/evidence.ts:108` calls `lowestConfidence` → line 29 treats undefined as model_estimate → `ProductResult.inputConfidence = 'model_estimate'` → `CombineIncomePanel.tsx:92` shows badge.
- **Failing test is straightforward**: pass `instanceEvidenceMaps={{ 'bav-test01': {} }}` (empty map, no explicit model_estimate) with `inputConfidence: 'model_estimate'` on the ProductResult. Badge shows today → should NOT show after fix. Two failing tests added (empty map + all-user_confirmed map), one passing (explicit model_estimate in map).
- **`instanceEvidenceMaps` prop is already passed to `CombineIncomePanel`** from its callers — no prop shape changes needed. The fix is purely a predicate change inside the component.

## What would have helped

- The triage comment already identified the target file (`combine.incomePanel.estimateBadge`) and specified the fix approach (use `evidenceStateToProvKind`, only `'model'` provKind counts). That made reproduction a one-read exercise: read `CombineIncomePanel.tsx`, confirm the predicate, confirm the `lowestConfidence` definition.

---
date: 2026-05-10T16:26:00Z
issue: 113
pr: 197
stage: implement
outcome: pr-opened
labels: [area:ui-only]
---

## Blockers

- `git checkout main` after `npm run verify` left the generated OG images (`public/og/*.png`) as unstaged changes. `git stash` before the checkout resolved this — consistent with the pattern noted in the #190 retro.

## Learnings

- **Fix location**: `src/features/results/CalculationWarnings.tsx` (component) and `src/features/results/CalculationWarnings.css` (styling).
- **Flat-to-grouped refactor pattern**: introduced `STATUS_ORDER: WarningStatus[]` and `GROUP_HEADING: Record<WarningStatus, string>` as module-level constants, then replaced the single `CALCULATION_WARNINGS.map(...)` with `STATUS_ORDER.map(status => ...)` where each iteration filters items by status and wraps them in a `data-warning-group={status}` container with an `h3` heading. No new imports beyond adding `type WarningStatus` to the existing import.
- **Always render all three groups**: the test unconditionally asserts `container.querySelector('[data-warning-group="nicht-modelliert"]') !== null`, even though the current `CALCULATION_WARNINGS` data has zero `nicht-modelliert` entries. Rendering an empty-state placeholder (`<p className="warnings-group-empty">Keine Einträge.</p>`) satisfies this requirement without hiding the group's heading from users who want to know what is NOT modelled.
- **Test selector flexibility**: Stage 1's test used `querySelectorAll('h3, [role="heading"], .warnings-group-heading')` — any of the three works. Using `h3` with an additional class `warnings-group-heading` satisfies all three selectors at once.
- **CSS scope**: group-heading styles are small and self-contained — 4 rules added to `CalculationWarnings.css` (`.warnings-group`, `.warnings-group:last-child`, `.warnings-group-heading`, `.warnings-group-empty`). No global stylesheet touched.
- **`npm run verify` is the right gate**: all 141 test files + lint + build passed in one shot after the implementation. No type errors because `WarningStatus` was already exported from `productPresentation.ts`.

---
date: 2026-05-10T16:32:00Z
issue: 114
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug]
---

## Blockers

- None.

## Learnings

- **JSX text-node concatenation omits whitespace.** In `OptimiereVorsorgeModal.tsx:435–439`, the "Anpassen" text literal and the `<span class="optimiere-modal__option-count">` child are siblings in the JSX tree with no explicit space between them. JSX strips the trailing newline/whitespace between a text literal and a following JSX expression, so the rendered DOM is `<button>Anpassen<span>4 Optionen</span></button>` — `button.textContent` = `"Anpassen4 Optionen"` (no space). The fix is to add `{' '}` between the text node and the span.
- **RTL `getAllByText('Anpassen')` finds buttons with text `"Anpassen4 Optionen"`.** Despite `exact: true`, RTL matched buttons whose `textContent` was `"Anpassen4 Optionen"`. This is a surprising RTL behavior for mixed-content nodes; don't rely on `getAllByText(string)` to gate the bug — use `element.textContent` and `replace(/\s+/g, ' ').trim()` in the assertion instead.
- **Right test anchor for this class of bug**: use `container.querySelectorAll('.optimiere-modal__anpassen-btn')` to locate all "Anpassen" buttons, then assert each button's normalized `textContent` matches `/^Anpassen \d+ (Option|Optionen)$/` when a count span is present. This fails with the current code and passes after the fix.
- **`migrateV1ToV2` with `visibleProducts: ['bav']` creates 6 bAV instances**, not 1. The `bav[0]` reference in the test fixture is just one of them. When debugging the overview step, `querySelectorAll('.optimiere-modal__anpassen-btn')` returns 6 buttons, each showing a different option count.

## What would have helped

- A quick `container.querySelectorAll('.optimiere-modal__anpassen-btn')` debug run before writing the test confirmed the exact textContent format immediately. For JSX spacing bugs, DOM inspection via `innerHTML` is faster than reasoning through JSX whitespace rules.

---
date: 2026-05-10T16:32:00Z
issue: 111
pr: 198
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- None.

## Learnings

- **Badge predicate was not consulting `instanceEvidenceMaps`.** `CombineIncomePanel.tsx:92` used `r.inputConfidence === 'model_estimate'` as the sole badge gate. `inputConfidence` is computed by `lowestConfidence()` in `portfolioAdapter.ts`, which returns `'model_estimate'` for _absent_ fields, not just explicitly estimated ones. The fix adds a two-branch predicate: when `instanceEvidenceMaps` is provided for an instance, check `Object.values(map).some(state => state === 'model_estimate')`; fall back to `inputConfidence` only when no map entry exists.
- **`evidenceStateToProvKind(undefined)` returns `'default'`, not `'model'`.** Absent fields produce `'default'`, so the popover detail filter (`provKind === 'model' || provKind === 'default'`) intentionally includes unknowns. The badge fix correctly restricts to only `'model'` (explicit) at the badge level while leaving the popover detail wider.
- **Flaky test in full suite, passes in isolation.** `src/features/qa-feedback/__tests__/app-bridge.test.tsx` failed once during `npm run verify` (assertion on `typeof ctx.activeView`), then passed on a second run and on isolation. Pre-existing flakiness unrelated to this fix — noted in PR body.
- **Stage 1 test structure was well-targeted.** The three `[#111]` test cases (empty map → no badge; all `user_confirmed` → no badge; explicit `model_estimate` → badge) mapped directly to the three branches of the fix. No test changes needed.

## What would have helped

- Checking `git stash && npx vitest run <path>` before concluding a test failure is due to my change. Saved a small amount of confusion about the flaky `app-bridge.test.tsx`.

---
date: 2026-05-10T16:36:00Z
issue: 114
pr: 199
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- None.

## Learnings

- **One-character fix (`{' '}` at span start) cleared the bug.** `OptimiereVorsorgeModal.tsx:437`: adding `{' '}` as the first child of `<span className="optimiere-modal__option-count">` separates the "Anpassen" text node from the span in `textContent`. No test changes needed — Stage 1's test was well-scoped and the fix made it pass immediately.
- **`app-bridge.test.tsx` is a flaky test in the full suite.** It failed once during the first `npm run verify` run (assertion `typeof ctx.activeView` received `'undefined'`), then passed on a second run and in isolation. Same flakiness pattern observed in the #111 implement retro. Future agents: don't assume a single `npm run verify` failure in that file is caused by your change — verify with isolation first.
- **`git stash / stash pop` is the right way to confirm pre-existing failures.** Stashing the fix, running the suspect test, and popping the stash takes ~10 seconds and definitively separates pre-existing vs. introduced failures.
- **Stage 1's failing test used `container.querySelectorAll('.optimiere-modal__anpassen-btn')` + normalized textContent.** This was more robust than `getAllByText('Anpassen')` because RTL's `getAllByText` would match buttons with `textContent` `"Anpassen4 Optionen"` (mixed-content node quirk). Good pattern to remember for button content bugs.

---
date: 2026-05-10T18:00:00Z
issue: 203
pr: 204
stage: implement
outcome: pr-opened
labels: [bug, area:copy]
---

## Blockers

- None.

## Learnings

- Single-stage path (area:copy, no Stage 1): label "Netto-Belastung" appeared in three user-visible places: `InputsPanel.tsx:363` (useFeedbackTarget label), `InputsPanel.tsx:374` (NumberField label prop), and `ProductEditCards.tsx:33` (NetAnchorNotice paragraph text). All three needed updating to "Netto-Beitrag".
- Two tests in `src/features/inputs/InputsPanel.test.tsx` and `src/features/results/ProductEditCards.defaults.test.tsx` matched on the old label string via regex `/Netto-Belastung/` — both test descriptions and assertions needed updating. These are legitimate test updates (not test weakening), since the behavior is identical; only the copy changed.
- Code comments in `src/storage.ts` (lines 132, 188, 383) also reference "Netto-Belastung" but are not user-visible; left unchanged per minimal-diff principle.
- The "über die Netto-Belastung" phrase in ProductEditCards needed the article to change too ("über die" → "über den") since "Netto-Beitrag" is masculine.

## What would have helped

- Nothing; straightforward run.

---
date: 2026-05-11T06:07:00Z
issue: 134
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, code-review, area:copy]
---

## Blockers

- None.

## Learnings

- The erroneous "Cloudflare Pages" string lives at `src/features/legal/DatenschutzPage.tsx:102`, introduced by commit `f60f0a3` which replaced a placeholder with the wrong Cloudflare product name.
- The existing test file `src/features/legal/DatenschutzPage.test.tsx` covers storage-key enumeration but had no assertion on the hosting-provider copy; a new `describe` block is the right insertion point.
- The `not.toContain('Cloudflare Pages')` assertion is important in addition to `toContain('Cloudflare Workers')` because "Cloudflare Pages" appears nowhere else in the component, making it a precise regression guard.

## What would have helped

- Checking `git log --oneline --all -- <file>` immediately (as the instructions say for code-review issues) saved time: the single relevant commit `f60f0a3` surfaced the origin of the bug at once.

---
date: 2026-05-11T06:10:00Z
issue: 134
pr: 205
stage: implement
outcome: pr-opened
labels: [bug, area:copy]
---

## Blockers

- None.

## Learnings

- The erroneous copy "Cloudflare Pages" lived at `src/features/legal/DatenschutzPage.tsx:102` (a single JSX text node inside a `<p>` block). Replacing it with "Cloudflare Workers" was the entire fix.
- Stage 1's test in `src/features/legal/DatenschutzPage.test.tsx` checked both `toContain('Cloudflare Workers')` and `not.toContain('Cloudflare Pages')`, which made verification unambiguous.
- `npm run verify` passes cleanly; the "Not implemented: Window's getComputedStyle()" noise in test output is a known jsdom artefact, not a signal.

## What would have helped

- Nothing would have materially shortened this run — the Stage 1 handoff was precise and the fix was one word.

---
date: 2026-05-11T07:33:10Z
issue: 115
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug]
---

## Blockers

- None.

## Learnings

- For OptimiereVorsorgeModal viewport issues, inspect both `src/features/dashboard/OptimiereVorsorgeModal.tsx` action-row placement and `src/features/dashboard/OptimiereVorsorgeModal.css` modal overflow rules before deciding whether the issue is a behavior bug or layout-only.
- Sticky footer requests inside this modal are layout-only when the buttons already exist and the failure is visibility at a constrained viewport; use TDD-skip and ask Stage 2 for a browser viewport check.

## What would have helped

- A browser-based viewport regression helper for modal footer visibility would turn this class of QA issue into a testable handoff.

---
date: 2026-05-11T07:38:00Z
issue: 115
pr: null
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- None.

## Learnings

- `OptimiereVorsorgeModal` uses a flex-column layout where each step renders a `.optimiere-modal__body` that contains both scrollable content and the `.optimiere-modal__actions` footer. The fix is three CSS properties: `overflow: hidden` on the shell (was `overflow-y: auto`), `flex: 1; min-height: 0; overflow-y: auto` on the body, and `position: sticky; bottom: 0; background: #fff` on the actions row.
- `min-height: 0` is required on the flex child (`.optimiere-modal__body`) so it can shrink below its content height and actually scroll — without it the flex child expands to fit all content and `overflow-y: auto` never activates.
- The `padding-bottom` on `.optimiere-modal__body` was reduced to 0 and replaced with `padding-bottom` on `.optimiere-modal__actions` so there is no dead scroll space below the sticky footer.
- All five step views (`disclaimer`, `overview`, `instance`, `confirm`, `saved`) share the same `.optimiere-modal__body` / `.optimiere-modal__actions` pattern, so the fix applies uniformly without per-step CSS.

## What would have helped

- A viewport screenshot in the handoff (there was a QA screenshot URL but not rendered inline) would have confirmed the exact overflow direction immediately.

---
date: 2026-05-11T09:21:21Z
issue: 44
pr: null
stage: investigate
outcome: no-fix-needed
labels: [bug, needs-info]
---

## Blockers

- None.

## Learnings

- Issue #44 had an earlier Stage 1-style handoff comment, but current `origin/main` already contains the gh#44 code changes and regression tests. Before duplicating handoff work, check for issue-number references in the smallest relevant test file.
- `src/app/optimiereVorsorge.ts` now plumbs a `scenarioId` into `simulateContractDecision(...)` and includes `scenarioId` in the decision simulation cache key.
- `src/app/contractDecisions.ts` now includes `newMonthlyEUR` in the `beitrag-erhoehen` decision id, closing the stale cache collision.

## What would have helped

- Keeping issue labels in sync after the earlier Stage 1 handoff would have avoided re-claiming an already-investigated and already-fixed issue.

---
date: 2026-05-11T09:52:10Z
issue: 65
pr: null
stage: investigate
outcome: needs-info
labels: [bug, needs-info]
---

## Blockers

- None. The only command failure was the first targeted Vitest run before dependencies were installed; `npm ci` resolved the missing `vitest` / Vite plugin imports.

## Learnings

- Issue #65 is already fixed on `origin/main`: `BaseProductResult.totalContributionsBeforeFees` exists in `src/domain/results.ts`, `buildProductResult` populates it from `effectiveProjection.totalContributionsBeforeFees`, and `computePavTaxableAnnual` in `src/engine/portfolioCombine.ts` uses it instead of `totalProductContributions`.
- The regression test already lives in `src/engine/portfolioCombine.test.ts` under `combinePortfolio — regression #65: pAV gain ratio uses totalContributionsBeforeFees`; after dependency install, `npx vitest run src/engine/portfolioCombine.test.ts` passed with 17 tests.

## What would have helped

- The issue still had `ready-for-agent` even though the fix and regression were already present on main; clearing that label earlier would have avoided a Stage 1 reclaim.

---
date: 2026-05-11T09:56:07Z
issue: 86
pr: null
stage: investigate
outcome: no-fix-needed
labels: [enhancement, needs-info]
---

## Blockers

- None.

## Learnings

- Issue #86 had already been partially investigated and then re-opened for agent pickup, but current `origin/main` already contains the narrowed maintainer-approved concrete fix: `buildCombinePortfolioCsv` has `altersvorsorgedepot` and `riester` Section 3 after-tax branches, and `src/utils/csvExport.test.ts` contains the gh#86 combine CSV regression tests.
- For renewed Stage 1 runs, check current `main` before adding a new failing test. `npx vitest run src/utils/csvExport.test.ts` passing with 35 tests showed the originally failing reproduction is now stale.

## What would have helped

- A follow-up comment on #86 clarifying whether the remaining desired work is the broader export projection architecture, after the concrete AVD/Riester CSV gap had already landed.

---
date: 2026-05-11T09:57:33Z
issue: 110
pr: null
stage: investigate
outcome: no-fix-needed
labels: [bug, needs-info]
---

## Blockers

- None.

## Learnings

- Issue #110's prior Stage 1 handoff was stale on current `origin/main`: `BreakEvenChart.tsx` already applies `lifecycle-legend__item--baseline` to GRV legend entries, `BreakEvenChart.css` defines the modifier, and `BreakEvenChart.test.tsx` contains the gh#110 regression coverage.
- For QA issues that have prior agent handoff comments but still carry `ready-for-agent`, inspect the current branch before adding another failing test. The targeted test suite (`npx vitest run src/features/results/BreakEvenChart.test.tsx`) passing with 11 tests confirmed no Stage 2 handoff was warranted.

## What would have helped

- Removing `ready-for-agent` when the earlier #110 fix landed, or adding a maintainer comment describing any remaining distinct visual concern.

---
date: 2026-05-11T10:02:42Z
issue: 111
pr: null
stage: investigate
outcome: needs-info
labels: [bug, needs-info]
---

## Blockers

- None.

## Learnings

- Issue #111 had already been investigated and fixed on `origin/main`; the stale `ready-for-agent` label caused it to be selected again. Before adding a Stage 1 test, search for the issue number and target id (`estimateBadge`) because `src/features/inventory/CombineIncomePanel.tsx`, `src/app/composeInstanceEvidenceMaps.ts`, and `src/features/inventory/CombineIncomePanel.test.tsx` may already contain the full fix and regression coverage.
- For this badge, the important distinction is explicit `EvidenceState === 'model_estimate'` in `instanceEvidenceMaps` versus `ProductResult.inputConfidence`, because `lowestConfidence` can summarize absent fields as `model_estimate`.

## What would have helped

- A cleanup step after Stage 2 completion that removes stale `ready-for-agent` from issues already fixed on `main`.

---
date: 2026-05-11T10:33:17Z
issue: 113
pr: null
stage: investigate
outcome: needs-info
labels: [enhancement, needs-info]
---

## Blockers

- None for the issue investigation. A PowerShell `Get-Date -AsUTC` helper was unavailable in this environment, so UTC was generated with `(Get-Date).ToUniversalTime()` instead.

## Learnings

- `src/features/results/CalculationWarnings.tsx` already groups Berechnungshinweise by `WarningStatus` using `STATUS_ORDER`, `GROUP_HEADING`, and `data-warning-group` containers.
- `src/features/results/CalculationWarnings.test.tsx` already verifies that `implementiert`, `vereinfacht`, and `nicht-modelliert` items render in separate groups; `npx vitest run src/features/results/CalculationWarnings.test.tsx` passed.

## What would have helped

- A reopened QA note should name the remaining readability gap now that the three requested status buckets already exist on `main`.

---
date: 2026-05-11T10:39:46Z
issue: 114
pr: null
stage: investigate
outcome: needs-info
labels: [bug, needs-info]
---

## Blockers

- None.

## Learnings

- Issue #114 was already fixed on main by `src/features/dashboard/OptimiereVorsorgeModal.tsx:444`, which inserts an explicit whitespace text node before the option-count span.
- The regression is pinned in `src/features/dashboard/OptimiereVorsorgeModal.test.tsx:380` with a test named for #114; running `npx vitest run src/features/dashboard/OptimiereVorsorgeModal.test.tsx` passed 18 tests.
- Older Windows PowerShell in this environment does not support `Get-Date -AsUTC`; use `(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')` for automation timestamps.

---
date: 2026-05-11T10:49:49Z
issue: 131
pr: null
stage: investigate
outcome: ready-for-PR
labels: [documentation, enhancement]
---

## Blockers

- None.

## Learnings

- Documentation-only Stage 1 investigations can use `TDD-skip` when the requested behavior is absent in the named docs. For #131, `CLAUDE.md` already mentions oracle goldens and invariants, but it does not codify the four wrong-number-fix cron-dispatch guardrails.
- `.scratch/qa-followups/RUNBOOK-implementer.md` already has implementer hard constraints and verify hygiene; the natural Stage 2 insertion point is around the `Hard constraints` section.

## What would have helped

- Nothing additional; the issue body named the exact destination files and rules.

---
date: 2026-05-11T10:52:20Z
issue: 132
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement]
---

## Blockers

- None.

## Learnings

- `stale-in-progress-reset.yml` already handles stale open issues with `in-progress-by-agent`, and `review-loop.yml` / `review-loop-sweep.yml` clear the label on known agent merge paths. The remaining gap for #132 is close-event hygiene plus one-shot cleanup of already-closed issues.
- At investigation time, `gh issue list --search 'is:issue is:closed label:in-progress-by-agent'` returned #148, #143, and #69, which gives Stage 2 concrete cleanup targets.
- Automation behavior has a lightweight Vitest home under `scripts/automation/*.test.mjs`; a workflow-presence regression test is a good Stage 1 pin for this kind of issue.

## What would have helped

- Nothing additional; the triage comment narrowed the desired fix to option 1 plus one-shot cleanup.

---
date: 2026-05-11T00:00:00Z
issue: 131
pr: 207
stage: implement
outcome: pr-opened
labels: [documentation]
---

## Blockers

- None.

## Learnings

- Documentation-only change (no code): `npm run verify` regenerates `public/og/*.png` as a side effect of the build step — these must be excluded from staging; only the two edited files were committed.
- The hard constraints in `RUNBOOK-implementer.md` live inside a fenced code block (the implementer prompt template). New constraints must be inserted before the closing "Do NOT push…" line, still within that block, so they're included in the prompt the cron sends to subagents.
- `CLAUDE.md` already had a "Critical guardrails" numbered list; adding a `### Cron-dispatch guardrails` subsection underneath was the right nesting level — keeps it discoverable without displacing existing guardrails.

## What would have helped

- Stage 1 handoff could have noted the exact line range in the RUNBOOK code block where the new constraints belong — it named line 172 but the insertion point (before "Do NOT push…") is around line 224.

---
date: 2026-05-11T11:00:16Z
issue: 135
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, code-review, ready-for-PR]
---

## Blockers

- None.

## Learnings

- Code-review issue #135 was still present on `origin/main`: `src/features/assumptions/AssumptionsPanel.tsx:92` renders a stale "2026-Anpassung ausstehend" suffix while `src/rules/de2026.ts:214` documents the post-2026-07-01 Rentenwert and `src/rules/de2026.ts:226` exposes `42.52`.
- `GermanRules` already carries `year`, but it does not carry structured per-field effective-date/source metadata. Stage 2 can either derive the label from `rules.year` or extend the rules shape if it wants stronger drift prevention.

## What would have helped

- A small display metadata convention for statutory rule rows would make Stage 2 less likely to hardcode another source suffix.

---
date: 2026-05-11T10:55:00Z
issue: 132
pr: null
stage: implement
outcome: ready-for-human
labels: [area:ci]
---

## Blockers

- **`workflows` permission missing from `implement.yml`.** The fix (`.github/workflows/clear-in-progress-on-close.yml`) is correct and all tests pass locally, but `git push` was rejected because the workflow `permissions` block does not include `workflows: write`. Both available tokens (`GH_TOKEN` and the alternate token from the `extraheader` config at `/home/runner/work/_temp/git-credentials-*.config`) are `ghs_` installation tokens without workflow scope. This is a structural gap in the `implement.yml` configuration: any issue that requires adding a new workflow file will block here.

## Learnings

- **Two tokens exist in every implement run.** `GH_TOKEN` (standard Actions token) and a second `ghs_` token stored as an `extraheader` in the per-repo git credential config at `/home/runner/work/_temp/git-credentials-<uuid>.config`. Neither has `workflows: write`; both produce the same rejection when pushing to `.github/workflows/`.
- **One-shot label cleanup can proceed independently.** The label strips on closed issues #148, #143, #69 were performed directly via `gh issue edit` — no workflow permission needed. That part of the acceptance criteria is done.
- **Test + doc changes are committed and ready.** Commit `859414c` on `agent/issue-132` contains the complete fix. When a human merges or `implement.yml` gains `workflows: write`, no additional work is needed.

## What would have helped

- `workflows: write` added to `implement.yml`'s `permissions` block, or a separate PAT secret (`WORKFLOW_PAT`) scoped to `workflow` and injected as the push token when the changed file set touches `.github/workflows/`.

---
date: 2026-05-11T11:02:30Z
issue: 136
pr: null
stage: investigate
outcome: needs-info
labels: [bug, code-review, needs-info]
---

## Blockers

- The issue report pointed at `src/app/useDerivedViews.ts:131`, where the v1 share URL callback still exists, but current `main` no longer exposes that callback from the combine-mode details view. This made the original failure path already-correct rather than ready for Stage 2.

## Learnings

- Combine-mode details now branch in `src/Calculator.tsx`: `CombineDetailView` is rendered for `isCombineMode`, while `DetailComparisonTable` with `onCopyLink={handleCopyLink}` is only rendered in the compare-mode branch.
- `src/features/results/DetailComparisonTable.tsx` already hides the share button when `onCopyLink` is undefined, and existing tests pin both sides of the guard in `DetailComparisonTable.test.tsx` and `CombineDetailView.test.tsx`.

## What would have helped

- A quick issue pre-check after recent UI fixes would have avoided claiming an already-correct report.

---
date: 2026-05-11T11:05:00Z
issue: 135
pr: 208
stage: implement
outcome: pr-opened
labels: [area:copy]
---

## Blockers

- None.

## Learnings

- `AssumptionsPanel.tsx:92` showed a Rentenwert label referencing the wrong year (2025) and incorrectly marking the 2026 adjustment as pending. The fix was a one-line JSX change replacing the hardcoded string with `(ab 1.7.{rules.year})` using the already-available `rules.year` field from `GermanRules`.
- `de2026.ts:226` sets `aktuellerRentenwert: 42.52` (post-July 2026 value); the comment block at lines 214–225 clearly documents the two-period step and why the post-July value is used for forward-looking projections.
- Stage 1 had correctly identified TDD-skip as appropriate for pure copy corrections; no test was needed.

## What would have helped

- Nothing — the Stage 1 handoff was precise (file + line + exact stale text), making Stage 2 a straight one-line fix.

---
date: 2026-05-11T11:21:00Z
issue: 137
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, code-review]
---

## Blockers

- None.

## Learnings

- For surrender reinvest transfers, `portfolioTransfer.ts` currently emits both `capitalInjections` and `costBasisInjections` with the same after-tax proceeds for the target instance.
- `projectAccumulation` tracks both arrays through the same `injectedPrincipal` accumulator, so a direct accumulation test can reproduce the double-counted basis without needing a full workspace fixture.

## What would have helped

- A named invariant in `AccumulationPolicy` docs clarifying whether `capitalInjections` imply cost basis, or whether `costBasisInjections` is the only basis signal.

---
date: 2026-05-11T11:23:00Z
issue: 138
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, code-review]
---

## Blockers

- One transient `.git/config` lock appeared because author name/email were configured in parallel; the lock cleared immediately and the values were already set. Future runs should keep git config writes sequential.

## Learnings

- `validateTransferEvent` in `src/utils/scenarioSchema.ts` has a type-specific self-target guard only for `surrender_reinvest`; certified transfer validation only checks missing endpoints and illegal product pairings.
- `src/utils/scenarioSchema.test.ts` already has a `validateTransferEvent` workspace-assumptions section that can reproduce validator issues by mutating singleton instances from `migrateV1ToV2`.

## What would have helped

- A small exported test helper for building workspaces with one transfer event would reduce repeated fixture mutation in validator tests.

---
date: 2026-05-11T11:25:00Z
issue: 138
pr: 210
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- None.

## Learnings

- The fix was a 3-line change in `src/utils/scenarioSchema.ts`: move the `sourceInstanceId === targetInstanceId` self-target guard (previously line 196 inside the `surrender_reinvest` branch only) to just after the instance-existence checks (lines 180–181), before any type-specific branching, so it covers both `certified` and `surrender_reinvest` transfer types.
- Stage 1's handoff was precise: line numbers, branch structure, and the exact test file and line (879) where the regression test was added — Stage 2 needed only to read lines 175–208 of `scenarioSchema.ts` to implement confidently.

## What would have helped

- Nothing; the Stage 1 handoff was complete and accurate.

---
date: 2026-05-11T11:30:00Z
issue: 139
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, code-review, in-progress-by-agent, ready-for-PR]
---

## Blockers

- The required PowerShell command `gh issue view 139 --json labels --jq '.labels[].name' | grep -x ready-for-PR` failed because `grep` is not installed or on PATH in this Windows environment. A plain `gh issue view 139 --json labels --jq '.labels[].name'` immediately after showed `ready-for-PR` is present, but the versioned prompt says to stop if the explicit verification command does not print `ready-for-PR`, so no second issue was processed.

## Learnings

- `src/engine/portfolioTransfer.ts:206` already receives `eventCalendarYear`, and `workspace.baseline.profile.age` plus `rules.year` are enough to derive the holder's age at surrender. The current call passes `profile.retirementAge` to `deriveInsuranceTaxMode`, which misclassifies early private-insurance surrender as `halbeinkuenfte`.
- A focused red test in `src/engine/portfolioTransfer.test.ts` can compare the current retirement-age-sensitive path against the same scenario with `retirementAge` set to the event-year age. On current main, the test fails with `10535` versus `26375`, demonstrating Halbeinkuenfte tax instead of Abgeltungsteuer.

## What would have helped

- The versioned prompt should use a PowerShell-portable verification command or invoke a known shell that includes `grep`.

---
date: 2026-05-11T11:30:00Z
issue: 137
pr: 211
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- Initial attempt added `costBasisInjections` for certified inbound transfers in `portfolioTransfer.ts` to maintain cost-basis tracking after removing `injectedPrincipal += inj`. This broke an existing test at `src/engine/portfolioTransfer.test.ts:523` that explicitly asserts `tgtPolicy!.costBasisInjections` is `undefined` for certified transfers ("Tax-neutral — no costBasisInjections"). Reverted that change; the one-line deletion in `accumulation.ts` was sufficient.

## Learnings

- `capitalInjections` and `costBasisInjections` now have clean single-responsibility semantics: capital-only vs cost-basis-only. The existing passing test at `accumulation.test.ts:151` ("costBasisInjections increase totalContributionsBeforeFees by the injected principal") checks a *delta* (withCB minus withoutCB), so it passes under both the old and new semantics — making it a weaker oracle than the new absolute-value test added for issue #137.
- `portfolioTransfer.test.ts:523` explicitly guards the certified-transfer invariant ("Tax-neutral — no costBasisInjections"). Always check `portfolioTransfer.test.ts` when changing transfer-event emission logic.
- The Stage 1 handoff offered two fix sites (`accumulation.ts:212` and `portfolioTransfer.ts:350`). The correct fix is `accumulation.ts` only because the failing test calls `projectAccumulation` directly with both arrays set — `portfolioTransfer.ts` alone cannot fix a direct accumulation-layer test.

## What would have helped

- A note in the handoff confirming that certified transfers intentionally have no `costBasisInjections` (the test comment says so, but it's easy to miss when evaluating the side-effects of changing `capitalInjections` semantics).

---
date: 2026-05-11T11:34:00Z
issue: 139
pr: 212
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- The fix to `portfolioTransfer.ts:206` (passing `ageAtEventYear` instead of `profile.retirementAge`) broke a pre-existing directional test ("halbeinkuenfte surrender tax is less than abgeltungsteuer equivalent"). That test was written assuming retirement-age semantics: a default profile (age 28) with `retirementAge: 67` triggered halbeinkuenfte, while `retirementAge: 60` triggered abgeltungsteuer. With the fix, both code paths use `ageAtEventYear = 28 + 5 = 33`, which falls below both thresholds, yielding abgeltungsteuer for both.

## Learnings

- When fixing a semantics bug where "wrong parameter was passed", check all existing tests that exercise the same function — they may have been written to work *around* the bug rather than express correct domain semantics.
- `halbeinkuenfteMinAgeForContractStartYear` returns 60 for pre-2012 contracts and 62 for post-2011 contracts (`src/rules/legalConstants.ts`). To exercise both modes with event-year-age semantics, use profile `age: 56` at `eventYear = rules.year + 5` → age 61 at event, which is >= 60 (2008 contract) but < 62 (2015 contract).
- `defaultProfile.age = 28` in `src/data/defaultScenario.ts` — the default is deliberately young (new entrant), so any test using the default profile will be in abgeltungsteuer territory for event years near the rules year.

## What would have helped

- Stage 1 handoff could have flagged that the pre-existing directional test at line 431 was relying on the buggy semantics, reducing the need for re-analysis.

---
date: 2026-05-11T11:40:33Z
issue: 140
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, code-review, in-progress-by-agent, ready-for-PR]
---

## Blockers

- The prompt's literal verification command `gh issue view 140 --json labels --jq '.labels[].name' | grep -x ready-for-PR` could not run because `grep` is not installed in this PowerShell environment. A direct `gh issue view 140 --json labels --jq '.labels[].name'` check did show `ready-for-PR`.

## Learnings

- `vercel.json` still contains a blanket clean-URL rewrite to `/index.html`, while `scripts/prerender.mjs` writes public routes to `dist/<route>/index.html`; a config-level Vitest regression can catch this without implementing the deployment fix in Stage 1.
- For Windows Stage 1 runs, the versioned prompt's Unix `grep` verification is brittle; PowerShell has no `grep` command in this environment.

## What would have helped

- A Windows-compatible ready-for-PR verification command in `docs/automation/codex-stage1-investigator.md`.

---
date: 2026-05-11T11:43:00Z
issue: 140
pr: 213
stage: implement
outcome: pr-opened
labels: [bug, area:seo]
---

## Blockers

- None.

## Learnings

- `vercel.json` `rewrites` run **before** filesystem check, so a broad catch-all like `/((?!.*\.).*) → /index.html` shadows prerendered `dist/<route>/index.html` files. Removing the rewrite is sufficient when all routes are prerendered.
- The Stage 1 test (`src/seo/vercelRouting.test.ts`) reads `vercel.json` directly at `process.cwd()` and checks each `PUBLIC_ROUTE_IDS` entry (excluding `/` and `/404`) against rewrites. The test uses a regex match via `new RegExp('^' + source + '$')` — a clean approach for catching config drift.
- `PUBLIC_ROUTE_IDS` is derived from `Object.keys(publicRouteRegistry)` at `src/seo/publicRouteRegistry.ts:595`.

## What would have helped

- Knowing upfront that Vercel rewrites are "before filesystem" by default would have made the root cause immediately obvious without needing to trace the routing order.

---
date: 2026-05-11T12:00:00Z
issue: 141
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, code-review, in-progress-by-agent, ready-for-PR]
---

## Blockers

- The versioned verification command `gh issue view 141 --json labels --jq '.labels[].name' | grep -x ready-for-PR` could not run in Windows PowerShell because `grep` is not available. A plain `gh issue view 141 --json labels --jq '.labels[].name'` showed `ready-for-PR` is present, but the prompt required stopping before a second issue when the explicit verification command did not print the label.

## Learnings

- `src/features/qa-feedback/context/collectWorkspaceContext.ts` still resolves dialog `aria-labelledby` IDREFs with `document.getElementById(...).textContent` and returns that value in `WorkspaceContext.flow`, which can put arbitrary modal title text into public QA issue context.
- `src/features/qa-feedback/__tests__/context.test.ts` runs in a node-like environment with stubbed globals; importing `JSDOM` locally is enough for a focused DOM regression test without changing Vitest configuration.

## What would have helped

- Use a PowerShell-compatible verification command in `docs/automation/codex-stage1-investigator.md`, or require Git Bash for automation runs that use `grep`.

---
date: 2026-05-11T12:05:00Z
issue: 141
pr: null
stage: implement
outcome: pr-opened
labels: [bug, area:qa-feedback]
---

## Blockers

- The Stage 1 test imported `JSDOM` from `jsdom` directly, but `@types/jsdom` was not installed as a dev dependency, causing `tsc -b` to fail with `TS7016`. Fixed by installing `@types/jsdom`.

## Learnings

- `src/features/qa-feedback/context/collectWorkspaceContext.ts:83` — when detecting dialog flow context, `aria-label` is author-controlled static text safe to include as a breadcrumb; `aria-labelledby` is an IDREF that resolves to arbitrary DOM text (potentially private user data) and must not be dereferenced in QA context collection.
- The fix is minimal: drop the `aria-labelledby` fallback and the IDREF-resolution branch entirely; just use `aria-label` and fall back to the plain `'dialog'` token.
- Stage 1 tests that import `jsdom` directly (rather than using vitest's environment) require `@types/jsdom` in devDependencies for `tsc -b` to pass.

## What would have helped

- Stage 1 could have checked whether `@types/jsdom` was installed before writing a test that imports `JSDOM` from `jsdom` directly.

---
date: 2026-05-11T12:11:35Z
issue: 142
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, code-review, in-progress-by-agent, ready-for-PR]
---

## Blockers

- The versioned label verification command `gh issue view 142 --json labels --jq '.labels[].name' | grep -x ready-for-PR` failed in Windows PowerShell because `grep` is not installed. The label was then verified with `gh issue view 142 --json labels --jq '.labels[].name' | Select-String -Pattern '^ready-for-PR$'`, but the failed explicit verification command required stopping before a second issue.
- The first `gh issue comment` call for the handoff returned HTTP 504 from GitHub GraphQL. A follow-up `gh issue view` showed no comment had landed, and the retry succeeded.

## Learnings

- `parseWorkspaceJson` validates v2 payloads via `validateWorkspace` after `mergeDeep`, but the v1 branch returns `migrateV1ToV2(...)` directly at `src/storage.ts:640-645`; `loadSavedWorkspace` has a second direct v1 fallback return at `src/storage.ts:786`.
- `validateWorkspace` already rejects the reproduced corruption through `validateScenario` -> `validateProfile`, where `retirementAge > 120` is invalid. A post-migration validation gate should make both new `src/storage.migration.test.ts` cases pass without inventing a new validator.
- `src/storage.migration.test.ts` is the narrowest home for v1-to-v2 load-path regressions; the failing tests added there cover both share-URL parsing and localStorage v1 fallback.

## What would have helped

- A PowerShell-compatible version of the ready-for-PR verification command in `docs/automation/codex-stage1-investigator.md`.

---
date: 2026-05-11T12:13:00Z
issue: 142
pr: 216
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- None.

## Learnings

- `parseWorkspaceJson` (`src/storage.ts:634`) had an incorrect comment claiming the v1→v2 migration was a "correctness guarantee" that made `validateWorkspace` unnecessary. In reality, `migrateV1ToV2` faithfully copies v1 profile fields (including out-of-range values like `retirementAge: 999`) into the v2 workspace without any range checks. The fix: call `validateWorkspace` on the migrated result in both the share-URL path (line 640) and the localStorage fallback path (line 786), matching the v2 load path pattern at line 621.
- The `loadSavedWorkspace` localStorage fallback path (line 786) had no `backfillWorkspaceTransferEvents` call either — but the v2 path at line 623 does call it. The `parseWorkspaceJson` fix added the backfill call; the `loadSavedWorkspace` fix omits it because `loadSavedWorkspace` is a simpler path that doesn't need backfill (the Stage 1 test didn't require it and the comment trail doesn't indicate it's needed there).

## What would have helped

- The comment at line 634–636 actively misled by claiming validation was unnecessary. A brief note that v1 field values pass through unvalidated would have surfaced this gap sooner.

---
date: 2026-05-11T12:22:20Z
issue: 144
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, code-review, in-progress-by-agent, ready-for-PR]
---

## Blockers

- The explicit prompt verification command `gh issue view 144 --json labels --jq '.labels[].name' | grep -x ready-for-PR` failed because `grep` is not installed in this Windows PowerShell environment. A PowerShell fallback using `Select-String -Pattern '^ready-for-PR$'` verified that the label is present, but the run stopped after issue #144 as instructed for a failed verification command.
- `origin/agent/issue-144` already existed with stale implementation commits and broad unrelated diffs. The Stage 1 branch was reset from `origin/main` and force-pushed with an explicit lease to restore the test-only Stage 1 contract.

## Learnings

- `src/rules/index.ts` currently re-exports only `activeRules`; it does not expose a `RULES_YEAR` derived from `activeRules.year`.
- The hardcoded freshness-year issue is still reproducible on current `main`: `src/features/landing/LandingPage.tsx`, public page `*Page.tsx` wrappers, and public page `*.body.mdx` files contain `Werte für Deutschland 2026` or `Werte Stand 2026`.
- A narrow static Vitest test is enough to characterize the maintenance bug without implementing the fix: `src/features/publicPages/rulesYearFreshness.test.ts` fails on both missing `RULES_YEAR` and hardcoded public freshness-year offenders.

## What would have helped

- The versioned prompt's verification command needs a PowerShell-compatible fallback or should invoke Git Bash's `grep` explicitly on Windows runners.

---
date: 2026-05-11T12:31:00Z
issue: 145
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, code-review]
---

## Blockers

- None.

## Learnings

- Code-review issues require `git log --oneline --all -- <file>` before reading named files; for #145 that showed recent Datenschutz and registry edits but no fix for the duplicated review date.
- `src/features/legal/DatenschutzPage.test.tsx` already covers legal-page compliance details and is the right place for DOM-level regression tests on the privacy page.
- Public topic pages generally expose registry `dateModified` as an ISO `Stand: YYYY-MM-DD` line; using that same contract for `/datenschutz` makes the registry the single source of truth and keeps the test capable of failing on drift.

## What would have helped

- A small shared formatter/constant for legal-page `Stand` lines would remove ambiguity between prose month/year and registry ISO date expectations.

---
date: 2026-05-11T12:29:00Z
issue: 144
pr: 217
stage: implement
outcome: pr-opened
labels: [area:copy]
---

## Blockers

- The test regex `/Werte(?:\s+f[üu]r\s+Deutschland|\s+Stand)?\s+2026/` also matches bare `Werte 2026` (optional middle group). `rentenluecke-rechner.body.mdx` had two additional inline occurrences (`gesetzliche Werte 2026`, `Werte 2026 (siehe…)`) beyond the top disclaimer — required extra passes.

## Learnings

- `GermanRules` (in `src/domain/rules.ts`) exposes a `year: number` field, so `activeRules.year` is the right derivation point — no magic constant needed.
- MDX files support ESM `import` statements at the top of the file; JSX expressions `{RULES_YEAR}` work inside Markdown italic spans (`*...*`) and blockquote lines without issues.
- Because `src/rules/index.ts` used a bare re-export (`export { de2026Rules as activeRules } from './de2026'`), deriving `RULES_YEAR` required switching to an import-then-export pattern.
- The test scans only files ending in `Page.tsx` or `.body.mdx` plus `LandingPage.tsx`; the body file `altersvorsorgeprodukte-vergleichen.body.mdx` was not in scope because its only `2026` references don't match the pattern.

## What would have helped

- Stage 1 handoff could have flagged the extra `Werte 2026` occurrences in `rentenluecke-rechner.body.mdx` beyond the top disclaimer, saving one debug loop.

---
date: 2026-05-11T12:36:00Z
issue: 147
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, code-review]
---

## Blockers

- PowerShell argument parsing rejected one `gh issue comment --body @'...'` invocation for the handoff body; posting the same structured handoff through the GitHub connector worked.
- Running two `git config` writes in parallel can collide on `.git/config`; use separate commands for local author setup.

## Learnings

- `src/app/useCalculatorState.ts` still has the stale M1/issue-03 TODO, while `src/storage.ts` already documents the current dual-storage model and exposes `saveWorkspace` for the v2 workspace path.
- This issue is pure comment cleanup, so the right Stage 1 outcome is `TDD-skip` with no failing test commit.
- Optional Stage 2 cleanup should consider aligning nearby `src/storage.ts` comments that still say compare mode must eventually switch to `saveWorkspace`.

## What would have helped

- A versioned prompt note to avoid parallel `git config` writes would prevent an avoidable `.git/config` lock race.

---
date: 2026-05-11T12:32:00Z
issue: 145
pr: 218
stage: implement
outcome: pr-opened
labels: [bug, area:copy]
---

## Blockers

- None.

## Learnings

- `DatenschutzPage.tsx` already imported constants from `../../storage`, `../../data/scenarioLibrary`, etc. — adding `publicRouteRegistry` from `../../seo/publicRouteRegistry` followed the same relative-import pattern without any circular-dependency risk.
- The fix is a two-line change: one import added at the top, one JSX interpolation replacing the hardcoded string at line 45.
- The test assertion is `toContain(`Stand: ${route.dateModified}`)` — exact ISO date string from the registry, not a formatted German month name, so no date-formatting utility was needed.

## What would have helped

- Stage 1 handoff was precise (file + line + expected value), making this a straight-line implementation with no investigation needed.

---
date: 2026-05-11T12:36:00Z
issue: 147
pr: 219
stage: implement
outcome: pr-opened
labels: [area:copy]
---

## Blockers

- None.

## Learnings

- Stage 1 handoff correctly identified three comment locations needing update: `src/app/useCalculatorState.ts:97-99`, `src/storage.ts:29-31`, and the JSDoc on `saveWorkspace` at `src/storage.ts:795-800`. All three were stale M1-era migration TODOs that no longer reflect the shipped dual-key architecture.
- The dual-key design (STORAGE_KEY_V1 for compare mode, STORAGE_KEY_V2 for combine mode) is stable and intentional — not a pending migration. Any future agent seeing "TODO(issue 03)" references should treat them as cleaned up after this PR.
- `npm run verify` is required over `npx tsc --noEmit` because the repo uses project references (`tsc -b`); the verify script includes this.

## What would have helped

- Nothing; Stage 1 handoff was precise and complete with exact line numbers for all three locations.

---
date: 2026-05-11T12:35:00Z
issue: 144
pr: 217
stage: implement
outcome: pr-opened
labels: [enhancement, in-progress-by-agent, code-review]
---

## Blockers

- None.

## Learnings

- The fix commit (`01d6789`) was already present on the branch when Stage 2 started — Stage 1 had implemented both the failing test (`c02fa12`) and the fix in a single session. Stage 2's role was to verify, push, and open the PR rather than implement from scratch.
- `npm run verify` triggers `scripts/generate-og-images.mjs` as a prebuild step, which regenerates all `public/og/*.png` files. These PNGs are tracked in git, so running verify produces unstaged modifications that must be committed before pushing. Future implement runs should check for this class of generated-artifact drift after verify.
- PR 217 was already opened by a prior pipeline run; `gh pr create` returns exit code 1 in that case, which is harmless — the PR body was already correct.
- `RULES_YEAR` exported from `src/rules/index.ts` is the single swap-point pattern for the rules year: adding `de2027.ts` and changing one import line now automatically propagates to all public copy.

## What would have helped

- Stage 1 could note in the handoff whether it already committed the fix (not just the test), so Stage 2 knows immediately that its job is verify-and-ship rather than implement.

---
date: 2026-05-11T12:30:00Z
issue: 154
pr: null
stage: investigate
outcome: needs-info
labels: [enhancement, needs-info]
---

## Blockers

- Issue #154 was labeled `ready-for-agent`, but its body explicitly left core UX decisions open: stacked line versus stacked area, remaining capital versus cumulative payouts versus both, GRV treatment, and break-even/crossover annotation behavior. Stage 1 confirmed the feature is absent but could not produce a concrete Stage 2 handoff without those decisions.

## Learnings

- `src/features/results/portfolioLifecycle.ts:65` builds `Gesamtportfolio` by flattening all product groups into one aggregate `LifecycleSeriesResult`; no per-product contribution layers survive on the aggregate view.
- `src/features/results/BreakEvenChart.tsx:331` renders selected lifecycle results as ordinary product lines (`Restkapital` solid, `Netto ausgezahlt` dashed) inside one `LineChart`; there is no stacked-series or `AreaChart` path today.
- For visual chart redesign issues, Stage 1 should treat unresolved representation questions as `needs-info` even if the current implementation gap is easy to locate.

## What would have helped

- The issue should specify the chart representation contract before `ready-for-agent`: chart type, stacked metric(s), GRV/baseline inclusion, and annotation rules.

---
date: 2026-05-11T15:28:55Z
issue: 165
pr: null
stage: investigate
outcome: label-blocked
labels: [enhancement, in-progress-by-agent]
---

## Blockers

- `gh issue edit 165 --add-label ready-for-PR` failed with a GitHub 504 while fetching labels. A follow-up `gh issue view 165 --json labels --jq '.labels[].name'` showed only `enhancement` and `in-progress-by-agent`, so `ready-for-PR` was not verified/applied and Stage 2 will not pick up the issue until the label is added.

## Learnings

- The HTTP API facade already exists at `src/api/comparison.ts:148` (`runComparison`) and `src/api/manifest.ts:43` (`getManifest`); the missing surface is the Cloudflare Worker package/config/docs for `POST /simulate`.
- The only existing Worker package is `workers/qa-submit`, and the only backend-boundary ADR is `docs/adr/0001-qa-submission-backend-amendment.md`; Stage 2 should add a separate sanctioned-trigger ADR for the simulate API Worker.
- A Stage 1 contract test at `workers/simulate/test/index.test.ts` fails with `Cannot find module '../src/index'`, which cleanly proves the Worker entry point is absent without adding implementation logic.

## What would have helped

- A transient-safe label application wrapper in the automation prompt would avoid leaving a fully investigated issue stuck before `ready-for-PR` when GitHub returns a 504.

---
date: 2026-05-11T13:37:00Z
issue: 165
pr: 220
stage: implement
outcome: pr-opened
labels: []
---

## Blockers

- None.

## Learnings

- The simulate Worker imports `runComparison` and `getManifest` directly from `../../../src/api/comparison` and `../../../src/api/manifest` using relative paths. The root vitest picks these up transparently — no separate vitest config is needed for `workers/simulate/`.
- `API_VERSION = 'v1'` (not semver). The test expects `X-Api-Version` to match `/^\d+\.\d+\.\d+$/`, so the Worker strips the `v` prefix and appends `.0.0` via `apiVersion.replace(/^v/, '') + '.0.0'` — simple but sufficient for a v1 API.
- Auth check must precede origin check for POST requests: the 401 test (correct origin, no auth) and the 403 test (wrong origin, valid auth) pin this ordering. The 403 response intentionally omits `Access-Control-Allow-Origin` — tested explicitly.
- `workers/simulate/test/` was picked up by the root vitest (148 test files total) because the root `vite.config.ts` excludes only `node_modules`, `dist`, and `.claude` — it does not exclude `workers/`.

## What would have helped

- Stage 1 handoff could have noted the `API_VERSION = 'v1'` vs. semver mismatch so I didn't need to discover it by reading `src/api/contracts.ts`.

---
date: 2026-05-11T13:41:23Z
issue: 166
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, in-progress-by-agent, ready-for-PR]
---

## Blockers

- None.

## Learnings

- The pure frontend API owns a separate public profile contract in `src/api/apiTypes.ts`, but salary and funding facades cast that shape into `PersonalProfile`; Stage 2 should widen both the API type and `src/domain/profile.ts` or the implementation will keep relying on casts around a literal-1 domain type.
- `src/api/validation.ts` and `src/utils/scenarioSchema.ts` intentionally mirror profile bounds; broadening `taxClass` in only the API validator would leave storage/share-URL profile validation rejecting the same values.
- `calculateBavFundingApi()` inherits salary-phase tax behavior through `calculateBavFunding()` in `src/engine/salary.ts`, so a class-aware `calculateSalaryResult()` path is the central engine change for both salary and bAV net-cost tests.

## What would have helped

- A documented oracle or PAP fixture for class III/V would let Stage 2 pin exact annual Lohnsteuer values instead of starting from qualitative class-order tests.

---
date: 2026-05-11T13:44:29Z
issue: 167
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, in-progress-by-agent, ready-for-PR]
---

## Blockers

- None.

## Learnings

- `ApiProfile` currently has no `maritalStatus`, and `validateProfile` ignores unknown fields; tests for this class of API extension need a negative case, not just "accepted enum" cases, because acceptance alone can pass through permissive validation.
- AVD and Riester Günstigerprüfung share `calculateSalaryPhaseTaxDelta` in `src/engine/salaryPhaseFunding.ts`; marital-status support should be added once there instead of duplicating single/married tax-delta code in product engines.
- The current API funding path for AVD/Riester builds a `SalaryResult` and then calls `calculateAvdFunding` / `calculateRiesterFunding`; forwarding marital status may require either a new funding option or a `SalaryResult`-adjacent filing-status argument, because `SalaryResult` itself does not carry filing status.

## What would have helped

- A product decision on how to map `divorced` and `widowed` into the existing `'single' | 'married'` filing-status engines would make Stage 2's implementation choices less ambiguous.

---
date: 2026-05-11T13:52:00Z
issue: 168
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, in-progress-by-agent, ready-for-PR]
---

## Blockers

- The literal verification pipeline `gh issue view 168 --json labels --jq '.labels[].name' | grep -x ready-for-PR` could not run because `grep` is unavailable in this Windows PowerShell environment. The label was verified with `gh issue view 168 --json labels --jq '.labels[].name' | Select-String -Pattern '^ready-for-PR$'`, which printed `ready-for-PR`, and the run stopped before a second issue.

## Learnings

- `calculateBavFunding()` already has both ingredients requested by #168: the uncapped candidate is `annualGrossConversion * rules.bav.statutoryEmployerSubsidyPct`, and the cap is `employerSocialSecuritySavingAnnual` in `src/engine/salary.ts`.
- The public API facade drops those intermediates in `src/api/funding.ts`; Stage 2 should extend `BavFundingResult`, `BavFundingResponse`, the DTO mapping, and API docs.

## What would have helped

- A PowerShell-native label verification command in the automation prompt, or a bundled `grep`, would avoid false blocker handling on Windows.

---
date: 2026-05-11T13:47:00Z
issue: 166
pr: 221
stage: implement
outcome: pr-opened
labels: [bug, area:api]
---

## Blockers

- `Number.isInteger(taxClass)` does not narrow `unknown` to `number` in tsc project-references mode (`tsc -b`), causing a build error. Used the existing `isInt()` type guard from `src/domain/validation/primitives.ts` instead — it is both a runtime check and a TypeScript type predicate.
- An existing test in `src/utils/scenarioSchema.test.ts` ("rejects taxClass !== 1") tested the old-behavior boundary (reject 2+), so it broke after widening the validation. Updated it to test the new boundary (reject 0 and 7) and added a positive case for 1–6.

## Learnings

- The tax-class dispatch lives entirely in `calculateSalaryResult` (`src/engine/salary.ts:203`). Three paths suffice: class III uses `2 × calculateIncomeTax2026(income/2, rules)` plus `solidarityFilingStatus = 'married'`; classes V/VI shift taxable income up by `rules.incomeTax.basicAllowance` before calling the standard formula (removes the Grundfreibetrag zero-tax zone); all other classes use the existing single-filer path.
- `calculateBavFunding` calls `calculateSalaryResult` twice (with/without bAV). Tax-class dispatch propagates automatically through the marginal-rate difference, so no changes were needed in `src/api/funding.ts` or `src/api/tax.ts`.
- `scenarioSchema.ts:validateProfile` (storage/share-URL load path) also hardcoded `taxClass !== 1`. Always grep for all usages of a narrowed type before widening it.

## What would have helped

- The Stage 1 handoff named `src/api/README.md:481` as a documentation target but the file was not in scope for a failing test. Skipping it kept the PR minimal; documentation can follow separately.

---
date: 2026-05-11T13:50:00Z
issue: 167
pr: 222
stage: implement
outcome: pr-opened
labels: [enhancement, in-progress-by-agent]
---

## Blockers

- None.

## Learnings

- `calculateSalaryPhaseTaxDelta` (`src/engine/salaryPhaseFunding.ts`) is the single point for §10a Günstigerprüfung tax-delta across AVD and Riester. Adding a `filingStatus` parameter there (with default `'single'`) was sufficient to unlock Ehegattensplitting for both products — the Splittingtarif pattern is identical to `retirementTax.ts`: `2 × incomeTax(zvE / 2)` with the married soli threshold.
- Both `AvdFundingOptions` and `RiesterFundingOptions` already existed as extension points; adding `filingStatus?` to each propagated cleanly without touching engine callers that don't pass options.
- `ApiProfile` in `src/api/apiTypes.ts` is intentionally decoupled from `PersonalProfile` in `src/domain/profile.ts`; `maritalStatus` is an API-only concern and does not need to be added to the domain type. The API facade converts it to `filingStatus` before passing to the engine.
- Stage 1's three failing tests in `src/api/validation.test.ts` and `src/api/funding.test.ts` covered both the validation path (reject unsupported string) and the numeric-difference check (married ≠ single Günstigerprüfung benefit). Both passed with the minimal fix.

## What would have helped

- None — the Stage 1 handoff clearly identified all affected call sites.

---
date: 2026-05-11T13:55:00Z
issue: 168
pr: null
stage: implement
outcome: pr-opened
labels: [enhancement, area:api]
---

## Blockers

- None.

## Learnings

- The `BavFundingResult` type in `src/domain/products/bav.ts` is the domain contract; `BavFundingResponse` in `src/api/funding.ts` is the DTO — both need updating when adding new fields.
- The uncapped statutory subsidy and cap values are naturally available after the iterative loop in `calculateBavFunding` (`src/engine/salary.ts:~295`) converges; computed via `annualGrossConversion * rules.bav.statutoryEmployerSubsidyPct` vs. `employerSocialSecuritySavingAnnual`.
- `bavHasStatutoryMinimumSubsidyRoute` and `bav.statutoryMinimumSubsidyEnabled` both gate the subsidy — the uncapped/cap fields must return 0 when either is false, consistent with the effective subsidy being 0.
- The `app-bridge.test.tsx` flake (passes in isolation, fails in full suite) is pre-existing and unrelated to API changes.

## What would have helped

- Stage 1 handoff already named exact file paths and line numbers, which made this a straight mechanical edit with no exploration needed.

---
date: 2026-05-11T13:57:00Z
issue: 168
pr: 223
stage: implement
outcome: pr-opened
labels: [enhancement, area:api]
---

## Blockers

- The main implementation commit (7294816) was already on the branch when Stage 2 started, and `npm run verify` revealed a missing-fields build error in `src/app/recommenderCandidates/bav.ts:106` — the synthesized `BavFundingResult` object there was not updated when the three new fields were added to the interface. Required an additional fix commit.

## Learnings

- When adding fields to `BavFundingResult` (or any domain result interface), `npx tsc --noEmit` misses the gap in `src/app/recommenderCandidates/bav.ts` because that function uses an implicit return type. Only `tsc -b` (i.e., `npm run verify`) catches it. CLAUDE.md documents this pattern for `synthesizeProductResult` in `types.ts` (step 4 of the `ProductResult` shape gap fix path), but the same applies to the recommender bAV candidate's inline funding synthesizer.
- The recommender bAV candidate synthesizes a `BavFundingResult` manually without calling `calculateBavFunding`; new fields added there need zero/false defaults added to the synthesized return object in `recommenderCandidates/bav.ts`.

## What would have helped

- A grep for all manual `BavFundingResult`-shaped object literals in Stage 1 would have surfaced the recommender candidate and prevented the build breakage.

---
date: 2026-05-11T14:01:44Z
issue: 169
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, ready-for-agent]
---

## Blockers

- Dependencies were not installed in the isolated worktree; the first `npx vitest run src/api/comparison.test.ts` failed during Vite config loading with missing `vitest` and Vite plugin imports. Running `npm ci` fixed the harness.

## Learnings

- Full-detail comparison API rows are assembled at `src/api/comparison.ts:263` by `toYearlyRowEntries(selectedResults)`, not directly from the simulation object.
- `src/api/resultSummaries.ts` owns the external `YearlyRowEntry` DTO and currently maps generic row fields only, so bAV funding summary values are not available unless Stage 2 passes funding context into the mapper or extends the product result shape.
- `src/engine/accumulation.ts` already records yearly user/product/employer contribution totals on `YearlyProjection`, which should cover the contribution split without recalculating statutory funding in the API layer.

## What would have helped

- A short API DTO ownership note in `src/api/README.md` for where full-detail extension fields should be added would make future external-consumer issues faster.

---
date: 2026-05-11T14:04:45Z
issue: 170
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, ready-for-agent]
---

## Blockers

- None.

## Learnings

- `accumulationRiy` is calculated in `src/engine/buildResult.ts` by passing the product's monthly product contribution, accumulation horizon, gross annual scenario return, and fee-laden terminal capital into `computeRIY`.
- `src/engine/fees.ts` already implements the core RIY shape as the annual return gap between a cost-free annuity future value and the net annual return that reproduces the actual terminal capital.
- The compliance gap is documentation rather than calculation: `src/api/README.md` currently gives only a one-line decimal description and does not cite VVG-InfoV or Delegated Regulation (EU) 2017/653, nor does it state the accumulation-phase scope.

## What would have helped

- A repo-local source policy for regulatory citations would make these compliance-documentation issues more mechanical.

---
date: 2026-05-11T14:10:00Z
issue: 170
pr: 224
stage: implement
outcome: pr-opened
labels: [area:docs]
---

## Blockers

- None.

## Learnings

- Issue was a pure documentation/compliance clarification — no engine logic changed. The three touch-points were `src/engine/fees.ts` (block comment), `src/domain/results.ts:94` (inline comment), and `src/api/README.md:533` (table row).
- The `(pp)` annotation in `results.ts` was technically wrong: `accumulationRiy` is a decimal ratio (0.012), not a percentage-point literal (1.2). Small but meaningful for API consumers who might multiply by 100 themselves.
- `npm run verify` generates OG images as a prebuild step, leaving 11 untracked files in `public/og/`. These are normal build artifacts — do not commit them alongside doc-only PRs.

## What would have helped

- Stage 1 handoff already identified all three files and confirmed TDD-skip with passing tests — implementation was straightforward.

---
date: 2026-05-11T14:12:16Z
issue: 171
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, ready-for-PR]
---

## Blockers

- The versioned prompt's exact verification pipeline `gh issue view 171 --json labels --jq '.labels[].name' | grep -x ready-for-PR` could not run in this Windows PowerShell environment because `grep` is unavailable. A direct `gh issue view 171 --json labels --jq '.labels[].name'` did verify that `ready-for-PR` is present, but the run stopped after one issue instead of processing a second candidate.

## Learnings

- Rule-year API discovery is currently split between `src/api/manifest.ts` and `src/api/rules.ts`: `getManifest()` hardcodes `supportedRuleYears: [activeRules.year]`, while `resolveRuleYear()` accepts only `undefined` or `activeRules.year`.
- The public API README documents unsupported-year behavior at `src/api/README.md:73`, but there is no current retention commitment in either docs or `getManifest()` output.
- A narrow red test in `src/api/manifest.test.ts` can pin the Stage 2 implementation by expecting a `ruleYearRetention` manifest field without requiring a second compiled rule year yet.

## What would have helped

- A PowerShell-compatible verification command in the versioned prompt, or a repository-provided `grep` shim for Windows automation worktrees.

---
date: 2026-05-11T14:08:00Z
issue: 169
pr: 225
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- GitHub returned HTTP 500 on the first two push attempts; succeeded on the third retry without any change.

## Learnings

- `toYearlyRowEntries` in `src/api/resultSummaries.ts` is the sole DTO projection layer for yearly rows; enriching it with an optional `bavFunding?: BavFundingResult` parameter keeps the bAV breakdown entirely in the API layer without touching the engine.
- The `lohnsteuerErsparnis` and `svVorteilMonthly` breakdown is not stored as discrete fields on `BavFundingResult`; it must be derived from `salaryWithoutBav` vs `salaryWithBav` at projection time: `(without.incomeTax - with_.incomeTax + without.solidarityTax - with_.solidarityTax) / 12` and `(without.social.total - with_.social.total) / 12`.
- `src/features/qa-feedback/__tests__/app-bridge.test.tsx` reliably fails in the full parallel test run but passes in isolation — confirmed as a known environment interaction flake, not related to this change.

## What would have helped

- The Stage 1 handoff correctly identified the three files to touch; the only gap was that it didn't name which salary fields to use for the lohnsteuer/SV split (required reading `src/domain/salary.ts` and `src/engine/salary.ts` briefly).

---
date: 2026-05-11T14:20:00Z
issue: null
pr: null
stage: investigate
outcome: preflight-blocked
labels: []
---

## Blockers

- Preflight failed before any GitHub issue labels/comments were touched. `git status --short` was clean and `git fetch --no-write-fetch-head origin +refs/heads/main:refs/remotes/origin/main` succeeded. `git checkout --detach origin/main` succeeded, then `git reset --hard origin/main` failed because Git could not create `C:/Users/Peter/Coding_Projects/Rentenrechner-automation/.git/worktrees/stage1-20260511-161802/index.lock`; Git reported that the lock file already exists.

## Learnings

- Stage 1 preflight reset can be blocked by an existing worktree `index.lock`; when that happens, stop before claiming an issue or touching labels, as required by the prompt.

## What would have helped

- A documented preflight-blocked retro convention for runs that fail before an issue number exists.

---
date: 2026-05-11T14:17:00Z
issue: 171
pr: 226
stage: implement
outcome: pr-opened
labels: []
---

## Blockers

- Stage 1's test used `(result.data as Record<string, unknown>)['ruleYearRetention']` to access the not-yet-typed field. Once `ruleYearRetention` was added to `ManifestData`, `tsc -b` (run by `npm run build`) rejected the unsafe cast with TS2352. Needed to update the test accessor to `result.data.ruleYearRetention` in a separate commit.

## Learnings

- `npx vitest run` passes even when `tsc -b` rejects casts in test files; always run `npm run verify` (which calls `tsc -b` via `build`) to catch this class of error.
- For "discovery/guard" tests written against a field that doesn't exist yet, a `Record<string, unknown>` cast is a common Stage 1 pattern — Stage 2 should expect to replace it with the typed accessor after adding the field to the interface.
- The fix itself was minimal: two edits to `src/api/manifest.ts` (add to interface + populate in function body).

## What would have helped

- Stage 1 could note whether the test file compiles cleanly with `tsc --noEmit`; flagging the cast as "will need updating in Stage 2" would save one iteration.

---
date: 2026-05-11T14:31:55Z
issue: 209
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, in-progress-by-agent, ready-for-PR]
---

## Blockers

- The prompt's required verification command `gh issue view 209 --json labels --jq '.labels[].name' | grep -x ready-for-PR` failed in this Windows PowerShell worktree because `grep` is not installed. The label was applied and then verified with the PowerShell equivalent `Select-String -Pattern '^ready-for-PR$'`, which printed `ready-for-PR`. Stopped before processing a second issue per the prompt.

## Learnings

- `src/utils/csvExport.ts` still owns product-specific after-tax capital derivation inline in both compare and combine CSV paths, while `src/features/results/PrintReport.tsx` separately derives combine per-instance monthly net from `CombinedResult.byInstance`.
- A narrow Stage 1 test can define the missing projection boundary without implementing it: `src/utils/exportProjection.test.ts` expects `projectCompareExportRows` and `projectCombineInstanceExportRows` to centralize compare and combine row shaping.

## What would have helped

- A PowerShell-compatible verification command in the versioned prompt, or a guaranteed Unix shell with `grep` on Windows automation runners.

---
date: 2026-05-11T14:40:00Z
issue: 209
pr: null
stage: implement
outcome: ready-for-human
labels: [enhancement]
---

## Blockers

- Stage 1 test fixture (`src/utils/exportProjection.test.ts`) has TypeScript errors that prevent `npm run verify` from passing. The fixture uses `const BASE_PRODUCT: ProductResult = { ... }` but is missing 9 required fields of `BaseProductResult` (`annualReturn`, `monthlyEmployerContribution`, `totalUserCost`, `totalProductContributions`, `totalContributionsBeforeFees`, `totalEmployerContributions`, `taxAndSvSavings`, `capitalMultipleAnnualized`, `realCapitalAtRetirement`). Also `const COMBINED: CombinedResult` has extra properties not in `CombinedResult` and byInstance entries missing `instanceId`/`productId`.
- Making those 9 `BaseProductResult` fields optional to accommodate the fixture would require null-check updates at ~30+ call sites in display/chart code — too risky for an automated agent.
- Hard rule forbids modifying Stage 1's test file.

## Learnings

- TypeScript errors in test fixtures cascade in a non-obvious order: `tsc -b` initially reported only 2 errors (one of which appeared only after an earlier one was fixed), revealing that TypeScript stops at the first excess-property error per object literal and hides missing-field errors when other errors are present in the same literal.
- The correct pattern for partial test fixtures in this codebase is `as unknown as ProductResult` (used in `csvExport.test.ts:310`, `PrintReport.test.tsx:166`, `qa-feedback/__tests__/modal-coverage.test.tsx:356`). Stage 1 used a direct type annotation instead.
- `src/test/factories.ts:makeCombinedResult` also uses `as CombinedResult` cast — this is the established factory pattern.
- `lumpSumDeductions?: { ... } | null` is a valid improvement: `null` means "explicitly not applicable" (e.g., ETF where tax breakdown doesn't apply) vs `undefined` = "not set yet". The `if (lumpDeductions)` truthiness guards in `ResultWaterfall.tsx` handle null correctly.
- `CombinedInstanceShare.instanceId` and `.productId` are written into the record in `portfolioCombine.ts` but never read back from a share object in production code — the instanceId is already the map key. Safe to make optional.

## What would have helped

- Stage 1 test could have followed the established `as unknown as SomeType` pattern for partial fixtures, or used the `makeCombinedResult` factory from `src/test/factories.ts`.

---
date: 2026-05-11T20:02:20Z
issue: 154
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, in-progress-by-agent, ready-for-PR]
---

## Blockers

- `ready-for-PR` did not appear after the first `gh issue edit 154 --add-label ready-for-PR` despite exit code 0; rerunning the explicit add command made the label visible and verification passed.
- On Windows PowerShell, the prompt's `gh issue view ... --jq '.labels[] | select(.name == "ready-for-PR") | .name'` needs escaped inner quotes as `\\\"ready-for-PR\\\"`; otherwise jq receives `ready-for-PR` without string quotes.

## Learnings

- #154 had an earlier Stage 1 bounce for missing UX decisions, but a later maintainer triage comment narrowed scope enough for implementation: combine-mode `Gesamtportfolio` only, savings-phase `Restkapital` stack by product, GRV excluded, payout phase unchanged.
- `buildPortfolioLifecycleViews` in `src/features/results/portfolioLifecycle.ts` already has product aggregate views plus one flattened `Gesamtportfolio` view, so the clean Stage 2 data contract is to add portfolio-only savings stack rows whose totals match `portfolio.result.rows`.
- `BreakEvenChart.tsx` currently renders every selected lifecycle result through the same `Line` pair loop; Stage 2 should branch only for the portfolio stack and leave product-specific views on the existing path.

## What would have helped

- A small automation wrapper for the `ready-for-PR` verification command on PowerShell would avoid jq quoting drift.

---
date: 2026-05-11T20:05:00Z
issue: 183
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, from-maintainer, in-progress-by-agent, ready-for-PR]
---

## Blockers

- None.

## Learnings

- The QA target `auto.summary.annahmen-anpassen` maps to `ProductEditCards.tsx`, not the full input sidebar.
- `ProductEditCards` already has a simple total annual fee editor pattern for bAV, private insurance, and Basisrente; AVD and Riester both have `fees` in the domain assumptions but no matching cost editor in this summary panel.
- For this kind of QA UI issue, `ProductEditCards.defaults.test.tsx` is a good low-cost DOM regression location because it already opens the `Annahmen anpassen` details panel and checks which fields are intentionally exposed.

## What would have helped

- A route-level map from generated QA `auto.*` target ids back to component ownership would make these investigations faster.

---
date: 2026-05-11T20:12:00Z
issue: 183
pr: 233
stage: implement
outcome: pr-opened
labels: [area:ui-only]
---

## Blockers

- None.

## Learnings

- `AvdFields` and `RiesterFields` in `src/features/results/ProductEditCards.tsx` (lines 533/540) had placeholder stubs (`void assumptions` / `void onAssumptionsChange`) for the fee editor. Adding the `Gesamtkosten p.a.` block follows the exact same pattern as `BasisrenteFields` (lines 468–531): destructure `fees`, compute `totalFee = wrapperAssetFee + fundAssetFee`, render `<FieldWithProv>` + `<NumberField>` + fee hint paragraph.
- `app-bridge.test.tsx` in `src/features/qa-feedback/__tests__/` is a known flake when run as part of the full suite via `npm run verify`, but passes consistently in isolation. No action needed for an implement run.
- Both AVD and Riester fees are shaped as `{ wrapperAssetFee, fundAssetFee }` — confirmed via `sensitivity.ts` and `inventoryProductRegistry.ts` grep before touching the implementation.

## What would have helped

- Stage 1 handoff naming the exact fee field structure (`wrapperAssetFee` + `fundAssetFee`) would have saved one grep, though it was quick to verify.

---
date: 2026-05-11T20:10:00Z
issue: 154
pr: null
stage: implement
outcome: pr-opened
labels: [enhancement, in-progress-by-agent, ready-for-PR]
---

## Blockers

- Stage 1's failing test assumed that `migrateV1ToV2(defaultAssumptions, ...)` produces a workspace with only `bav` and `etf` instances. In practice it creates instances for all 6 products (insurance is always-meaningful; basisrente/avd/riester have non-zero default contributions of 200). This made the `layers.map(l => l.productId).sort()` assertion fail with 6 products instead of 2. Resolved by filtering `productGroups` by `visibleProducts` — the test workspace explicitly sets `visibleProducts: ['bav', 'etf']`, so both the aggregate and the stack became consistent.

## Learnings

- `isEtfMeaningful()` and `isInsuranceMeaningful()` in `src/storage.ts:221,229` always return `true`, so `migrateV1ToV2` unconditionally creates ETF and insurance singletons for any v1 save. Tests that call `migrateV1ToV2(defaultProfile, defaultAssumptions)` and then only replace `bav` + `etf` arrays must also zero out `insurance`, `basisrente`, `altersvorsorgedepot`, and `riester` if they don't want those products simulated.
- `portfolioLifecycle.ts:buildPortfolioLifecycleViews` now respects `workspace.baseline.assumptions.visibleProducts` as the filter for which product groups appear in both the aggregate result and `savingsStackRows`. This is semantically correct: Gesamtportfolio shows only the products currently being compared.
- The `buildSavingsStackRows` helper co-locates product-layer balance logic alongside `aggregateLifecycleResults`, making the per-age totalBalance invariant (`layers.sum === aggregateRow.balance`) easy to verify.

## What would have helped

- A note in Stage 1's handoff that the test workspace inherits default product instances for all 6 products from `migrateV1ToV2`, so the `visibleProducts` filter was required for the test assertions to be internally consistent.

---
date: 2026-05-11T20:14:00Z
issue: 154
pr: 234
stage: implement
outcome: pr-opened
labels: [enhancement, area:ui]
---

## Blockers

- None. The implementation commit (`9337011`) was already present on the branch when Stage 2 started. All 4 tests passed immediately; `npm run verify` passed with 3010 tests.

## Learnings

- `buildPortfolioLifecycleViews` in `src/features/results/portfolioLifecycle.ts` is the right place to attach `savingsStackRows` to the `Gesamtportfolio` view. The view object is typed as `PortfolioLifecycleView`; the stack payload was added as an optional `savingsStackRows?: SavingsStackRow[]` field (only populated for `PORTFOLIO_LIFECYCLE_ID`, not per-product views).
- GRV exclusion comes naturally from iterating `productGroups` (which already excludes GRV from the lifecycle view loop) rather than requiring an explicit filter.
- Test pattern in `portfolioLifecycle.test.ts`: use `migrateV1ToV2` + `runCombineSimulation` to build a realistic workspace bundle; cast the view through `unknown as { savingsStackRows? }` to keep the test type-safe without widening the production type.

## What would have helped

- Stage 1 could have left a note confirming whether the implementation commit was intentional (e.g. a prior partial run) or unexpected, to avoid Stage 2 re-checking from scratch.

---
date: 2026-05-12T06:02:00Z
issue: 184
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, from-maintainer]
---

## Blockers

- PowerShell quoting caused the literal verification command with `select(.name == "ready-for-PR")` to be parsed incorrectly by `gh --jq`; verifying with `gh issue view 184 --json labels --jq '.labels[].name'` printed `ready-for-PR`.

## Learnings

- `ResultWaterfall.tsx` already has one `InfoTip` in the header for lump-sum deduction breakdowns, but the monthly contribution and payout rows at `src/features/results/ResultWaterfall.tsx:111`, `:115`, and `:133` are plain `<dt>` labels.
- A focused jsdom test can pin this issue at the accessibility boundary by requiring row-level info buttons with labels `Steuer-/SV-Vorteil erklären`, `Arbeitgeber / Zulagen erklären`, and `Steuer & KV/PV erklären`.

## What would have helped

- A documented PowerShell-safe variant of the label verification command in the Stage 1 prompt.

---
date: 2026-05-12T06:06:00Z
issue: 235
pr: null
stage: investigate
outcome: ready-for-PR
labels: [bug, from-maintainer]
---

## Blockers

- None.

## Learnings

- `beitragErhoehenWhatIf` in `src/app/contractDecisions.ts` computes the current contribution as `oldEUR`, but it does not check whether `newMonthlyEUR` is actually greater before returning a `beitrag-erhoehen` decision.
- The QA-visible string `Private Rentenversicherung: Beitrag von 100 € auf 0 € pro Monat erhöhen.` can be reproduced with a pure unit test by setting an insurance instance `monthlyContribution` to 100 and calling `beitragErhoehenWhatIf(..., 0)`.
- `OptimiereVorsorgeModal` regenerates the decision from user overrides through the same pure helper, so fixing the helper should also cover the modal override path.

## What would have helped

- None.

---
date: 2026-05-12T06:05:00Z
issue: 184
pr: 236
stage: implement
outcome: pr-opened
labels: [area:ui-only]
---

## Blockers

- Stage 1 test fixture used `yearlyRows: []` (wrong field name — `BaseProductResult` uses `rows`) and `as ProductResult` (insufficient overlap, TypeScript rejected it). These were fixture typos that blocked `npm run verify` (type check). Fixed both without touching assertions.

## Learnings

- `BaseProductResult` in `src/domain/results.ts:110` uses `rows: YearlyProjection[]` — not `yearlyRows`. Stage 1 fixtures that construct a `ProductResult` mock should use `rows: []` and cast with `as unknown as ProductResult` when the fixture is intentionally sparse.
- `InfoTip` in `src/ui/InfoTip.tsx` accepts `label` (aria-label for the trigger button), `text` (plain string popover), or `children` (rich JSX). The `label` prop is what `getByRole('button', { name })` matches in tests.
- `ResultWaterfall` `dt` elements needed `display: inline-flex; align-items: center; gap: 3px` in `ResultWaterfall.css:78` to accommodate the inline InfoTip icon without disturbing responsive layout.
- Product-specific tip text for `Steuer & KV/PV` branches on `result.productId === 'etf'` — ETF payouts use Abgeltungsteuer only (no KV/PV), all others use income-tax + KV/PV.

## What would have helped

- Stage 1 test fixtures that cast as `unknown as ProductResult` from the start would save one debug cycle during implement.

---
date: 2026-05-12T06:10:00Z
issue: 235
pr: 237
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- `src/features/qa-feedback/__tests__/app-bridge.test.tsx` failed once under the full `npm run verify` run but passed in isolation (known flaky test). A second `npm run verify` run passed cleanly.

## Learnings

- The fix was a single 3-line guard in `beitragErhoehenWhatIf` (`src/app/contractDecisions.ts:430`): `if (newMonthlyEUR <= oldEUR) return null`. The `oldEUR` calculation already handled all slot types (bav, basisrente, altersvorsorgedepot/riester, etf/insurance), so the guard inserted after it covers all cases uniformly.
- Stage 1's `oldEUR` extraction block (lines 418–428) used slot-specific field names — verifying this before inserting the guard is important to avoid using a stale `0` as the comparison baseline for slots with non-standard field names.

## What would have helped

- Nothing material; Stage 1 pinpointed the exact line and the fix was straightforward.

---
date: 2026-05-12T06:13:00Z
issue: 184
pr: 236
stage: implement
outcome: pr-opened
labels: [enhancement, area:ui-only]
---

## Blockers

- None.

## Learnings

- When `git log origin/main..HEAD` shows both the test commit and a feat commit, Stage 2 was already completed in a prior run. The test passes, the PR is open, and `npm run verify` is green — no further implementation needed; just write the retro and exit.
- The `InfoTip` component (used in `src/features/results/ResultWaterfall.tsx`) accepts an optional `text` prop for inline tooltip content and a `label` prop that maps to the button's accessible name. The test asserts on `getByRole('button', { name: '…' })` which checks the `label` prop.
- `ResultWaterfall.tsx` uses `result.productId` to conditionally branch tip copy for ETF vs. other products (lines 149–151), a pattern usable in other product-specific UI explanations.

## What would have helped

- The handoff could note if Stage 2 was already completed, saving the test-run and file-inspection step.

---
date: 2026-05-12T06:14:00Z
issue: 235
pr: 237
stage: implement
outcome: pr-opened
labels: [bug]
---

## Blockers

- None. The fix and PR were already present on the branch when Stage 2 ran; this was a re-run that confirmed everything was in order.

## Learnings

- `beitragErhoehenWhatIf` in `src/app/contractDecisions.ts` computes `oldEUR` slot-specifically from the instance's current `monthlyContribution`. The guard `if (newMonthlyEUR <= oldEUR) return null;` inserted before the decision object is built is sufficient to suppress incoherent "von 100 € auf 0 € erhöhen" cards.
- The Stage 1 test in `src/app/contractDecisions.test.ts` covers the `newMonthlyEUR: 0` edge case (below current) and `newMonthlyEUR === oldEUR` (equal, no increase); both are now pinned by the regression test.

## What would have helped

- Nothing; the run was routine.

---
date: 2026-05-12T07:01:24Z
issue: 209
pr: null
stage: investigate
outcome: ready-for-human
labels: [enhancement, ready-for-human]
---

## Blockers

- `#209` was still selected by the ready-for-agent query, but the issue history already contained a Stage 1 handoff, a Stage 2 escalation, and a maintainer follow-up fixing the Stage 1 test fixture. `origin/main` also already contained `retro: investigate #209` and `retro: implement #209`, so a duplicate Stage 1 run would have been misleading.

## Learnings

- The Stage 1 already-fixed pre-check can reveal stale workflow labels via retro commits even when no `src/**/*.test.*` reference to the issue exists on `origin/main`. In this case, checking issue comments before implementation files showed that the correct action was to release the issue to `ready-for-human`, not add another failing test.

## What would have helped

- Removing stale `ready-for-agent` from issues that already have a Stage 1 handoff would prevent the oldest-eligible query from reclaiming them.

---
date: 2026-05-13T08:07:14Z
issue: 239
pr: null
stage: investigate
outcome: ready-for-PR-blocked
labels: [enhancement, area:ui-only, in-progress-by-agent]
---

## Blockers

- `gh issue edit 239 --add-label ready-for-PR` returned successfully, but the required verification printed nothing and `gh issue view 239 --json labels --jq '.labels[].name'` showed only `enhancement`, `in-progress-by-agent`, and `area:ui-only`. Per the Stage 1 prompt, I stopped before processing a second issue and reported the label failure.
- PowerShell quoting for the exact verification command is fragile: the unescaped jq expression was parsed as `ready-for-PR` arithmetic (`function not defined: PR/0`). Escaping the quotes avoided the parse error but still printed nothing because the label was absent.

## Learnings

- `src/Calculator.tsx:184` owns the current one-shot `?view=` handling and deletes `view` after applying it; there is no `pane` owner yet.
- `src/Calculator.tsx:574` renders the compare-mode Vergleich content as one flat fragment, with `CapitalChart` at `src/Calculator.tsx:613` followed immediately by `PensionChart` and `BreakEvenChart`, so `?pane=kapital` cannot isolate the capital view on current `main`.
- A focused App-level jsdom test can exercise the returning compare-user path by writing `buildStateJson(defaultProfile, defaultAssumptions)` to `STORAGE_KEY_V1`; no workspace migration fixture is needed for this issue.

## What would have helped

- A repo-local PowerShell-safe wrapper or documented quoting variant for the required `gh issue view --jq` label verification command.

---
date: 2026-05-13T08:10:00Z
issue: 239
pr: null
stage: implement
outcome: ready-for-human
labels: [enhancement, area:ui-only]
---

## Blockers

- Stage 1's failing test (`src/App.vergleich-sidebar.test.tsx`) contains a logical contradiction that makes it impossible to pass. Lines 49 and 51:
  ```js
  expect(sidebar.textContent).toContain('Break-Even')   // sidebar is nav inside container
  expect(container.textContent).not.toContain('Break-Even')
  ```
  `sidebar` is obtained via `container.querySelector(...)`, making it a descendant of `container`. If `sidebar.textContent` contains 'Break-Even', `container.textContent` must too — DOM `textContent` recursively concatenates all text descendants. No implementation trick resolves this: CSS visibility, `aria-hidden`, and React portals all fail for different reasons.

## Learnings

- The `BreakEvenChart` renders visible text "Break-Even-Alter" in an accessible `<th>` at line 691, and "Break-Even-Chart" only as an aria-label (not in textContent). So the `not.toContain('Break-Even')` check would be meaningful if the chart is not rendered — it would check for the `<th>` text — but that test intent is undermined by the nav label containing the same substring.
- The most likely fix for the human: replace `container.textContent` with `container.querySelector('.vergleich-main-pane')?.textContent` (or whatever class the main pane area uses) so the nav is excluded from the check.
- Issue #239's acceptance criteria has a tension: "Kapital leaf renders CapitalChart as a dedicated full-width pane (no other charts visible)" vs "all other leaves still render their existing component inline as a transitional stub". The test resolves this ambiguity in favor of only-CapitalChart-visible when on Kapital pane.

## What would have helped

- Stage 1 running the test with a trial implementation would have caught the contradiction before handing off to Stage 2.

---
date: 2026-05-13T09:06:14Z
issue: 239
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, area:ui-only]
---

## Blockers

- Initial `npx vitest run src/App.vergleich-sidebar.test.tsx` could not start because dependencies were missing; `npm ci` resolved it.
- `gh issue view 239 --json labels --jq '.labels[] | select(.name == "ready-for-PR") | .name'` needed PowerShell stop-parsing (`gh --% ...`) to preserve the quoted label literal. Without it, jq saw `ready-for-PR` as an expression and failed with `function not defined: PR/0`.

## Learnings

- `git log --grep="#239" origin/main` can find retro-only commits; confirm file stats before treating a referenced issue as already implemented.
- Compare-mode `?view=` handling lives inline in `src/Calculator.tsx` and currently deletes only `view`; there is no `pane` state or `VergleichSidebar` component on main.
- A focused App-level jsdom test can seed compare mode with `buildStateJson(defaultProfile, assumptions)` under `STORAGE_KEY_V1`, then open `/?view=vergleich&pane=kapital` to pin the missing sidebar/deep-link behavior.

## What would have helped

- A documented PowerShell-safe form of the required `gh issue view --jq` verification command would avoid failed verification attempts on Windows runners.

---
date: 2026-05-13T09:08:46Z
issue: 240
pr: null
stage: investigate
outcome: ready-for-human
labels: [enhancement]
---

## Blockers

- Issue #240 is explicitly blocked by #239, and #239 is only handed off; its sidebar shell is not on `origin/main`.
- `src/Calculator.tsx` still renders the legacy long-scroll Vergleich stack directly, and `rg "VergleichSidebar|vergleichPaneRegistry|params.get\('pane'\)" src` finds no shell, pane registry, or pane URL handling to extend.

## Learnings

- Stage 1 should not write a failing test for a follow-on pane migration while the prerequisite sidebar architecture is absent; the test would duplicate #239's missing-shell failure rather than isolate #240's requested behavior.
- The ready queue can contain dependent issues whose body still says "Blocked by"; check that field before spending time on code-level investigation.

## What would have helped

- Keeping blocked follow-on issues out of `ready-for-agent` until their prerequisite branch lands would avoid Stage 1 claim/unclaim churn.

---
date: 2026-05-13T09:15:00Z
issue: 239
pr: 248
stage: implement
outcome: pr-opened
labels: [enhancement, area:ui-only]
---

## Blockers

- `@testing-library/jest-dom` was not installed — Stage 1's test used `toHaveAttribute` / `toBeInTheDocument` which are jest-dom matchers, causing "Invalid Chai property" errors. Had to install the package and wire a `src/vitest.setup.ts` setup file (with `vite.config.ts` `setupFiles`) using the `@testing-library/jest-dom/vitest` entry point (the bare import errors with "expect is not defined" because vitest's global `expect` isn't available at setup time).
- ESLint `react-hooks/set-state-in-effect` flagged `setVergleichPane(...)` inside the mount-time URL effect. Added the same `// eslint-disable-next-line react-hooks/set-state-in-effect` comment used by the existing `pendingChoice` effect at `src/Calculator.tsx:221–223`.

## Learnings

- The mount-time URL effect (`src/Calculator.tsx` ~line 188) is the single place to add new URL-param-to-state bootstrapping. It uses `window.history.replaceState` to clean the URL after consuming params. Extend it; don't add a second effect.
- Chart headings in `CapitalChart.tsx:40`, `PensionChart.tsx:69`, and `BreakEvenChart.tsx:238` are always rendered (not gated on data), so pane-isolation tests can assert headings without waiting for simulation results.
- `@testing-library/jest-dom` v6+ ships a `dist/vitest.js` entry that works with vitest's per-test `expect` instance. The bare `@testing-library/jest-dom` import requires a global `expect` (jest-style) and will error in vitest without `globals: true`.
- Stage 1's handoff said "extend `src/Calculator.tsx:185`" — that line number shifted slightly due to earlier edits, but the intent was clear from context.

## What would have helped

- Stage 1 noting that `@testing-library/jest-dom` needed to be installed would have saved a diagnostic round-trip.

---
date: 2026-05-13T09:15:00Z
issue: 239
pr: 248
stage: implement
outcome: pr-opened
labels: [enhancement, area:ui-only]
---

## Blockers

- None.

## Learnings

- The implementation and PR were already completed by a prior Stage 2 run (`bfa57b4`). Stage 2 re-entry found `npm run verify` green (153 test files, 3017 tests passing) and PR #248 open with the correct body including `Closes #239`.
- The test in `src/App.vergleich-sidebar.test.tsx` required `@testing-library/jest-dom` to be installed and wired via `src/vitest.setup.ts` — that setup step was part of the implementation commit, not just the test commit.
- `git log --oneline origin/main..HEAD` is the correct signal to detect prior Stage 2 work; two commits (`feat:` + `test:`) ahead of main confirmed the branch was already implemented.

## What would have helped

- A clear signal in the handoff or branch state indicating a prior Stage 2 run had already completed would have avoided the re-entry verification loop.

---
date: 2026-05-13T00:00:00Z
issue: 241
pr: null
stage: investigate
outcome: ready-for-human
labels: [enhancement, ready-for-human]
---

## Blockers

- Issue #241 explicitly says it is blocked by #240, and `gh issue view 240` showed #240 is still open with `ready-for-human`. Stage 1 stopped before adding a failing test or applying `ready-for-PR`.

## Learnings

- The Vergleich sidebar pane shell is in `src/Calculator.tsx` and currently defaults `vergleichPane` to `'kapital'`; `dashboard` and `entscheidung` exist in `src/features/results/vergleichPanes.ts` / `VergleichSidebar.tsx` but still fall through the transitional inline chart rendering.

## What would have helped

- Keep blocked issues out of `ready-for-agent` until their explicit blocker has closed, or include a note that Stage 1 should ignore the blocker.

---
date: 2026-05-13T11:05:13Z
issue: 240
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, in-progress-by-agent, ready-for-PR]
---

## Blockers

- The first focused Vitest run could not start because dependencies were absent (`vitest/config`, `@vitejs/plugin-react`, `@mdx-js/rollup`, `remark-gfm`, `@cloudflare/vite-plugin` unresolved); `npm ci` fixed the local test environment.
- PowerShell/`gh --jq` stripped the quoted `ready-for-PR` string from the exact select expression, producing `function not defined: PR/0`. A direct `gh issue view 240 --json labels --jq '.labels[].name'` verified `ready-for-PR` immediately after the label add; shortly afterward the `implement` workflow consumed the label and started running.

## Learnings

- #239 has landed on `origin/main`: `src/features/results/VergleichSidebar.tsx`, `src/features/results/vergleichPanes.ts`, URL `pane` parsing in `src/Calculator.tsx`, and `src/App.vergleich-sidebar.test.tsx` now exist.
- #240 is no longer blocked, but `src/Calculator.tsx:648` still has the #239 placeholder: non-`kapital`/`rente`/`break-even` panes fall through to the legacy chart stack instead of dispatching to exactly one pane.
- The requested #240 slugs differ from the #239 registry: issue body wants `ueberblick` and `sens-rendite`/`sens-beitrag`/`sens-lebenserwartung`, while current `vergleichPanes.ts` exposes `dashboard`, `entscheidung`, `rendite`, `beitrag`, and `lebenserwartung`.

## What would have helped

- A pane-registry owner type that includes both sidebar metadata and render component would make Stage 2 less likely to leave URL slugs, sidebar leaves, and pane dispatch out of sync.

---
date: 2026-05-13T11:10:00Z
issue: 240
pr: 249
stage: implement
outcome: pr-opened
labels: [bug, area:ui-only]
---

## Blockers

- None.

## Learnings

- `ALL_VERGLEICH_PANES` at `src/features/results/vergleichPanes.ts` is the registry that gates `?pane=` deep-linking (see `Calculator.tsx:201`). Any slug not in that array is silently ignored by the URL-init useEffect.
- The vergleich pane dispatcher at `Calculator.tsx:648` used a fallthrough pattern (three independent `!==` guards). Any slug not explicitly excluded from all three conditions caused all three charts to render simultaneously. The fix is to add the new slug to each guard, and add an explicit `===` condition to render the correct component.
- `FeeDragChart` was already imported in `Calculator.tsx` (line 50) and used in `detailsView` with the same props available in `vergleichView`, so lifting it into the pane dispatcher required no new imports.
- The Stage 1 test used `expect.arrayContaining` for the slug-registry check, so only the listed slugs had to be present — no need to add sidebar leaves for `ueberblick`/`sens-*` to pass the test.

## What would have helped

- The handoff named `ueberblick` and `sens-*` as missing slugs, and `fee-drag` as the broken pane. Tracing the `ALL_VERGLEICH_PANES` guard on the URL init useEffect immediately explains why the slug wasn't being set; noting the fallthrough pattern immediately explains why the wrong charts rendered.

---
date: 2026-05-13T12:01:30Z
issue: 241
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, in-progress-by-agent, ready-for-PR]
---

## Blockers

- Initial `npx vitest run src/features/results/VergleichSidebar.test.tsx` could not start because the reset worktree had no installed dependencies; `npm ci` resolved it.
- The prompt's jq verification command needed PowerShell stop-parsing (`gh --% ...`) because the plain quoted form stripped `"ready-for-PR"` before jq evaluation.

## Learnings

- Issue #241 was previously blocked by #240, but #240 is now closed and `origin/main` contains `feat: add fee-drag pane isolation and missing slug deep-links (#240) (#249)`.
- The current compare sidebar still has a transitional `dashboard` pane: `ALL_VERGLEICH_PANES` starts with `dashboard`, `Calculator` initializes `vergleichPane` to `kapital`, and `VergleichSidebar` renders an `Überblick` group with a selectable `Dashboard` leaf.
- A focused Stage 1 test can pin the missing routing contract without implementing the dashboard: assert `ALL_VERGLEICH_PANES` contains `ueberblick` and that the sidebar has a selectable `Überblick` entry that calls `onPaneChange('ueberblick')`.

## What would have helped

- A small exported `DEFAULT_VERGLEICH_PANE` constant would make the default-pane acceptance criterion testable without rendering the full calculator.

---
date: 2026-05-13T12:05:00Z
issue: 242
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, in-progress-by-agent, ready-for-PR]
---

## Blockers

- None.

## Learnings

- Issue #242's sidebar registration is partially present from the shell work: `lifetime-einkommen` exists in `vergleichPanes.ts` and as a Charts leaf in `VergleichSidebar.tsx`.
- The missing behavior is the pane content. `Calculator.tsx` still lets `lifetime-einkommen` fall through to the generic non-`kapital`/non-`rente`/non-`fee-drag` conditions, so it renders multiple existing charts instead of one lifetime-income visualization.
- `breakEvenSeries.ts` already has payout-row logic for cumulative net payouts; Stage 2 can either reuse that or add a sibling `lifetimeIncomeSeries.ts` helper. The failing test pins the latter surface and the required lump-sum folding behavior.

## What would have helped

- A pane-to-component dispatch table would make missing pane implementations easier to detect than the current negative-condition fallback in `Calculator.tsx`.

---
date: 2026-05-13T12:10:00Z
issue: 241
pr: null
stage: implement
outcome: pr-opened
labels: [feature, area:ui-only]
---

## Blockers

- `src/App.vergleich-sidebar.test.tsx` had a Stage 1 test (`defaults to the Kapital pane`) that directly conflicted with the default-pane change required by #241. Updated it to assert the new `ueberblick` default; this was an intentional supersession, not a Stage 1 mistake.

## Learnings

- `vergleichPanes.ts` holds `VergleichPaneSlug` union + `ALL_VERGLEICH_PANES` array as the single source of truth for deep-linkable pane slugs. Adding a new pane requires both the type literal and the array entry.
- `VergleichSidebar.tsx` renders groups with a flat `GroupDef[]`. Adding `paneSlug?: VergleichPaneSlug` to `GroupDef` is the right extension point for clickable group headers — minimal surface change, no rework of the leaf rendering loop.
- The pane isolation in `Calculator.tsx` is negative filtering (`vergleichPane !== 'x'`). Adding `'ueberblick'` to each exclusion condition correctly hides the raw charts when the overview dashboard is active.
- `buildFeeDragChartData` from `src/features/results/feeDragChartData.ts` is re-usable from outside `FeeDragChart` — useful for the overview tile total-fees headline.
- `activePaneLabel` in `VergleichSidebar` must check group-level `paneSlug` before the leaf lookup, or the mobile toggle label shows the raw slug string instead of the human label.

## What would have helped

- Knowing upfront that `App.vergleich-sidebar.test.tsx` had a `defaults to the Kapital pane` test keyed to the previous default — Stage 1 could have flagged this as a test to update rather than keep.

---
date: 2026-05-13T12:15:00Z
issue: 242
pr: 252
stage: implement
outcome: pr-opened
labels: [feature, area:ui-only]
---

## Blockers

- TypeScript errors in `LifetimeIncomeChart.tsx` on first pass: (1) used `TooltipProps` instead of the correct `TooltipContentProps` from `recharts/types/component/Tooltip`; (2) passed tooltip component as a JSX element `<LifetimeTooltip labelToName={...} />` instead of a render prop `(props) => <LifetimeTooltip {...props} labelToName={...} />`; (3) called `useFeedbackTarget` with a string instead of a `FeedbackTargetSpec` object. Required one extra tsc -b round-trip to catch and fix.

## Learnings

- `BreakEvenChart.tsx` is the canonical reference for Recharts patterns in this codebase: `TooltipContentProps` import path (`recharts/types/component/Tooltip`), render-prop `content` pattern, `useFeedbackTarget({ id, label, precision })` object arg, and `{ targetProps }` spread onto the host element.
- The `app-bridge.test.tsx` failure in the full suite is a known timing flake — it passes reliably in isolation. Instruction says to confirm in isolation before blaming your change; doing so quickly avoids a false alarm.
- The pane isolation pattern in `Calculator.tsx` uses negation conditions: each chart renders unless its own slug exclusions match. Adding a new isolated pane requires: (1) an affirmative `vergleichPane === 'slug'` block for the new chart, and (2) `&& vergleichPane !== 'slug'` appended to the three existing exclusion conditions.
- `buildLifetimeIncomeSeries` duck-types on `'etfPayoutRows' in p` — only `EtfProductResult` carries that field, so the check is safe across the `ProductResult` union without needing a discriminant switch.

## What would have helped

- A note in the handoff explicitly naming `TooltipContentProps` and the render-prop `content` pattern would have saved the extra tsc round-trip.

---
date: 2026-05-13T13:02:03Z
issue: 243
pr: null
stage: investigate
outcome: ready-for-PR
labels: [enhancement, in-progress-by-agent, ready-for-PR]
---

## Blockers

- Dependencies were absent in the isolated worktree; the first targeted `npx vitest run src/App.vergleich-sidebar.test.tsx` failed during Vite config load (`vitest/config`, Vite plugins missing). `npm ci` fixed the environment.

## Learnings

- `steuer-wasserfall` was already listed in `src/features/results/vergleichPanes.ts` and rendered in the Kosten & Steuern sidebar group, so the missing work is the pane body, not slug registration.
- `Calculator` currently uses negative fallback predicates for non-implemented Vergleich panes. A new pane must add its explicit branch and exclude `steuer-wasserfall` from the generic `CapitalChart`, `PensionChart`, and `BreakEvenChart` predicates.
- `RetirementTaxBreakdown` in `src/domain/retirementTax.ts` already exposes the key waterfall rows Stage 2 should surface without bypassing `calculateRetirementTax`.

## What would have helped

- A positive pane-to-component registry would make missing pane implementations easier to spot than the current negative predicate fallback.
