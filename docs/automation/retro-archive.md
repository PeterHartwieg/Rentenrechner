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
