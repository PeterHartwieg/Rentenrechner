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
