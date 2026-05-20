# Redesign Handoff — PR 10 onwards

> **Status:** Handoff prompt for a fresh session.
> **Last updated:** 2026-05-20.
> **Previous session landed:**
> - PR 9 — Vergleich at squash commit `495d9aa`, merged via #288 (**3 review rounds R0–R2**, ~45 min wall-clock from PR open to merge). Both Codex and CodeRabbit returned 0 findings on the final commit `dfdb6f8`.
>
> **Next up:** PR 10 — **Wohin geht das Geld** (per plan §6). Per-product breakdown card grid at `/vergleich/details`. Compare-mode drill-in. ~5 days incl. mobile.

---

## Paste this as the new session's orchestrator prompt

```
You are orchestrating PR 10 of a multi-PR UI redesign for the Rentenrechner
repo (German retirement calculator, public name "RentenWiki.de"). Working
dir is C:\Users\Peter\Coding_Projects\Rentenrechner.

## Sources of truth (read these before doing anything)

1. **docs/redesign/implementation-plan.md** — binding plan for the whole
   redesign. PR 10 spec is in §6 lines 256–264 ("Wohin geht das Geld").
   §4 defaults (line 98) pin the mobile pattern: `scroll-snap-type: x
   mandatory`. No JS carousel. §8 risk #9 (Recharts mobile tuning) is
   not in PR 10's scope — no charts on this surface.
2. **docs/redesign/handoff-pr10-onwards.md** — this file. Documents the
   PR 9 deltas (Codex P2 patterns, deprecated CSS, formatCurrency
   discipline, type-vs-interface convention, empty-state a11y).
3. **docs/redesign/handoff-pr9-onwards.md** — still authoritative for
   the conventions that did not change in PR 9; this new file carries
   only the deltas. Chain back through it for anything earlier.
4. **.scratch/redesign-handoff-v2/rentenrechner/project/direction-d-pages.jsx**
   — `DProductBreakdown` artboard (lines 567–693). Sober D, same chrome
   as Mein Plan / Vertrag-Detail / Kapital / Vergleich. Header (mono
   product code + 16 pt name), three labeled sections (Ansparphase,
   Mit 67, Im Alter), footer with "Verfügbar ab" availability tag.
5. **.scratch/redesign-handoff-v2/rentenrechner/project/responsive-views.jsx**
   — `MVergleichDetail` (phone, lines 724–748) and `TVergleichDetail`
   (tablet, lines 1757–1813). Phone collapses to 2-card visible
   horizontal scroll with overflow indicator; tablet is 2×2.
6. **CLAUDE.md** — project guide. The "Review guidelines" P0/P1 ladder
   binds every PR. PR 10 touches no engine/math; it's a pure display
   surface consuming existing `ProductResult[]`. The "UI rounding
   boundary" block is binding (any euro display goes through
   `formatCurrency`).
7. **CONTEXT.md** — domain glossary. PR 10 surfaces the same 6 products
   as PR 9: ETF, bAV, pAV, AVD, Riester, Basisrente. `PRODUCT_REGISTRY`
   is the only iteration source.

## What's already shipped (do not redo)

Carry-forward from PR 9 handoff still applies — every chrome primitive,
Sober D route (Methode / Angaben / Mein Plan / Vertrag-Detail /
Kapital & Auszahlungen / **Vergleich at compare-mode home**), and
Editorial A route is live. Plus PR 9 specifics:

- **Compare-mode landing** now renders `VergleichPage` at `/` (compare
  mode only). The page is a single linear surface: rendite-annahme
  strip (folds in `ScenarioToolbar`) → 6-product comparison table
  → Pro/Contra grid. No pane switcher.
- **`vergleichPanes.ts` mechanism deleted entirely.** No
  `VergleichPaneSlug` union, no `ALL_VERGLEICH_PANES`, no
  `?pane=` URL deep-linking, no three-line negative-exclusion
  invariant. The pane dispatcher in CLAUDE.md "UI chart conventions"
  is GONE (the block was removed by PR 9).
- **`MonteCarloPanel` relocated** to `src/features/methode/MethodeMonteCarloSection.tsx`
  (integrated into Methode page under a "Renditeannahmen" section).
- **`FeeDragChart` relocated** to `src/features/vertrag-detail/VertragFeeImpact.tsx`
  (single-line fee-impact viz on Vertrag-Detail page).
- **Both relocated charts adopt `useChartDensity`** for narrow-width
  rendering — pattern continues from PR 8.
- **Pro/Contra copy** lives in `src/content/proContraCopy.ts` —
  registry-driven `Record<ProductId, ProContraEntry>`. Mirror this
  pattern if PR 10 needs new per-product content; do not inline copy
  in JSX.
- **Files deleted in PR 9** (cleanup-orphans pass): `VergleichSidebar.tsx`
  + test, `MeinPlanSidebar.tsx`, `meinPlanPanes.ts`, `PaneSidebar.tsx`,
  `CapitalChart.tsx`, `PensionChart.tsx`, `VergleichDashboard.tsx`
  + CSS, `App.vergleich-sidebar.test.tsx`.
- **`ScenarioToolbar` restyled** to Sober D pill row.
  `EmptyComparison.tsx` + `ComparisonPicker.tsx` restyled.

## Conventions established by PR 1-9 — follow these

Carry forward from PR 9 handoff still applies (SPA-navigation guards,
navigate threading, JSON-LD in head only, fail-fast resolvers, slugify
helper, post-hydration scroll-to-hash, jsdom + `inShell()` helper, no
PowerShell for file rewriting, viewport tests, brand discipline, German
typography, statutory values in `src/rules/`, `gh pr merge` worktree
gotcha, sweep numeric literals before opening the PR, stable anchor IDs,
paragraph-citation doc-comments on new `legalConstants.ts` entries,
`<NumberField>` for engine-bound numeric inputs, exhaustive switches
with `const _: never = …` default, paired label/sublabel switch audits,
registry-driven product iteration via `PRODUCT_REGISTRY`, `Array.isArray`
guard before casting dynamic workspace fields, ETF status differentiation
in UI copy, `routeToPath(ROUTES.x)` for every href, doc-title `useEffect`
for non-publicRouteRegistry routes placed BEFORE conditional returns,
URI-decode segments inside try/catch, non-finite number guards before
writing engine state, `workspace.mode` for mode gating not
`detectSavedMode()`, EmptyState pattern with `ctaTarget: Route`,
page-level data hooks + prop-drive children, `'basis' ?? first`
scenario picker). Read the PR 9 handoff if any are unfamiliar.

NEW conventions hardened in PR 288 (PR 9):

- **Dynamic-age labels.** Hardcoded "mit 67" anywhere adjacent to
  `capitalAtRetirement` (or any value derived from `profile.retirementAge`)
  is Codex P2 bait. Use `Kapital mit ${retirementAge}` in column
  headers, mobile card labels, and tooltips. Codex flagged this on
  PR 288 R1 with two duplicate inline comments — single owner is the
  page-level hook, then prop-drive into the table + the phone card
  block. PR 10 surface displays "Mit 67, einmalig" as a section heading
  — that's the same trap. Render `Mit {retirementAge}, einmalig`.

- **`formatCurrency` for every euro display.** Even "metadata" lines
  like the rendite-strip "200 €/Mon." contribution figure must go
  through `formatCurrency(value, 0)` from `src/utils/format.ts`. Do
  NOT roll `Math.round(value).toLocaleString('de-DE')` even for a
  one-off. CodeRabbit flagged this as Major in PR 288 R0.

- **`type` is for unions, `interface` is for object shapes.** Project
  TypeScript convention. `export type ProContraEntry = { readonly pro:
  string; ... }` was flagged Major in PR 288 R0; rewritten as
  `export interface ProContraEntry`. Same rule applies to any new
  multi-property record type in PR 10. Single-field aliases and
  unions stay as `type`.

- **Deprecated `word-break: break-word`.** Stylelint flags this; the
  modern replacement is `word-break: normal; overflow-wrap: anywhere;`.
  Sweep new CSS files for `break-word` before opening the PR.

- **`aria-hidden="true"` is NOT an empty-state pattern.** PR 288 R1
  introduced this trying to silence the "no products selected"
  paragraph in `MethodeMonteCarloSection`. CodeRabbit R1 caught it
  Major: the explanation for missing content must remain readable
  by assistive tech. Render empty-state copy without `aria-hidden`;
  optionally omit `aria-live` if you want it silent by default.

- **R1 fixes can introduce R2 findings.** PR 288's `aria-hidden` own-
  goal came directly from the R1 fix split-fallback-states branch.
  When fixing an a11y / aria issue, run the fix through one extra
  semantic check before committing: "does this change hide content
  from screen readers in any branch?"

- **Codex acknowledges with 👀 then takes 1-3 min to verdict.** If you
  see the "eyes" reaction on the PR or the `@codex review` comment
  but no review yet, wait the 3 min before re-nudging. PR 288 R2
  showed Codex took ~6 min total from eyes-reaction to verdict on a
  smallish R2 diff.

## Review-loop reality (UPDATED from PR 288)

- **Plan for 2-4 review rounds.** PR 288 took 3 rounds (R0–R2);
  PR 287 took 3; PR 286 took 5; PR 6 took 7. Later PRs are trending
  shorter as the conventions stabilise. Each round produces 1–6
  findings; later rounds shift to ARIA semantics, tap targets,
  stylelint, type-vs-interface, deprecated-CSS nits. The user has
  explicitly said "0 findings including 0 nitpicks" — treat 🟡 minor
  and trivial "non-finding observations" as must-fix.

- **CodeRabbit's "No actionable comments were generated in the recent
  review. 🎉" message in the summary comment** is the green signal.
  Combine with the SUCCESS status check on the `CodeRabbit` context.

- **Codex's green signal lives in issue comments** with literal phrasing
  `"Codex Review: Didn't find any major issues."` followed by a
  flavor sign-off ("Nice work!" / "Bravo." / "Chef's kiss."). Codex
  ALSO posts a 👍 reaction on the PR when green. NOT a formal review.
  Poll `/repos/{owner}/{repo}/issues/{n}/comments` for
  `chatgpt-codex-connector[bot]`, plus `/issues/{n}/reactions` for
  the thumbs-up.

- **CodeRabbit posts STALE reviews on previous commits.** When you
  push a new commit, the in-progress comment updates with a new
  `Run ID`; the previous-run review may still arrive later and flag
  findings that the new commit has already addressed. Trust the
  in-progress comment's `Reviewing files that changed from … and
  between BASE and HEAD` line — the `HEAD` SHA tells you which commit
  the review is actually against.

- **CodeRabbit auto-pauses after N commits in quick succession.** PR
  286 hit this after R4. The pause comes with a "Trigger review"
  checkbox / `@coderabbitai review` command to resume. Plan to nudge
  if you've pushed ≥4 commits without an explicit re-trigger.

- **Both reviewers converge.** Final merge signal: CodeRabbit emits
  `SUCCESS` status check AND posts "No actionable comments were
  generated in the recent review. 🎉" AND Codex (after `@codex review`
  re-nudge) says "Didn't find any major issues" (or equivalent green
  phrasing) AND/OR adds 👍 reaction. This was the PR 288 convergence
  at round 2.

## CI workflow gating reminder

`feat/redesign-*` and `feat/angaben-*` branches do NOT trigger the
agent-only workflows (`pr-verify` / `claude-review` / `review-loop`).
Those are gated to `agent/issue-*` and `automation/retro-curate-*`
branch prefixes. So `npm run verify` runs locally in the implementer's
worktree, NOT in CI. You MUST verify locally before merge. The
Cloudflare `Workers Builds: rentenwiki` check runs on all branches;
treat it as the only meaningful CI signal for `feat/*` PRs.

## The `gh pr merge --delete-branch` worktree gotcha (PR 286–288 lesson)

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
local branch needs no API call. PR 288 used this pattern cleanly.

## Your job — PR 10: Wohin geht das Geld

Start from a clean branch off main:
`git checkout -b feat/redesign-wohin origin/main`.

> The sibling worktree `Rentenrechner-conflict-auto` still holds main
> checked out, so `git checkout main` fails locally. Always branch
> from `origin/main` directly.

Goal per plan §6 PR 10: per-product breakdown drill-in at
`/vergleich/details`. Six product cards (one per visible product),
each stacking three labeled sections (Ansparphase / Mit 67 / Im Alter)
of cashflow + tax breakdown rows. Estimated ~5 days incl. mobile.

**Layout (per mock `DProductBreakdown`):**

- Header: kicker "Vergleich · Wohin geht das Geld" (or similar — read
  artboard), H1, optional lead paragraph. Sober D, same chrome as
  Vergleich.
- **Card grid** — one card per visible product (currently up to 6:
  ETF, bAV, pAV, AVD, Riester, Basisrente). Mock shows 4-wide but
  we have 6 — see "Decisions to surface" below.
- **Per-card body (3 labeled sections):**
  - § Ansparphase, pro Monat — `Du selbst` / `+ Arbeitgeber` (bAV
    only) / `+ Steuerrückerstattung` (Basisrente, AVD, Riester) /
    `+ Steuer- & SV-Vorteil` (bAV) / `= effektiv investiert` (bold,
    border-top). Mono numbers, German labels.
  - § Mit {retirementAge}, einmalig — `Kapital brutto` / `− Kosten
    (X % p.a.)`. **Dynamic retirement age** (PR 288 R1 lesson — do
    not hardcode 67).
  - § Im Alter, pro Monat — `Brutto-Rente` / `− Einkommensteuer` /
    `− KV / PV` / `= Netto-Rente` (bold, border-top, accent
    oxblood). Colour rule: oxblood for the net-payout closing line
    only.
- **Footer per card:** `Verfügbar ab: <text>` — text per product
  (jederzeit for ETF, "62 J. (Rentenform)" for pAV, "67 J. (Bindung)"
  for bAV / Basisrente / AVD / Riester — confirm against engine
  payout-mode + product metadata, do NOT hardcode without reading
  PRODUCT_REGISTRY).

**Right rail** — Likely NOT used (card grid is the surface). Confirm
against the artboard. If used, `RightRailAccordion` pattern applies.

**Mobile (phone <640 px):**
- Card grid → horizontal scroll-snap row. `scroll-snap-type: x
  mandatory` on container + `scroll-snap-align: start` on each card.
  Per plan §4: **no JS carousel.**
- Cards keep full content; the artboard's `MVergleichDetail` shows
  2 visible at once with an "↓ N weitere Produkte (…)" indicator.
  Render the indicator only when more cards exist than fit the viewport.
- Tap target ≥44 px everywhere (PR 287 hardening still binding).

**Tablet (640–1023 px):** 2×2 grid (`gridTemplateColumns: repeat(2,
1fr)`) per `TVergleichDetail` mock. With 6 products this becomes 3
rows of 2 — confirm desired layout against the artboard before
implementing.

**Files added:**
- A new page entry. The plan §6 says `src/features/results/VergleichDetailPage.tsx`,
  but the per-feature-folder convention since PR 6 puts pages under
  their own folder (`mein-plan/`, `vertrag-detail/`, `kapital/`,
  `vergleich/`). **See "Decisions to surface" — recommend
  `src/features/vergleich-detail/VergleichDetailPage.tsx`** to match
  the convention, or co-locate as `src/features/vergleich/VergleichDetailPage.tsx`
  since the route is the `/vergleich/details` child of `/vergleich`.
- Likely sub-components co-located: `VergleichDetailCard.tsx`,
  `VergleichDetailCardSection.tsx` (the three-section body builder),
  pure helpers `vergleichDetailRows.ts` (per-product row builder
  consuming `ProductResult`), `vergleichDetailAvailability.ts`
  (registry-driven Verfügbarkeit text).

**Files modified:**
- `src/app/useRoute.ts` — extend the `Route` tagged-union with
  `{ kind: 'vergleich-detail' }`, add `ROUTES.vergleichDetail`,
  extend `routeToPath` (`'/vergleich/details'`) + `pathToRoute`.
- `src/App.tsx` — add `case 'vergleich-detail'` to the route
  dispatcher rendering the new page.
- `src/Calculator.tsx` — add a `Wohin geht das Geld →` link from
  `VergleichPage` (likely a header aside or a footer link, similar to
  Mein Plan's "Kapital im Verlauf →" link). SPA-progressive-enhancement
  pattern: real `href={routeToPath(ROUTES.vergleichDetail)}` + click
  interception only when navigate is truthy.
- `src/features/vergleich/VergleichPage.tsx` — wire the new
  "Wohin geht das Geld" link.
- `src/app/chromeRoutes.ts` — likely add `/vergleich/details` to
  light the same tab as `/` (compare-mode home).
- `CONTEXT.md` module map — add `/vergleich/details` route entry.
- `CLAUDE.md` "Quick navigation" — add row for "Edit per-product
  breakdown cards" pointing at the new page + helpers.
- Possibly `src/seo/publicRouteRegistry.ts` — confirm whether
  `/vergleich/details` is a public (prerendered) route or a workspace-
  state-dependent one. **Recommendation: workspace-state-dependent**
  (mirrors `/kapital`, `/vertrag/:id`, `/mein-plan`), so NOT in
  publicRouteRegistry. Set the doc title via `useEffect` placed BEFORE
  conditional returns.

**Files NOT modified:**
- Engine (`src/engine/`) — entirely untouched. PR 10 consumes existing
  `ProductResult[]` from `useSimulationResult()`.
- Workspace schema (`src/storage.ts`, `src/app/portfolioState.ts`) —
  unchanged. No new fields, no migrations.

**Mode handling:**

Per plan §6: PR 10 is **compare-mode only**. Combine-mode users land
on `MeinPlanPage` (which has its own composition + sensitivity drill-
in surfaces). The page reads `workspace.mode === 'compare'` and
renders; in combine-mode it returns an `EmptyState` pointing the
user to Mein Plan, OR redirects via `navigate` to
`routeToPath(ROUTES.home)` — pick whichever is cleaner. (Unlike PR 8
which the user explicitly chose dual-sourcing for, PR 10 follows the
established per-mode-surface split.)

**Acceptance criteria (verify before opening PR):**
- `npm run verify` green locally (3238+ tests + workers + build +
  prerender + lint).
- VergleichDetailPage renders at 390 / 820 / 1280 px with all three
  viewports tested.
- Card grid renders horizontally with `scroll-snap-type: x mandatory`
  on phone. NO JS carousel — verify by stopping the React app and
  confirming the scroll-snap still works on the raw DOM.
- 2×2 tablet, ≥3-wide desktop (decision below).
- Each card shows three labeled sections with mono numbers, German
  labels matching the artboard.
- Retirement age in section header (`Mit {retirementAge}, einmalig`)
  pulls from `profile.retirementAge` — NOT hardcoded.
- Every euro display goes through `formatCurrency(value, 0)` —
  no `toLocaleString` / `Math.round` rolls.
- AVD + Riester cards (not in artboard) follow the same structure
  with appropriate Steuerrückerstattung label for the
  Sonderausgaben tax-delta source.
- All `href` attrs go through `routeToPath(ROUTES.x)`. Grep new
  files for literal `href="/vergleich/details"` and `href="/"` —
  zero matches.
- Doc-title `useEffect` set, placed BEFORE conditional returns.
- DisclaimerBanner still session-dismissable; AppShell renders it.
- Every statutory value traces to `src/rules/legalConstants.ts` or
  `activeRules`. Verfügbarkeit "62 J." / "67 J." should derive from
  product metadata or engine constants, not be hardcoded.
- Workspace `schemaVersion: 2` unchanged.
- Card "filter" chips (if you add a filter row) use `role="group"`
  + `aria-pressed`. NO tablist.
- Chip min-height 44 px on every viewport.
- Stylelint font-family quoting compliant. NO `word-break: break-word`
  (use `word-break: normal; overflow-wrap: anywhere;`).
- No new exported constants in UPPER_SNAKE_CASE.
- Type aliases for object shapes use `interface`, not `type`.
- Empty-state copy does NOT use `aria-hidden="true"`.
- All 6 products iterate via `PRODUCT_REGISTRY`. AVD + Riester cards
  exist and render the same row structure as the artboard 4. Confirm
  per-product `Verfügbarkeit` text and Steuer-line labels match each
  product's tax category (ETF: nichts; bAV: Steuer- & SV-Vorteil;
  pAV: nichts; Basisrente / AVD / Riester: Steuerrückerstattung).
- Pre-render works for the home route (it already does; just don't
  break it).

## Decisions to surface to the user before implementation

PR 10 has at least three genuine product/design calls not covered by
the plan or carry-forward. Pop them as a terse numbered list before
delegating implementation:

1. **Page folder.** Plan says `src/features/results/`; convention since
   PR 6 is `src/features/<feature>/`. Recommend
   `src/features/vergleich-detail/` (matches the route slug). OR
   nest under `src/features/vergleich/VergleichDetailPage.tsx` to
   co-locate the parent + child of `/vergleich/...`.

2. **Desktop card grid layout for 6 products.** Mock shows 4-wide.
   Options: (a) 3-wide → 2 rows of 3 desktop, (b) 6-wide desktop
   single row, (c) 4-wide with 2nd row of 2 (matches mock). Match
   PR 9 pro/contra: **recommend 3-wide → 2×3 tablet → 1-wide scroll-
   snap phone** (mirrors the established pattern for 6-product grids).

3. **Combine-mode behaviour at `/vergleich/details`.** Compare-only,
   per plan. Options: (a) EmptyState pointing user to Mein Plan,
   (b) silent redirect to `/`, (c) render an EmptyState with CTA to
   switch to compare mode. Recommend (a) — same posture as Vertrag-
   Detail's compare-mode empty-state.

4. **AVD + Riester per-card copy.** Mock shows 4 products (ETF, Basisrente,
   bAV, pAV) only. AVD and Riester need a Steuerrückerstattung label
   structure consistent with Basisrente; confirm voice + label set
   against PR 9's pro/contra copy file before writing inline.

## Optional stretch — none

PR 10 is the second-largest single-PR scope after PR 9. Don't bundle
PR 11 (Print + cross-cutting tests) into this session. PR 11 is the
final closer — it touches PrintReport (P0 disclaimer guardrail) AND
runs a viewport-coverage test sweep across every redesigned page. It
needs PR 10 stable on main so the cross-cutting test sweep can
exercise the final layout.

## Open follow-ups (do not fix in PR 10 unless you happen to touch the file)

- **#279** — Pre-existing Versorgungsfreibetrag 2021/2022 cohort bug
  in `src/rules/legalConstants.ts`. Wrong-number-fix with full
  preflight; needs its own PR with regression test.
- **CombineDetailView.tsx retirement** — still used by the combine-
  mode "Details & Export" tab body; not in PR 10's scope unless you're
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

## Constraints — non-negotiable

1. **DisclaimerBanner** stays on `sessionStorage`. AppShell renders
   it. `PrintReport.tsx` keeps its own. Both are P0.
2. **No new network calls.** Self-host any new fonts. No CDN fetches.
3. **Brand:** `RentenWiki` in chrome, `RentenWiki.de` in titles / OG
   / exports. Never "Rentenrechner" in public copy.
4. **No statutory values outside `src/rules/`.** Sweep every literal
   in new files before opening the PR. The "Verfügbar ab: 62 J." /
   "67 J." Verfügbarkeit text derives from engine / product metadata,
   never hardcoded.
5. **Engine untouched.** Page consumes existing simulation results.
   No new engine entry points; no changes to
   `simulateRetirementComparison` / `simulatePortfolio` /
   `combinePortfolio` shape.
6. **Workspace `schemaVersion: 2` unchanged.** No new top-level
   workspace fields, no new migrations.
7. **`PRODUCT_REGISTRY` not bypassed.** All 6 product cards derive
   from the registry. No hardcoded product lists.
8. **Page-level state, prop-driven children.** Every card / row
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
12. **Filter chips** (if added) use button-group semantics:
    `role="group"` + `aria-pressed`. NO `role="tablist"` /
    `role="tab"` / `aria-selected`.
13. **Tap target ≥ 44 px** at every viewport.
14. **Stylelint font-family quoting:** unquoted single-word names
    (Newsreader), double-quoted multi-word names ("IBM Plex Sans").
    NO `word-break: break-word` — use `word-break: normal;
    overflow-wrap: anywhere;`.
15. **camelCase for exported constants** in new code. Existing
    UPPER_SNAKE_CASE constants stay.
16. **`interface` for object shapes, `type` for unions/aliases.**
    PR 288 R0 lesson.
17. **`aria-hidden="true"` is NOT an empty-state pattern.** PR 288
    R1 own-goal. Empty-state explanations must remain readable by
    assistive tech.
18. **Every euro display goes through `formatCurrency`.** No
    `toLocaleString` rolls, even for metadata lines.
19. **No JS carousel.** Phone scroll-snap is pure CSS
    (`scroll-snap-type: x mandatory` + `scroll-snap-align: start`).
20. **Dynamic age labels.** Headers / labels adjacent to retirement-
    age-derived values use `profile.retirementAge`, not hardcoded "67".

## Working style

- Read the plan + the mock file + existing `VergleichPage.tsx` +
  the data sources (`CashflowTable.tsx`, `FairnessPanel.tsx`) +
  `PRODUCT_REGISTRY` end-to-end before doing anything. Understanding
  the per-product Steuer-line label set is the key data-flow decision.
- Use Plan / Explore agents for broad reading; Read / Grep / Glob
  when you know the file.
- For test edits across many files, use Python (UTF-8 safe) not
  PowerShell.
- Pop options to the user as terse numbered lists when you hit a
  real decision (see "Decisions to surface" above). Don't restate
  locked decisions.
- Test at all three viewports.
- End-of-turn summaries: one or two sentences.
- Plan for 2-4 review rounds.
- **Monitor reviewer activity on three endpoints**: `/issues/{n}/
  comments`, `/pulls/{n}/reviews`, `/pulls/{n}/comments`. Codex's
  green signal arrives via issue comments + 👍 reaction. **After
  EVERY fix commit, post `gh pr comment <N> --body "@codex review"`**
  — Codex does not auto-trigger. Then wait for the 👀 reaction +
  ~1-3 min before re-checking.
- Each round, sweep CodeRabbit comments for "duplicate (N)" collapses
  and stale reviews on old commits — don't trust the headline
  "Actionable comments posted" count alone. The in-progress
  comment's HEAD SHA is the source of truth for which commit is
  actually under review.
- For the merge: drop `--delete-branch` to dodge the worktree gotcha;
  delete the remote ref via `gh api -X DELETE` after merge.

## First step

1. Read `docs/redesign/implementation-plan.md` §6 PR 10 lines 256–264
   + §4 line 98 (scroll-snap rule) + §5 compliance guardrails.
2. Read the breakdown artboard in
   `.scratch/redesign-handoff-v2/rentenrechner/project/direction-d-pages.jsx`
   (grep `DProductBreakdown`, `Wohin`, `Ansparphase`) and the
   responsive variants (`MVergleichDetail`, `TVergleichDetail`) in
   `responsive-views.jsx`.
3. Read `src/features/vergleich/VergleichPage.tsx` end-to-end — your
   parent surface. Note how `selectedResults` flows in.
4. Read `src/features/cashflows/CashflowTable.tsx` and
   `src/features/results/FairnessPanel.tsx` — your data composition
   helpers. The breakdown card body restyles their underlying data.
5. Read `src/features/mein-plan/MeinPlanPage.tsx` and
   `src/features/vertrag-detail/VertragDetailPage.tsx` as canonical
   Sober D page references.
6. Read `src/app/useRoute.ts` for the Route union; you'll add
   `{ kind: 'vergleich-detail' }`.
7. Read `src/engine/products/<each>.ts` quickly to confirm Verfügbarkeit
   logic: which products lock until 62, which until 67, which are
   jederzeit-verfügbar. Source: `PRODUCT_REGISTRY` metadata + per-
   product payout-mode constraints.
8. Branch: `git checkout -b feat/redesign-wohin origin/main`.
9. Report your call to the user with: proposed file list (added /
   modified / deleted), page-folder decision (plan path vs.
   convention), desktop card grid layout for 6 products, combine-
   mode empty-state posture, AVD + Riester per-card copy source.
   Ask for go.
```

---

## Repo state at handoff

- `main` is at squash commit `495d9aa` (PR #288 — feat(vergleich):
  Sober D 6-product comparison + pro/contra grid, PR 9).
- Previous landings: `3addbb9` (PR #287 — Kapital, PR 8), `3bc930a`
  (PR #286 — Vertrag-Detail, PR 7), `0478682` (PR #284 — Mein Plan
  combine, PR 6), `5a56bec` (PR #283 — combine-mode `/eingaben`),
  `61a0e50` (PR #281 — Deine Angaben, PR 5), `13fdde5` (PR #278 —
  Methode, PR 4), `7505dbe` (PR #275 — Artikel hub, PR 3), `a646443`
  (PR #273 — landing, PR 2), `8513882` (PR #270 — chrome, PR 1).
- `feat/redesign-vergleich` and `feat/redesign-kapital` branches
  deleted on remote; local refs pruned.
- A `Rentenrechner-conflict-auto` sibling worktree still holds main
  checked out; local `git checkout main` fails. Branch from
  `origin/main` directly.
- Local working tree may still have `.scratch/redesign-handoff-v2/`
  and `.scratch/redesign-handoff/` untracked — intentional, do not
  commit the bundles.
- Issue #279 (cohort bug) — see "Open follow-ups" in the orchestrator
  prompt.

## Where the PR-9 patterns live

- `src/features/vergleich/VergleichPage.tsx` — canonical compare-mode
  landing surface. Reads `workspace.mode` and `useCalculatorState()`
  / `useSimulationResult()` at page level, drives child components
  via props. Doc-title `useEffect` placed before conditional returns.
- `src/features/vergleich/VergleichComparisonTable.tsx` — table-to-
  phone-card pattern via `useViewport()`. Receives `retirementAge`
  as an explicit prop (PR 288 R1 lesson — never hardcode "67").
- `src/features/vergleich/VergleichProContraGrid.tsx` — 6-product
  card grid (3-wide → 2-wide → 1-col). Mirror for PR 10's card grid.
- `src/features/vergleich/VergleichRenditeStrip.tsx` — pill row
  pattern (button-group ARIA, formatCurrency for the €/Mon. text).
- `src/content/proContraCopy.ts` — registry-driven content file
  pattern. `interface ProContraEntry` (not `type`) holds the readonly
  object shape. Mirror for any PR 10 per-product content.
- `src/features/methode/MethodeMonteCarloSection.tsx` — split-fallback-
  states pattern (NOT-mounted / disabled / empty-products / panel).
  Empty-state uses no `aria-hidden`; the explanation must remain
  readable by assistive tech.
- `src/features/vertrag-detail/VertragFeeImpact.tsx` — single-chart
  page-density adoption pattern (consumes `useChartDensity`). Not
  directly mirrored by PR 10 (no charts) but useful as a sibling drill-
  in reference.
- `src/app/useRoute.ts` — tagged-union `Route` after PR 9. Add the
  `kind: 'vergleich-detail'` variant + `ROUTES.vergleichDetail`
  constructor + `routeToPath` + `pathToRoute` cases.
- `src/utils/format.ts` — `formatCurrency(value, decimals)` is the
  single euro formatter. Use everywhere — even metadata lines.

## PR 9 review iteration — what to expect repeating

Reviewers flagged each of these patterns in PR 288. Pre-empt them in
PR 10:

| Pattern | Round flagged | Action |
|---|---|---|
| Hardcoded retirement age in labels ("Kapital mit 67") | R1 (Codex P2 ×2) | Thread `profile.retirementAge` via props; `Mit {retirementAge}, einmalig` in section headers. |
| `Math.round(value).toLocaleString('de-DE')` for euro display | R0 (CodeRabbit Major) | Always use `formatCurrency(value, 0)` from `src/utils/format.ts`. |
| `type ObjectShape = { ... }` for multi-property records | R0 (CodeRabbit Major) | `interface ObjectShape { ... }` per TS convention. |
| `word-break: break-word` (deprecated) | R0 (CodeRabbit Major) | `word-break: normal; overflow-wrap: anywhere;`. |
| `aria-hidden="true"` on empty-state explanation | R1 (CodeRabbit Major, own-goal from R0 fix) | Render without `aria-hidden`; optionally omit `aria-live` to keep silent. |
| Conflated fallback states with one `aria-live` polite branch | R0 (CodeRabbit Minor) | Split into not-mounted (return null) / disabled (aria-live polite) / empty-products (accessible non-live). |
| Hardcoded tick `fontSize` in custom Recharts tick component | R0 (CodeRabbit Minor) | Forward density tokens via prop. |
| Codex doesn't auto-re-trigger | every commit | Post `@codex review` after every push; wait for 👀 reaction; allow 1-3 min before re-checking. |

## Working tree state

Untracked at handoff (don't commit):
- `.scratch/redesign-handoff-v2.tar.gz` — original handoff bundle archive.
- `.scratch/redesign-handoff-v2/` — extracted bundle.
- `.scratch/redesign-handoff/` — older bundle iteration.
- `docs/redesign/handoff-pr8-onwards.md` — kept for chain-back.
- `docs/redesign/handoff-pr9-onwards.md` — previous session's
  paste-able prompt.
- `docs/redesign/handoff-pr10-onwards.md` — **this file**.

The current local branch may still be `feat/redesign-kapital` (now
orphaned — remote ref deleted). Switch to a fresh branch from
`origin/main` to start PR 10:

```
git checkout -b feat/redesign-wohin origin/main
```
