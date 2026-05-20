# Redesign Handoff — PR 9 onwards

> **Status:** Handoff prompt for a fresh session.
> **Last updated:** 2026-05-20.
> **Previous session landed:**
> - PR 8 — Kapital & Auszahlungen at squash commit `3addbb9`, merged via #287 (**3 review rounds R0–R2**, ~30 min elapsed). Both Codex and CodeRabbit returned 0 findings on the final commit `29f75bf`.
>
> **Next up:** PR 9 — **Vergleich** (per plan §6). 6-product comparison table redesign + pro/contra row + scenario toolbar fold-in. This is the LARGEST single-PR scope in the redesign sequence: it replaces the entire compare-mode results pane and finishes the `MeinPlanSidebar` / `meinPlanPanes.ts` deletion that PR 6 only started. Estimated ~6 days incl. mobile.

---

## Paste this as the new session's orchestrator prompt

```
You are orchestrating PR 9 of a multi-PR UI redesign for the Rentenrechner
repo (German retirement calculator, public name "RentenWiki.de"). Working
dir is C:\Users\Peter\Coding_Projects\Rentenrechner.

## Sources of truth (read these before doing anything)

1. **docs/redesign/implementation-plan.md** — binding plan for the whole
   redesign. PR 9 spec is in §6 ("Vergleich"). §8 risk #9 (Recharts
   mobile tuning) is partially addressed by PR 8's `useChartDensity`
   hook — extend its adoption to `FeeDragChart` / `MonteCarloPanel`
   if PR 9 reaches either.
2. **docs/redesign/handoff-pr9-onwards.md** — this file. Documents
   conventions and pitfalls established by PR 0–8 + PR 283 + PR 286 +
   PR 287.
3. **docs/redesign/handoff-pr8-onwards.md** — still authoritative for
   the conventions that did not change in PR 8; this new file carries
   only the deltas. Chain back through it for anything earlier (the PR 7
   conventions chain through it).
4. **.scratch/redesign-handoff-v2/rentenrechner/project/direction-d.jsx**
   — Vergleich artboard (Direction D, sober). Sober D, same chrome as
   Mein Plan / Vertrag-Detail / Kapital. Grep `Vergleich` or `compare`.
5. **.scratch/redesign-handoff-v2/rentenrechner/project/responsive-views.jsx**
   — `MVergleich` (phone) and `TVergleich` (tablet) variants. The
   6-product table breaks into vertical product cards on phone.
6. **CLAUDE.md** — project guide. The "Review guidelines" P0/P1 ladder
   binds every PR. PR 9 touches compare-mode chart panes (FeeDragChart,
   MonteCarloPanel, CapitalChart, PensionChart) and the Vergleich
   pane-dispatcher in Calculator.tsx; the "UI chart conventions" block
   AND the "Vergleich pane dispatcher" block under "UI chart
   conventions" are both binding. **Don't miss the three-step
   pane-add invariant** (slug literal + ALL_VERGLEICH_PANES + three
   `&& vergleichPane !== '<slug>'` negative-exclusion lines).
7. **CONTEXT.md** — domain glossary. Vergleich surfaces compare-mode
   results across 6 products: ETF, bAV, pAV, AVD, Riester, Basisrente.
   `PRODUCT_REGISTRY` is the only iteration source — never hardcode.

## What's already shipped (do not redo)

Carry-forward from PR 8 handoff still applies — every chrome primitive,
Sober D route (Methode / Angaben / Mein Plan / Vertrag-Detail /
**Kapital & Auszahlungen at /kapital**), and Editorial A route
(landing / Artikel hub) is live. Plus PR 8 specifics:

- **`/kapital` route** — `KapitalPage` in `src/features/kapital/`.
  Full-page lifecycle chart + Wendepunkte table. Dual-source (compare
  AND combine modes). Page-level filter chips drive a single-select
  view of either `Gesamtportfolio` (combine) or `Alle Produkte`
  (compare, aggregated via `aggregateLifecycleResults`).
- **`useChartDensity` hook** at `src/ui/charts/useChartDensity.ts` —
  width-based tier classifier returning Recharts-friendly tokens
  (axisLabelsVisible, calloutLabelsVisible, yAxisWidth, margins,
  axisLabelFontSize, calloutLabelFontSize, tooltipFontSize). Thresholds:
  `phoneChartMaxPx = 480` / `tabletChartMaxPx = 800`. `BreakEvenChart`
  is the first adopter; **PR 9 should migrate `FeeDragChart` and
  `MonteCarloPanel` to this hook** if either survives the redesign
  cut (per plan §4 default, MonteCarlo moves to Methode and FeeDrag
  to Vertrag-Detail — but the hook lives there too).
- **`BreakEvenChart` has `showPicker={false}` prop** — suppresses the
  internal product picker chip row. Use this when a page-level filter
  is the single selection authority. When `showPicker={false}`, the
  chart renders every entry in `selectedResults` (does not apply the
  `effectivePicked` filter).
- **`aggregateLifecycleResults`** now exported from
  `src/features/results/portfolioLifecycle.ts`. Aggregates a
  `ProductResult[]` into a single portfolio-shaped
  `LifecycleSeriesResult`. Use it whenever the chart benchmark line
  needs to represent a sum across products instead of a single
  product's paid-in.
- **`ROUTES.kapital`** + `kind: 'kapital'` Route variant.
  `chromeRoutes.ts` lights the home tab for both `/vertrag/:id` and
  `/kapital` (drill-ins from Mein Plan).
- **MeinPlanPage headline aside** has a `Kapital im Verlauf →` link.
  SPA-progressive-enhancement pattern: real href via
  `routeToPath(ROUTES.kapital)`, intercept click only when navigate +
  shouldUseSpaNavigation guard.

## Conventions established by PR 1-8 + PR 283 + PR 286 + PR 287 — follow these

Carry forward from PR 8 handoff still applies (SPA-navigation guards,
navigate threading, JSON-LD in head only, fail-fast resolvers, slugify
helper, post-hydration scroll-to-hash, jsdom + `inShell()` helper, no
PowerShell for file rewriting, viewport tests, brand discipline, German
typography, statutory values in `src/rules/`, `gh pr merge` worktree
gotcha, sweep numeric literals before opening the PR, stable anchor IDs,
paragraph-citation doc-comments on new `legalConstants.ts` entries,
`<NumberField>` for engine-bound numeric inputs, exhaustive switches
with `const _: never = …` default, paired label/sublabel switch audits,
registry-driven product iteration via `buildProductSlots`,
`Array.isArray` guard before casting dynamic workspace fields, ETF
status differentiation in UI copy, `routeToPath(ROUTES.x)` for every
href, doc-title `useEffect` for non-publicRouteRegistry routes,
URI-decode segments inside try/catch, non-finite number guards before
writing engine state, `workspace.mode` for mode gating not
`detectSavedMode()`, EmptyState pattern with `ctaTarget: Route`,
page-level data hooks + prop-drive children, `'basis' ?? first`
scenario picker). Read the PR 8 handoff if any are unfamiliar.

NEW conventions hardened in PR 287 (PR 8):

- **Filter-chip ARIA semantics use button-group, not tabs.** Single-
  select toggle chips render with `role="group"` on the container +
  `aria-pressed` on each button. Do NOT use `role="tablist"` /
  `role="tab"` / `aria-selected` — the tab pattern requires arrow-key
  handling + tabpanels + roving tabindex, which a filter chip row
  doesn't implement. CodeRabbit flagged this as Major in PR 287 R1.
  Applies to the Vergleich pro/contra row and the scenario-toolbar
  rendite picker.

- **44 px tap target floor at every viewport, not just phone.** PR 287
  R1 bumped chip min-height to 44 px on desktop too. The plan's §4
  default is "Tap targets: 44×44 px minimum at phone breakpoint", but
  CodeRabbit reads stricter and the cost of meeting it everywhere is
  low. Adjust padding to keep the visual ratio.

- **`font-family-name-quotes` stylelint rule.** Single-word font family
  names (`Newsreader`) must be unquoted: `font-family: Newsreader,
  Georgia, serif;`. Multi-word names must use double quotes:
  `font-family: "IBM Plex Sans", system-ui, sans-serif;`. Single
  quotes around either fail lint.

- **camelCase for exported constants in JS/TS modules.** CodeRabbit
  flagged `PHONE_CHART_MAX_PX` / `TABLET_CHART_MAX_PX` as violations of
  the project camelCase rule and they were renamed to
  `phoneChartMaxPx` / `tabletChartMaxPx`. (The codebase has historical
  UPPER_SNAKE_CASE module-scope constants like `LIFECYCLE_HORIZON_AGE`,
  `STORAGE_KEY_V2`, etc. CodeRabbit cargo-cults the generic rule and
  will re-flag any new ones. Choose your battles — for new exports,
  use camelCase. Existing UPPER_SNAKE_CASE constants stay.)

- **Aggregator for multi-product chart benchmarks.** When a chart
  renders multiple products on one canvas AND the chart's benchmark
  line is sourced from `selectedResults[0]`, the benchmark misleads
  users with capped products (AVD / Riester). For the Vergleich
  layout, when surfacing the compare-mode "Alle Produkte" pane,
  aggregate via `aggregateLifecycleResults`. Codex flagged this as
  P2 in PR 287 R2.

- **Codex does NOT auto-re-trigger on new commits.** CodeRabbit re-
  reviews automatically when you push; Codex only reviews on PR open,
  draft-ready transition, or an explicit `@codex review` comment. After
  every fix commit, post `gh pr comment <N> --body "@codex review"`
  to trigger a re-review. Without it, you'll see "Codex Review:
  Didn't find any major issues" on the OLD commit and incorrectly
  assume green on the new commit.

## Review-loop reality (UPDATED from PR 287)

- **Plan for 3–6 review rounds.** PR 287 took 3 rounds (R0–R2);
  PR 286 took 5; PR 6 took 7. Each round produces 1–6 findings; later
  rounds shift to ARIA semantics, tap targets, stylelint, naming nits.
  The user has explicitly said "0 findings including 0 nitpicks" —
  treat 🟡 minor and trivial "non-finding observations" as must-fix.

- **CodeRabbit's "No actionable comments were generated in the recent
  review. 🎉" message in the summary comment** is the green signal.
  Combine with the SUCCESS status check on the `CodeRabbit` context.

- **Codex's green signal lives in issue comments, not formal reviews.**
  When Codex has no findings, it posts an issue comment with literal
  phrasing like `"Codex Review: Didn't find any major issues."` followed
  by a flavor sign-off ("Bravo." / "Chef's kiss." / "Can't wait for the
  next one!"). NOT a formal review and NOT a thumbs-up reaction. Poll
  `/repos/{owner}/{repo}/issues/{n}/comments` for
  `chatgpt-codex-connector[bot]`, not just `/pulls/{n}/reviews` and
  `/pulls/{n}/comments`.

- **CodeRabbit posts STALE reviews on previous commits.** When you
  push a new commit, the in-progress comment updates with a new
  `Run ID`; the previous-run review may still arrive later and flag
  findings that the new commit has already addressed. Trust the
  in-progress comment's `Reviewing files that changed from … and
  between BASE and HEAD` line — the `HEAD` SHA tells you which commit
  the review is actually against.

- **CodeRabbit auto-pauses after N commits in quick succession.** PR
  286 hit this after R4: "Reviews paused — branch is under active
  development". The pause comes with a "Trigger review" checkbox /
  `@coderabbitai review` command to resume. Plan to nudge if you've
  pushed ≥4 commits without an explicit re-trigger.

- **Both reviewers converge.** Final merge signal: CodeRabbit emits
  `SUCCESS` status check AND posts "No actionable comments were
  generated in the recent review. 🎉" AND Codex (after `@codex review`
  re-nudge) says "Didn't find any major issues" (or equivalent green
  phrasing). This was the PR 287 convergence at round 2.

## CI workflow gating reminder

`feat/redesign-*` and `feat/angaben-*` branches do NOT trigger the
agent-only workflows (`pr-verify` / `claude-review` / `review-loop`).
Those are gated to `agent/issue-*` and `automation/retro-curate-*`
branch prefixes. So `npm run verify` runs locally in the implementer's
worktree, NOT in CI. You MUST verify locally before merge. The
Cloudflare `Workers Builds: rentenwiki` check runs on all branches;
treat it as the only meaningful CI signal for `feat/*` PRs.

## The `gh pr merge --delete-branch` worktree gotcha (PR 286/287 lesson)

The sibling worktree `C:/Users/Peter/Coding_Projects/Rentenrechner-conflict-auto`
still holds `main` checked out. `gh pr merge --squash --delete-branch`
fails with `fatal: 'main' is already used by worktree at …` — but the
merge ITSELF succeeds server-side. The error is from the post-merge
local cleanup step. Recovery: drop `--delete-branch`, verify the PR
shows `state: MERGED`, then delete the remote ref via:

```
gh api -X DELETE repos/PeterHartwieg/Rentenrechner/git/refs/heads/<branch>
```

Local branch cleanup can wait — `git branch -D` against a now-orphan
local branch needs no API call. PR 287 used this pattern cleanly.

## Your job — PR 9: Vergleich

Start from a clean branch off main:
`git checkout -b feat/redesign-vergleich origin/main`.

> The sibling worktree `Rentenrechner-conflict-auto` still holds main
> checked out, so `git checkout main` fails locally. Always branch
> from `origin/main` directly.

Goal per plan §6 PR 9: replace compare-mode results layout. Rendite-
annahme strip on top (folds in `ScenarioToolbar`). Main: neutral 6-
product comparison table (all 6 products: ETF, bAV, pAV, AVD, Riester,
Basisrente). Pro/Contra row underneath (4-wide → 3×2 → 1-col). No
winner highlight. Estimated ~6 days incl. mobile.

**Vergleich layout (per mock):**

- Header: kicker "Persönliche Auskunft · ohne Empfehlung" (or similar
  — read the artboard), H1, optional headline figure. Sober D, same
  chrome as the other redesigned pages.
- **§ 1 Rendite-Annahme strip** — pill row of return scenarios
  (Konservativ / Basis / Optimistisch + custom). Folds in
  `ScenarioToolbar.tsx`. Picker drives the table data via state.
- **§ 2 Comparison table** — 6 products, neutral comparison. Columns
  TBD per mock (likely: Netto-Rente, Kapital mit 67, Steuerlast,
  KV/PV-Last, eff. Kosten %, Kommentar). Table wraps to handle
  width — no horizontal scroll. NO winner highlight, NO ranking
  badges. Color rules consistent with Vertrag-Detail's scenario
  table: oxblood for negative-direction deltas, neutral ink for
  positive/neutral.
- **§ 3 Pro/Contra row** — per-product pros and cons grid. 4-wide on
  desktop → 3×2 on tablet → 1-col on phone. Copy is content-driven
  (likely from `src/content/recommendationCopy.ts` or a new file).
  Voice: neutral, no "Empfehlung", no "stark"/"klasse".

**Right rail** — Likely NOT used (Vergleich is a wide-table surface).
Confirm against the artboard. If used, `RightRailAccordion` pattern
applies.

**Mobile (phone <640 px):**
- Rendite strip → horizontal scroll or wrap.
- 6-product table → vertical product cards (one per product,
  label/value pairs). This is THE big mobile change.
- Pro/Contra grid → 1-col stack.
- Tap target ≥44 px everywhere (PR 287 hardening).

**Files added:**
- `src/features/vergleich/VergleichPage.tsx` — page entry. Mirror
  the PR 8 module-layout decision (co-locate sub-components under
  `src/features/vergleich/`). Likely sub-components:
  `VergleichRenditeStrip.tsx`, `VergleichComparisonTable.tsx` (with
  desktop/phone variants), `VergleichProContraGrid.tsx`.

**Files modified:**
- `src/Calculator.tsx` — replace the existing `vergleichPane` dispatch
  block (`Calculator.tsx:675–710`) with `<VergleichPage />` for
  compare-mode. The pane dispatcher in CLAUDE.md "UI chart
  conventions" is the binding spec — if you delete a pane, you ALSO
  delete its slug from `VergleichPaneSlug` union, from
  `ALL_VERGLEICH_PANES`, and remove the three
  `&& vergleichPane !== '<slug>'` exclusions. Missing any one step
  causes silent URL-init failure or duplicate render.
- `src/features/results/vergleichPanes.ts` — likely whole-file rewrite
  or deletion. The pane-switcher mechanism may collapse entirely if
  the new VergleichPage is a single linear surface.
- `src/features/workspace/ScenarioToolbar.tsx` — restyle to Sober D
  pill row. Behaviour unchanged (read assumptions, write scenario id).
- `src/features/workspace/EmptyComparison.tsx` — restyle. Used when
  visibleProducts is empty.
- `src/features/workspace/ComparisonPicker.tsx` — restyle. Used when
  the user adds/removes products.
- `src/features/results/CapitalChart.tsx`, `PensionChart.tsx`,
  `FeeDragChart.tsx`, `MonteCarloPanel.tsx` — likely DELETED from
  Vergleich. Plan §4 says: "MonteCarloPanel + FeeDragChart removed
  from Mein Plan / Vergleich main views. MC → integrated into Methode
  (Renditeannahmen). Fee drag → single line on Vertrag im Detail."
  If you delete them from the main Vergleich pane, also delete any
  `vergleichPane === '…'` cases that route to them in Calculator.tsx.
  CapitalChart / PensionChart are likely also gone — confirm against
  the artboard.
- `src/App.tsx` — confirm the `home` case still routes correctly when
  compare-mode resolves to the new VergleichPage surface (currently
  it renders `<Calculator … />` which handles the dispatch internally;
  this likely doesn't need to change).
- `src/features/results/VergleichSidebar.tsx` — sidebar deletion is
  PR 9's scope. PR 6 already removed it from Mein Plan; PR 9 finishes
  the deletion. Likely DELETED at end of PR 9.
- `src/features/inventory/CombineDashboardSidebar.tsx` — keep or
  delete? It's combine-mode-only. PR 9 is compare-mode-focused but
  if the dashboard surface collapses, this might go too. Read first.
- `CONTEXT.md` module map — add the new `/vergleich`-equivalent
  route OR confirm the compare-mode landing surface (`/` with
  AppView='compare') still maps coherently. Update the route table.
- `CLAUDE.md` "Quick navigation" — add a row for "Edit Vergleich
  comparison table" and "Edit pro/contra row content".

**Files deleted (at end of PR):**
- `MeinPlanSidebar.tsx` — PR 6 orphan, finishable in PR 9.
- `meinPlanPanes.ts` — same.
- `VergleichSidebar.tsx` — PR 9's primary deletion.
- Plus any `vergleichPanes.ts` if the pane mechanism collapses.
- Plus any per-pane components that no longer have a render path
  (CapitalChart / PensionChart / FeeDragChart / MonteCarloPanel —
  depending on which the new layout still uses).

**Mode handling:**

Vergleich is **compare-mode only**. Combine-mode has its own surface
(Mein Plan combine = `MeinPlanPage`). The page reads
`workspace.mode === 'compare'` and renders; in combine-mode,
`Calculator.tsx` already routes to `MeinPlanPage` for the equivalent
view, so the new VergleichPage doesn't need a combine-mode branch.

Unlike PR 8 (which the user explicitly chose dual-sourcing for), PR 9
follows the established split: per-mode surface, no dual-source. Match
Vertrag-Detail's compare-mode `EmptyState` posture if compare-mode
hits a degenerate state (visibleProducts empty → already handled by
`EmptyComparison.tsx`).

**Acceptance criteria (verify before opening PR):**
- `npm run verify` green locally (3234+ tests + workers + build +
  prerender + lint).
- Vergleich renders at 390 / 820 / 1280 px with all three viewports
  tested.
- 6-product table renders as a table at desktop/tablet; collapses to
  vertical product cards on phone.
- Rendite-annahme strip drives the table — switching scenarios
  re-renders the table with new figures.
- Pro/Contra grid: 4-wide desktop / 3×2 tablet / 1-col phone.
- All `href` attrs go through `routeToPath(ROUTES.x)`. Grep for
  literal `href="/"` and `href="/vergleich"` in the new files —
  zero matches.
- Doc-title `useEffect` set if the page is at a non-`publicRouteRegistry`
  route (likely the compare-mode `/` landing already has a title; if
  you're at a sub-route, set it).
- DisclaimerBanner still session-dismissable.
- Single JSON-LD via head pipeline.
- Every statutory value traces to `src/rules/legalConstants.ts` or
  `activeRules`. The pro/contra copy is content (not statutory); fine.
- Workspace `schemaVersion: 2` unchanged. `migrateAndValidateState` /
  `validateWorkspace` stay single funnels.
- Filter chip ARIA: `role="group"` + `aria-pressed`. NO tablist.
- Chip min-height 44 px on every viewport.
- Stylelint font-family quoting compliant.
- No new exported constants in UPPER_SNAKE_CASE.
- `MeinPlanSidebar.tsx`, `meinPlanPanes.ts`, `VergleichSidebar.tsx`
  deleted with no dangling imports.
- The CLAUDE.md "Vergleich pane dispatcher" three-step invariant is
  honored or the mechanism is deleted entirely (cleaner).
- `useChartDensity` adopted on any surviving Recharts surface
  (FeeDragChart in Vertrag-Detail, MonteCarloPanel in Methode).
- Pre-render works for the home route (it already does; just don't
  break it).
- All 6 products iterate via `PRODUCT_REGISTRY` — no hardcoded lists.

## Optional stretch — none

PR 9 is the largest single PR by file count (probably 15+ files
touched, multiple deletions). Don't bundle PR 10 (Wohin geht das Geld)
into this session. PR 10 is the per-product breakdown card grid —
separate ~5-day scope. PR 11 (Print) requires PR 9 to be stable first
because PrintReport reads the Vergleich surface.

## Open follow-ups (do not fix in PR 9 unless you happen to touch the file)

- **#279** — Pre-existing Versorgungsfreibetrag 2021/2022 cohort bug
  in `src/rules/legalConstants.ts`. Wrong-number-fix with full
  preflight; needs its own PR with regression test.
- **CombineDetailView.tsx retirement** — still used by the combine-
  mode "Details & Export" tab body; not in PR 9's scope unless you're
  ripping out the tab-shell entirely.
- **PR 6 5th sensitivity row (bAV → ETF counterfactual)** — flagged
  in PR 6 retro as deferred.
- **`href="/"` / `href="/eingaben"` literal hrefs** in
  LegalLayout.tsx, ArticleLayout.tsx, MethodePage.tsx,
  PageNotFound.tsx, AngabenPage.tsx, MeinPlanPage.tsx — surveyed by
  the PR 286 R4 agent; fix opportunistically if you touch one.
- **`equityPartialExemption` / `guaranteedInterestRate` evidence
  keys** — flagged as "not confirmable yet" in
  `VertragProvenanceList.tsx` (PR 7 R3). If the wizard ever starts
  capturing them, add to `PRODUCT_EVIDENCE_FIELDS`.
- **`FeeDragChart` / `MonteCarloPanel` adoption of `useChartDensity`**
  — flagged in PR 287's CONTEXT.md / CLAUDE.md entries. If PR 9
  re-locates either chart (per plan §4 default), do the adoption in
  the same PR.

## Constraints — non-negotiable

1. **DisclaimerBanner** stays on `sessionStorage`. AppShell renders
   it. `PrintReport.tsx` keeps its own. Both are P0.
2. **No new network calls.** Self-host any new fonts. No CDN fetches.
3. **Brand:** `RentenWiki` in chrome, `RentenWiki.de` in titles / OG
   / exports. Never "Rentenrechner" in public copy.
4. **No statutory values outside `src/rules/`.** Sweep every literal
   in new Vergleich components before opening the PR.
5. **Engine untouched.** Vergleich page consumes existing simulation
   results. No new engine entry points, no changes to
   `simulateRetirementComparison` / `simulatePortfolio` /
   `combinePortfolio` shape.
6. **Workspace `schemaVersion: 2` unchanged.** No new top-level
   workspace fields, no new migrations.
7. **`PRODUCT_REGISTRY` not bypassed.** All 6 product columns derive
   from the registry. No hardcoded product lists.
8. **Page-level state, prop-driven children.** Every row / cell
   component takes live data via props. `useCalculatorState` and
   `useSimulationResult` are called ONCE at the page level.
9. **Exhaustive switches** over `ProductId`,
   `InstanceCommon['status']`, decision-atom kinds, evidence states,
   chart-density tiers ('phone' | 'tablet' | 'desktop'), and any
   other union you dispatch on. Default branch must be `const _:
   never = value`.
10. **`routeToPath(ROUTES.x)` for every `href`.** Literal path
    strings are a guaranteed CodeRabbit nitpick.
11. **`workspace.mode` for mode gating**, not `detectSavedMode()`.
12. **Filter chips use button-group semantics**, not tabs:
    `role="group"` + `aria-pressed`. NO `role="tablist"` /
    `role="tab"` / `aria-selected`.
13. **Tap target ≥ 44 px** at every viewport. Bump padding to keep
    visual ratio.
14. **Stylelint font-family quoting:** unquoted single-word names
    (Newsreader), double-quoted multi-word names ("IBM Plex Sans").
15. **camelCase for exported constants** in new code. Existing
    UPPER_SNAKE_CASE constants stay.
16. **No winner badges, no recommendation copy.** PR 9's Vergleich
    is explicitly neutral. The "Welcher Vertrag profitiert am
    stärksten von zusätzlichem Beitrag?" recommender card in Mein
    Plan stays put; do not surface it in Vergleich.

## Working style

- Read the plan + the mock file + existing `Calculator.tsx`
  Vergleich-pane dispatcher + the four pane components likely
  affected (CapitalChart / PensionChart / FeeDragChart /
  MonteCarloPanel) end-to-end before doing anything. Understanding
  what survives vs. moves is the design decision.
- Use Plan / Explore agents for broad reading; Read / Grep / Glob
  when you know the file.
- For test edits across many files, use Python (UTF-8 safe) not
  PowerShell.
- Pop options to the user as terse numbered lists when you hit a
  real decision. Don't restate locked decisions.
- Test at all three viewports.
- End-of-turn summaries: one or two sentences.
- Plan for 3–6 review rounds.
- **Monitor reviewer activity on three endpoints**: `/issues/{n}/
  comments`, `/pulls/{n}/reviews`, `/pulls/{n}/comments`. Codex's
  green signal arrives via issue comments. **After EVERY fix commit,
  post `gh pr comment <N> --body "@codex review"`** — Codex does not
  auto-trigger.
- Each round, sweep CodeRabbit comments for "duplicate (N)" collapses
  and stale reviews on old commits — don't trust the headline
  "Actionable comments posted" count alone. The in-progress
  comment's HEAD SHA is the source of truth for which commit is
  actually under review.
- For the merge: drop `--delete-branch` to dodge the worktree gotcha;
  delete the remote ref via `gh api -X DELETE` after merge.

## First step

1. Read `docs/redesign/implementation-plan.md` §6 PR 9 lines + §4
   defaults (chart relocations) + §5 compliance guardrails.
2. Read the Vergleich artboard in
   `.scratch/redesign-handoff-v2/rentenrechner/project/direction-d.jsx`
   (grep `Vergleich`, `compare`, `MVergleich`, `TVergleich`) and the
   responsive variants in `responsive-views.jsx`.
3. Read `src/Calculator.tsx` end-to-end, especially the
   `vergleichPane` dispatch block at ~675–710 and the
   `compareSelectedScenarioId` / `selectedResults` derivation. Note
   how compare-mode threads simulation results into each pane.
4. Read `src/features/results/vergleichPanes.ts`,
   `VergleichSidebar.tsx`, `VergleichDashboard.tsx`,
   `MeinPlanSidebar.tsx`, `meinPlanPanes.ts` — these are the orphans
   PR 9 deletes.
5. Read `src/features/workspace/ScenarioToolbar.tsx` to understand
   what fold-in means.
6. Read `src/features/workspace/EmptyComparison.tsx` and
   `ComparisonPicker.tsx` for the empty-state + product-picker
   patterns.
7. Read `src/features/mein-plan/MeinPlanPage.tsx` as the canonical
   Sober D page reference (PR 6 pattern, refined in PR 7 + PR 8).
8. Decide: keep `vergleichPanes.ts` as a registry, or collapse the
   mechanism entirely. Recommendation: collapse — the new layout is
   linear, not a pane switcher.
9. Decide: relocate `MonteCarloPanel` to Methode (plan §4 default) or
   defer to a later PR. Recommendation: relocate in PR 9 since
   you'll be touching the dispatch already.
10. Decide: relocate `FeeDragChart` to Vertrag-Detail (plan §4
    default) or defer. Recommendation: relocate in PR 9 (small move,
    touches Vertrag-Detail too — one fewer PR later).
11. Branch: `git checkout -b feat/redesign-vergleich origin/main`.
12. Report your call to the user with: proposed file list (added /
    modified / deleted), `vergleichPanes.ts` collapse vs. retain
    decision, MonteCarloPanel + FeeDragChart relocation decisions,
    pro/contra copy source decision (new content file vs. inline),
    and any deviations from the plan. Ask for go.
```

---

## Repo state at handoff

- `main` is at squash commit `3addbb9` (PR #287 — feat(kapital):
  full-page lifecycle chart at /kapital, PR 8).
- Previous landings: `3bc930a` (PR #286 — Vertrag-Detail per-contract
  drill-in, PR 7), `0478682` (PR #284 — Mein Plan combine-mode redesign,
  PR 6), `5a56bec` (PR #283 — combine-mode `/eingaben` wiring),
  `61a0e50` (PR #281 — Deine Angaben page, PR 5), `13fdde5` (PR #278 —
  Methode page, PR 4), `7505dbe` (PR #275 — Artikel hub, PR 3),
  `a646443` (PR #273 — landing redesign, PR 2), `8513882` (PR #270 —
  chrome foundation, PR 1).
- `feat/redesign-kapital` branch deleted on remote;
  `feat/redesign-vertrag-detail`, `feat/redesign-mein-plan`,
  `feat/angaben-combine-wiring`, `feat/redesign-angaben`,
  `feat/redesign-methode`, `feat/redesign-articles`,
  `feat/redesign-landing`, `feat/redesign-chrome` all merged and
  cleaned up. Some stale local branches may persist (incl. the now-
  orphan local `feat/redesign-kapital`); safe to delete.
- A `Rentenrechner-conflict-auto` sibling worktree still holds main
  checked out; local `git checkout main` fails. Branch from
  `origin/main` directly.
- Local working tree may still have `.scratch/redesign-handoff-v2/`
  and `.scratch/redesign-handoff/` untracked — intentional, do not
  commit the bundles.
- Issue #279 (cohort bug) — see "Open follow-ups" in the orchestrator
  prompt.

## Where the PR-8 patterns live

- `src/features/kapital/KapitalPage.tsx` — canonical dual-source
  page reference. Reads `workspace.mode`, calls both
  `useCalculatorState`+`useSimulationResult` (compare) and
  `usePortfolioState`+`useCombineSimulation` (combine)
  unconditionally, branches on mode. Doc-title `useEffect` placed
  before any conditional return. Page-level filter chips drive
  selection; `BreakEvenChart` rendered with `showPicker={false}`.
- `src/features/kapital/kapitalFilters.ts` — per-mode chip option
  builders. The compare-mode "Alle Produkte" chip aggregates via
  `aggregateLifecycleResults` (PR 287 R2 fix); per-product chips
  forward single ProductResults.
- `src/features/kapital/wendepunkte.ts` — pure turning-point row
  builder; aggregates Kapital / Eingezahlt / Ausgezahlt across the
  active chip's results at four canonical ages.
- `src/features/kapital/KapitalFilterChips.tsx` — canonical button-
  group filter chip pattern (`role="group"` + `aria-pressed`, NOT
  tablist). Mirror this for the Vergleich pro/contra picker.
- `src/features/kapital/KapitalWendepunkteTable.tsx` — table at
  desktop/tablet, vertical row blocks on phone (via `useViewport()`).
  Mirror this for the Vergleich 6-product table.
- `src/ui/charts/useChartDensity.ts` — width-based token provider.
  Constants `phoneChartMaxPx` / `tabletChartMaxPx`. `BreakEvenChart`
  consumes via `useChartDensity(chartWidth)`. Migrate
  `FeeDragChart` / `MonteCarloPanel` to it in PR 9 if they survive.
- `src/features/results/portfolioLifecycle.ts` —
  `aggregateLifecycleResults` is now exported. Use it whenever a
  chart benchmark needs to sum across multiple products.
- `src/features/results/BreakEvenChart.tsx` — `showPicker={false}`
  suppresses the internal picker and renders every
  `selectedResults` entry. Density tokens drive margins, yAxis
  width, axis labels, callout labels.
- `src/app/useRoute.ts` — tagged-union `Route` with the
  `kind: 'kapital'` variant added. `ROUTES.kapital` constructor +
  `routeToPath` + `pathToRoute` + `chromeRoutes.ts` lit the home tab.

## PR 8 review iteration — what to expect repeating

Reviewers flagged each of these patterns in PR 287. Pre-empt them in
PR 9:

| Pattern | Round flagged | Action |
|---|---|---|
| Tab roles used for single-select filter chips | R1 | `role="group"` + `aria-pressed`, not `role="tablist"` + `aria-selected`. |
| Tap targets below 44 px | R1 | min-height 44 px at EVERY viewport, not just phone. |
| `font-family` single-quotes around single-word names | R1 | Unquoted single-word names (`Newsreader`), double-quoted multi-word (`"IBM Plex Sans"`). |
| Exported constants in UPPER_SNAKE_CASE | R1 | camelCase for new exports. |
| Memoization comment mismatched implementation | R1 | Keep doc-comments aligned with code. |
| German article agreement on masculine nouns | R1 | `Dieser Vertrag` (M), `Diese Versicherung` (F), `Dieses Produkt` (N). |
| Chart benchmark sourced from `selectedResults[0]` only | R2 (Codex P2) | Aggregate via `aggregateLifecycleResults` when multiple products on one chart. |
| Hardcoded `href="/"` / `href="/x"` | R3, R4 (PR 286) | Use `routeToPath(ROUTES.x)` from the first commit. |
| Doc title not set for non-publicRouteRegistry route | R0, R1 (PR 286) | `useEffect(() => { document.title = … }, [deps])` placed before early returns. |
| `<a>` only rendered when `navigate` available | R0, R1 (PR 286) | Progressive enhancement: always render `<a href={…}>`, intercept click only when navigate is truthy. |
| Page-level mode gate uses `detectSavedMode()` | R1, R2 (PR 286) | Always use `workspace.mode` from the loaded workspace state. |
| Codex doesn't auto-re-trigger | every commit | Post `@codex review` after every push. |

## Working tree state

Untracked at handoff (don't commit):
- `.scratch/redesign-handoff-v2.tar.gz` — original handoff bundle archive.
- `.scratch/redesign-handoff-v2/` — extracted bundle.
- `.scratch/redesign-handoff/` — older bundle iteration.
- `docs/redesign/handoff-pr7-onwards.md` — earlier session's
  paste-able prompt (kept for chain-back reference).
- `docs/redesign/handoff-pr8-onwards.md` — previous session's
  paste-able prompt (kept for chain-back reference).
- `docs/redesign/handoff-pr9-onwards.md` — **this file**.

The current local branch may still be `feat/redesign-kapital` (now
orphaned — remote ref deleted post-merge). Switch to a fresh branch
from `origin/main` to start PR 9.
