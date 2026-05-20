# Redesign Handoff — PR 8 onwards

> **Status:** Handoff prompt for a fresh session.
> **Last updated:** 2026-05-20.
> **Previous session landed:**
> - PR 7 — Vertrag im Detail at squash commit `3bc930a`, merged via #286 (**5 review rounds R0–R4**, ~2h elapsed). Both Codex and CodeRabbit returned 0 findings on the final commit `7ae6458`.
>
> **Next up:** PR 8 — **Kapital & Auszahlungen** (per plan §6). Full-page lifecycle chart + Wendepunkte table at the new `/kapital` route. Introduces the first **shared chart-density primitive** (`src/ui/charts/useChartDensity.ts`). Estimated ~5 days incl. mobile + chart density work.

---

## Paste this as the new session's orchestrator prompt

```
You are orchestrating PR 8 of a multi-PR UI redesign for the Rentenrechner
repo (German retirement calculator, public name "RentenWiki.de"). Working
dir is C:\Users\Peter\Coding_Projects\Rentenrechner.

## Sources of truth (read these before doing anything)

1. **docs/redesign/implementation-plan.md** — binding plan for the whole
   redesign. PR 8 spec is in §6 ("Kapital & Auszahlungen"). PR 8 has
   no dedicated §8 risk, but the new chart-density primitive touches
   §8 risk #3 (Recharts responsive surface) — every chart in the codebase
   eventually flows through this hook.
2. **docs/redesign/handoff-pr8-onwards.md** — this file. Documents
   conventions and pitfalls established by PR 0–7 + PR 283 + PR 286.
3. **docs/redesign/handoff-pr7-onwards.md** — still authoritative for
   the conventions that did not change in PR 7; this new file carries
   only the deltas. Chain back through it for anything earlier.
4. **.scratch/redesign-handoff-v2/rentenrechner/project/direction-d-pages.jsx**
   — Kapital artboard ("M5 · Kapital & Auszahlungen" or similar; grep
   `Kapital`). Sober D, same chrome as Mein Plan / Vertrag-Detail.
5. **.scratch/redesign-handoff-v2/rentenrechner/project/responsive-views.jsx**
   — `MKapital` (phone) and `TKapital` (tablet) variants.
6. **CLAUDE.md** — project guide. The "Review guidelines" P0/P1 ladder
   binds every PR. PR 8 modifies `BreakEvenChart.tsx`; the
   "UI chart conventions" block (lifecycle chart shared-benchmark rule,
   open-ring Leibrente-crossover markers, off-frame crossover text
   callout) is binding.
7. **CONTEXT.md** — domain glossary. Kapital & Auszahlungen surfaces
   accumulation + payout streams across both modes (compare singletons
   AND combine instances).

## What's already shipped (do not redo)

- **AppShell** (`src/ui/chrome/AppShell.tsx`) — DisclaimerBanner +
  StatusBar + AppHeader + body + MethodFooter + MobileNav.
- **Sober D routes** — `/methode` (PR 4), `/eingaben` (PR 5), `/` Mein
  Plan combine-mode body (PR 6), `/vertrag/:instanceId` (PR 7). White
  bg, IBM Plex Sans body, mono `§` section labels, stable section ids.
- **Editorial A routes** — `/` landing (PR 2 compare-mode / first-visit),
  `/artikel` (PR 3 hub + individual articles).
- **`/eingaben` is mode-aware** via `src/app/useAngabenState.ts`
  (PR 283).
- **Mein Plan (combine-mode)** in `src/features/mein-plan/MeinPlanPage.tsx`
  (PR 6). § 1 Zusammensetzung + § 2 Sensitivität.
- **Vertrag-Detail** in `src/features/vertrag-detail/VertragDetailPage.tsx`
  (PR 7). § 1 KPI strip + § 2 "Was wäre, wenn …" scenario table + § 3
  "Wie wir das berechnen" provenance list + right-rail Vertragsdaten.
- **`OptimiereVorsorgeModal` is deleted** (PR 7). The per-contract
  decisions surface lives in Vertrag-Detail now. `auditPortfolio` /
  `createDecisionSimulationCache` survive — reuse them if Kapital page
  ever needs decision-aware data.
- **`Route` is a tagged discriminated union** (PR 7). `kind: 'home' |
  'eingaben' | 'methode' | 'artikel' | 'impressum' | 'datenschutz' |
  'vertrag' | 'notFound'` (plus the `artikel` slug payload and `vertrag`
  instanceId payload). PR 8 will add a `kind: 'kapital'` variant.
- **`ROUTES` constructors + `routeToPath` + `pathToRoute` round-trippers**
  in `src/app/useRoute.ts` (PR 7). All `href` attrs in the codebase go
  through `routeToPath(ROUTES.x)` now — never literal string paths.
- **SPA-link progressive-enhancement pattern** — always render `<a>`
  with `href={routeToPath(target)}`, intercept click only when
  `navigate` AND `shouldUseSpaNavigation(event)` both hold. Modified-
  click / right-click → open-in-new-tab keeps working. This is the
  pattern your filter chips / "weiter zum Vertrag-Detail" affordances
  must follow.
- **`workspace.mode` is the canonical page-level mode signal** (PR 286
  R2). `detectSavedMode()` is a storage/URL hint and should NOT gate
  empty-state rendering. Always use the loaded workspace state.
- **`PRODUCT_EVIDENCE_FIELDS` in `src/utils/evidence.ts`** is the
  canonical evidence-key registry. Any component that reads
  `instance.evidenceMap[key]` MUST use a key from this map. Fee fields
  use DOTTED paths (`fees.wrapperAssetFee` / `fees.fundAssetFee`); bAV
  employer subsidy uses `contractualMatchPercent`. Misalignment shows
  confirmed inputs as "Modellwert" forever (PR 286 R2 / Codex P2).
- **`RightRailAccordion`** in `src/ui/chrome/RightRailAccordion.tsx` —
  use this for any new aside. Used by `VertragMetadataAside.tsx`.
- **Provenance primitives** in `src/features/results/provenance.tsx`
  (`ProvLabel`, `FieldWithProv`) + `provenanceHelpers.ts`
  (`evidenceStateToProvKind`). Reused on Vertrag-Detail § 2.
- **`beitragSenkenWhatIf`** alongside `beitragErhoehenWhatIf` and the
  full `beitrag-senken` decision atom kind (PR 7). The atom registry
  now covers six contract decisions: weiterfuehren, beitrag-erhoehen,
  beitrag-senken, beitragsfrei, kuendigen, uebertragen.
- **Self-hosted fonts**, **`__RW_BUILD_DATE__` Vite define**,
  **DisclaimerBanner on `sessionStorage`** — all PR 1+ infrastructure.

## Conventions established by PR 1-7 + PR 283 + PR 286 — follow these

Carry forward from PR 7 handoff still applies (SPA-navigation guards,
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
status differentiation in UI copy). Read the PR 7 handoff if any are
unfamiliar.

NEW conventions hardened in PR 7 + PR 286:

- **Every `href` derives from `routeToPath(ROUTES.x)`.** Literal
  `href="/"` / `href="/eingaben"` strings are P1 nits — CodeRabbit will
  flag them every round until they're gone. R3 fixed the `EmptyState`
  href; R4 fixed the back-link and edit-link. The grep `href="/"` /
  `href="/eingaben"` will surface the remaining places — most are
  out-of-scope for PR 8 but if you touch a file with one, fix it.

- **Doc-title `useEffect` for routes outside `publicRouteRegistry`.**
  `/vertrag/:instanceId` was the first such route; `/kapital` will be
  the second if it isn't added to the SEO registry (likely not — the
  page is tool-internal, not topic-landing). Use the
  `VertragDetailPage` pattern: `useEffect(() => { document.title =
  documentTitle }, [documentTitle])` placed BEFORE any conditional
  return so React's Rules of Hooks aren't violated.

- **URI-decode segments inside a try/catch.** If `/kapital` ever takes
  a dynamic segment (it shouldn't, per plan §6), match the PR 7 pattern
  in `pathToRoute` — wrap `decodeURIComponent` in `try { … } catch {
  return ROUTES.notFound }`.

- **Non-finite number guards before writing engine state.** Any
  setter that accepts user input and reaches the engine must reject
  `NaN` / `±Infinity` up front: `if (!Number.isFinite(value)) return`.
  PR 286 R1 added this to `beitragSenkenWhatIf` /
  `beitragErhoehenWhatIf`. Kapital page's filter / time-horizon /
  what-if controls (if any) must do the same.

- **`Workspace.mode` literal type is `'compare' | 'combine'`.** The
  loaded workspace is the source of truth, NOT `detectSavedMode()`.

- **EmptyState pattern with `ctaTarget: Route` + `routeToPath` href.**
  Vertrag-Detail has a local `EmptyState` helper component that
  renders an explicit "not found" / "wrong mode" surface with a back-
  link. If Kapital page has an analogous empty state (e.g. "Kapital
  & Auszahlungen ist nur im Plan-Modus verfügbar" if it ends up
  combine-only), reuse the same shape: `href={routeToPath(ctaTarget)}`
  on the anchor, `onClick` intercepts SPA-only.

- **Page-level data hooks, prop-drive children.** `usePortfolioState`
  and `useCombineSimulation` (or their compare-mode equivalents) are
  called ONCE at the page level. Sub-components (chart panels, KPI
  rows, Wendepunkte rows) take live data via props — same pattern as
  Vertrag-Detail's KPI strip / scenario table / provenance list /
  metadata aside.

- **Scenario default selection: `'basis' ??first`** — never index
  `returnScenarios[0]`. PR 7 uses `scenarios.find(s => s.id ===
  'basis') ?? scenarios[0]`. Any chart-density logic that picks a
  default scenario MUST follow this.

## Review-loop reality (UPDATED from PR 286)

- **Plan for 4–6 review rounds.** PR 286 took 5 rounds (R0–R4); PR 6
  took 7. Each round produced 1–3 findings; later rounds shifted to
  hardcoded-href nits and copy polish. The user has explicitly said
  "0 findings including 0 nitpicks" — treat 🟡 minor and trivial
  "non-finding observations" as must-fix.

- **Codex's green signal lives in issue comments, not formal reviews.**
  When Codex has no findings, it posts an issue comment with literal
  phrasing like `"Codex Review: Didn't find any major issues. Bravo."`
  or `"Can't wait for the next one!"` — NOT a formal review and NOT a
  thumbs-up reaction. Poll `/repos/{owner}/{repo}/issues/{n}/comments`
  for `chatgpt-codex-connector[bot]`, not just `/pulls/{n}/reviews`
  and `/pulls/{n}/comments`.

- **CodeRabbit's `SUCCESS` status check is the explicit approve
  signal.** Watch `statusCheckRollup` for context `"CodeRabbit"` with
  state `"SUCCESS"`. When that's green AND Codex's "no major issues"
  comment is posted, the PR is mergeable.

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

- **CodeRabbit re-tracks line comments forward.** Old `commit_sha`
  fields on line comments update to the latest commit when CR still
  considers them open. Don't read `commit_sha` as proof of re-review
  — read the review-list submitted_at timestamps and the in-progress
  comment's Run ID.

- **Both reviewers converge.** Final merge signal: CodeRabbit emits
  `SUCCESS` status check AND Codex says "Didn't find any major
  issues" (or equivalent green phrasing). This was the PR 286
  convergence at round 5.

## CI workflow gating reminder

`feat/redesign-*` and `feat/angaben-*` branches do NOT trigger the
agent-only workflows (`pr-verify` / `claude-review` / `review-loop`).
Those are gated to `agent/issue-*` and `automation/retro-curate-*`
branch prefixes. So `npm run verify` runs locally in the implementer's
worktree, NOT in CI. You MUST verify locally before merge. The
Cloudflare `Workers Builds: rentenwiki` check runs on all branches;
treat it as the only meaningful CI signal for `feat/*` PRs.

## The `gh pr merge --delete-branch` worktree gotcha (PR 286 lesson)

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
local branch needs no API call.

## Your job — PR 8: Kapital & Auszahlungen

Start from a clean branch off main:
`git checkout -b feat/redesign-kapital origin/main`.

> The sibling worktree `Rentenrechner-conflict-auto` still holds main
> checked out, so `git checkout main` fails locally. Always branch
> from `origin/main` directly.

Goal per plan §6 PR 8: full-page lifecycle chart + Wendepunkte table at
route `/kapital`. Introduces `useChartDensity` for viewport-aware
Recharts tuning. Estimated ~5 days incl. mobile + chart density work.

**Kapital & Auszahlungen layout (per mock):**

- Header: kicker "Mein Plan › Kapital & Auszahlungen", H1 with one
  headline number (likely "Kapital mit Renteneintritt" in oxblood) and
  back link to Mein Plan. AppHeader pattern from existing Sober D
  pages.
- **§ 1 Filter chips** — viewport-aware chip row that wraps on phone.
  Scopes the chart: "Alle Verträge" / per-product / per-instance
  selections. Registry-driven (PRODUCT_REGISTRY); never hardcoded.
- **§ 2 Lifecycle chart** — full-width `BreakEvenChart.tsx` adopting
  the new `useChartDensity` hook for tick / legend density. Keep
  CLAUDE.md "UI chart conventions" intact:
  - Single neutral dotted line for cumulative net paid-in (shared
    benchmark across products).
  - Product color only for product-specific lines: solid = remaining
    capital, dashed = cumulative net payouts.
  - Filled marker = first age payouts cover paid-in.
  - Open-ring marker = Leibrente product overtaking a Kapitalverzehr
    product (`findLeibrenteCrossovers`).
  - Off-frame crossovers surface as text callout below the chart.
- **§ 3 Wendepunkte table** — turning-point rows: "Sparphase endet
  Alter N", "Auszahlung ≥ Einzahlung Alter N", "Letzte Auszahlung
  Alter N" etc. One row per scenario / product selection. Color
  rules consistent with Vertrag-Detail's scenario table: positive
  delta neutral ink, negative delta oxblood. NO winner highlight.

**Right rail** = `RightRailAccordion` with metadata: "Renditeannahme",
"Inflationsannahme", "Steueransatz", "Kosten" — pulled from the active
`ScenarioAssumptions`. Same prop-drive pattern as Vertrag-Detail's
metadata aside. Phone collapse via the accordion component.

**Mobile (phone <640 px):**
- Filter chips wrap to multiple rows; tap target ≥44 px.
- Chart axes thinned via `useChartDensity` (fewer ticks, no legend,
  larger tooltip font).
- Wendepunkte table → vertical row blocks (one per turning-point,
  label/value pairs).

**Files added:**
- `src/features/results/KapitalPage.tsx` — page entry. Mirror the
  PR 7 module-layout decision (consider co-locating sub-components
  under `src/features/kapital/` for module-map cleanliness if the
  page grows beyond ~400 lines).
- Per-section components co-located: filter chips, chart wrapper,
  Wendepunkte table, metadata aside. Small + pure where possible.
- `src/ui/charts/useChartDensity.ts` — viewport-aware Recharts
  density hook. Returns `{ tickCount, legendVisible, fontSize,
  tooltipFontSize, … }` keyed off a `useChartDensity('phone' |
  'tablet' | 'desktop')` argument or a `useMediaQuery`-style
  detector. Keep the hook React-free of any chart library imports
  — it's a generic density-token provider, charts consume it.

**Files modified:**
- `src/app/useRoute.ts` — extend `Route` union with `{ kind:
  'kapital' }`, add `ROUTES.kapital` constructor, extend the
  `routeToPath` + `pathToRoute` switches. Add a regression test
  to `useRoute.test.ts` covering the new variant (round-trip via
  `pathToRoute(routeToPath(ROUTES.kapital))`).
- `src/App.tsx` — render `KapitalPage` for the matched route.
- `src/features/results/BreakEvenChart.tsx` — adopt
  `useChartDensity` for narrow-width tuning. Lifecycle conventions
  in CLAUDE.md ("UI chart conventions") still apply. Do NOT change
  the chart's data composition — only the density / axis / legend
  parameters.
- `src/features/mein-plan/MeinPlanPage.tsx` — wire "Kapital im
  Verlauf" or similar link from § 1 / § 2 to navigate to `/kapital`
  if the mock requires (check the artboard). SPA-navigation safe.
- `src/features/vertrag-detail/VertragDetailPage.tsx` — if the
  per-contract page surfaces a "siehe Kapital & Auszahlungen" link,
  wire it. Otherwise skip.
- `scripts/prerender.mjs` — `/kapital` is NOT prerendered (reads
  workspace state).
- `public/_redirects` and `vercel.json` — confirm `/kapital` falls
  through to the SPA shell (likely already covered by a wildcard).
- `CONTEXT.md` module map — add the new `/kapital` route + Kapital
  page surfaces. Update the route table.
- `CLAUDE.md` "Quick navigation" — add a row for "Edit Kapital &
  Auszahlungen view" and a row for "Tune viewport chart density".

**Files deleted (at end of PR):** None planned. Verify no orphan
`MonteCarloPanel` / `FeeDragChart` callers in compare-mode results
need re-routing now that the chart moves to its own page (plan §4
default: "MonteCarloPanel + FeeDragChart removed from Mein Plan /
Vergleich main views. MC → integrated into Methode (Renditeannahmen).
Fee drag → single line on Vertrag im Detail.").

**Route shape:**

`/kapital` is static (no dynamic segment) — easier than PR 7's
`/vertrag/:instanceId`. Just extend the tagged union with the new
`kind`, add an entry to the switch in `pathToRoute` / `routeToPath`,
and you're done. Pattern:

```ts
// src/app/useRoute.ts (additions)
export type Route =
  | … existing variants
  | { kind: 'kapital' }

export const ROUTES = {
  … existing constructors
  kapital: { kind: 'kapital' } as const,
}

// pathToRoute additions
case '/kapital': return ROUTES.kapital

// routeToPath additions
case 'kapital': return '/kapital'
```

Add a `useRoute.test.ts` case asserting the round-trip and that the
path matches `/kapital` exactly (no trailing slash, no query).

**Mode handling (key decision for the implementer):**

Kapital page surfaces lifecycle data that exists in BOTH compare and
combine modes:
- Compare mode: per-product lines for the visible products in the
  current `ScenarioAssumptions.visibleProducts` array.
- Combine mode: per-instance + per-product lines for the workspace.

Decision the implementer must make and document in the PR body:
1. **One page, dual sourcing.** `KapitalPage` reads `workspace.mode`
   at the page level and dispatches to a compare-mode renderer vs. a
   combine-mode renderer.
2. **Combine-only.** Compare-mode users see an `EmptyState` with a
   "switch to Mein Plan" CTA — matches Vertrag-Detail's posture.

Recommendation: **(1) dual sourcing** — both modes already surface
lifecycle data via `BreakEvenChart` in their respective result panels;
the new page is a fuller view of the same data. Compare-mode users
should NOT lose access. Match Mein Plan's compare-mode landing
behaviour where applicable.

**Acceptance criteria (verify before opening PR):**
- `npm run verify` green locally (3234+ tests + workers + build +
  prerender + lint).
- Kapital page renders at 390 / 820 / 1280 px with all three
  viewports tested.
- Filter chips: wrap on phone, single row on desktop.
- Chart: `useChartDensity` produces visibly different tick / legend
  density at phone vs. desktop; chart still renders correctly at all
  viewports.
- Wendepunkte table: 3-column desktop / tablet, vertical row blocks
  on phone.
- Right-rail metadata reads from `ScenarioAssumptions` via props.
- Both modes render correctly (or compare-mode shows the explicit
  `EmptyState` if decision (2) is taken).
- Mein Plan link (if added) navigates SPA-safely to `/kapital`.
- All `href` attrs go through `routeToPath(ROUTES.x)`. Grep for
  literal `href="/"` and `href="/kapital"` in the new files —
  zero matches.
- Doc-title `useEffect` set: "Kapital & Auszahlungen | RentenWiki.de"
  (or contract-name variant if the page is per-instance).
- DisclaimerBanner still session-dismissable.
- Single JSON-LD via head pipeline (no inline `<JsonLd>`).
- Every statutory value traces to `src/rules/legalConstants.ts` or
  `activeRules`.
- Workspace `schemaVersion: 2` unchanged. `migrateAndValidateState`
  / `validateWorkspace` stay single funnels.
- `BreakEvenChart` regression tests still pass after the
  `useChartDensity` adoption.
- Lifecycle chart conventions intact (open-ring crossover markers,
  off-frame text callout, neutral dotted shared-benchmark line).
- No regression on the existing MeinPlanPage + VertragDetailPage
  tests.
- Pre-render works for `/kapital` (workspace-state-dependent — likely
  excluded from `hydrateStable` allowlist).

## Optional stretch — none

PR 8 introduces the first reusable chart-density primitive and the
first dual-mode-aware results page. Do not bundle PR 9 (Vergleich) or
PR 10 (Wohin geht das Geld) into this session. PR 9 is the
6-product comparison table redesign — separate ~6-day scope.

## Open follow-ups (do not fix in PR 8)

- **#279** — Pre-existing Versorgungsfreibetrag 2021/2022 cohort bug
  in `src/rules/legalConstants.ts`. Wrong-number-fix with full
  preflight; needs its own PR with regression test.
- **Sidebar deletion completion** — PR 6 removed the sidebar from
  Mein Plan only; PR 9 (Vergleich) finishes the deletion for
  compare-mode dashboards. MeinPlanSidebar.tsx + meinPlanPanes.ts
  orphans persist.
- **CombineDetailView.tsx retirement** — still used by the combine-
  mode "Details & Export" tab body; not in PR 8's scope.
- **PR 6 5th sensitivity row (bAV → ETF counterfactual)** — flagged
  in PR 6 retro as deferred.
- **`href="/"` / `href="/eingaben"` literal hrefs** in
  LegalLayout.tsx, ArticleLayout.tsx, MethodePage.tsx,
  PageNotFound.tsx, AngabenPage.tsx, MeinPlanPage.tsx — surveyed by
  the PR 286 R4 agent; not in PR 8's scope unless you happen to
  touch one of these files.
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
   in new Kapital components before opening the PR.
5. **Engine untouched.** Kapital page consumes existing simulation
   results. No new engine entry points, no changes to
   `simulateRetirementComparison` / `simulatePortfolio` /
   `combinePortfolio` shape.
6. **Workspace `schemaVersion: 2` unchanged.** No new top-level
   workspace fields, no new migrations.
7. **`PRODUCT_REGISTRY` not bypassed.** Filter chips derive from the
   registry. No hardcoded product lists.
8. **Page-level state, prop-driven children.** Every chart / KPI /
   row component takes live data via props. `usePortfolioState` and
   simulation hooks are called ONCE at the page level.
9. **Exhaustive switches** over `ProductId`,
   `InstanceCommon['status']`, decision-atom kinds, evidence states,
   chart-density tiers ('phone' | 'tablet' | 'desktop'), and any
   other union you dispatch on. Default branch must be `const _:
   never = value`.
10. **Lifecycle chart conventions intact.** The shared-benchmark
    dotted line, open-ring crossover markers, off-frame text
    callout, blue+green stack fee-drag invariant — all per
    CLAUDE.md "UI chart conventions". `useChartDensity` may tune
    tick count / legend visibility / font sizing only. Data
    composition is off-limits.
11. **`routeToPath(ROUTES.x)` for every `href`.** Literal path
    strings are a guaranteed CodeRabbit nitpick.
12. **`workspace.mode` for mode gating**, not `detectSavedMode()`.
13. **`PRODUCT_EVIDENCE_FIELDS` is the source of truth for evidence
    keys** if Kapital page surfaces any provenance pills.

## Working style

- Read the plan + the mock file + existing `BreakEvenChart.tsx` end-
  to-end before doing anything. The chart's data shape is the input
  to your `useChartDensity` design.
- Use Plan / Explore agents for broad reading; Read / Grep / Glob
  when you know the file.
- For test edits across many files, use Python (UTF-8 safe) not
  PowerShell.
- Pop options to the user as terse numbered lists when you hit a
  real decision. Don't restate locked decisions.
- Test at all three viewports.
- End-of-turn summaries: one or two sentences.
- Plan for 4–6 review rounds.
- **Monitor reviewer activity on three endpoints**: `/issues/{n}/
  comments`, `/pulls/{n}/reviews`, `/pulls/{n}/comments`. Codex's
  green signal arrives via issue comments.
- Each round, sweep CodeRabbit comments for "duplicate (N)" collapses
  and stale reviews on old commits — don't trust the headline
  "Actionable comments posted" count alone. The in-progress
  comment's HEAD SHA is the source of truth for which commit is
  actually under review.
- For the merge: drop `--delete-branch` to dodge the worktree gotcha;
  delete the remote ref via `gh api -X DELETE` after merge.

## First step

1. Read `docs/redesign/implementation-plan.md` §6 PR 8 lines + §4
   defaults (MonteCarloPanel / FeeDragChart relocation) + §5
   compliance guardrails.
2. Read the Kapital artboard in
   `.scratch/redesign-handoff-v2/rentenrechner/project/
   direction-d-pages.jsx` (grep `Kapital`) and the responsive
   variants in `responsive-views.jsx` (`MKapital`, `TKapital`).
3. Read `src/features/results/BreakEvenChart.tsx` end-to-end. Note
   the data shape, the open-ring crossover marker logic, and the
   off-frame callout — these are invariants you must preserve.
4. Read `src/app/useRoute.ts` end-to-end (PR 7 reshaped this — the
   tagged-union shape is now in place; you're just adding one
   variant).
5. Read `src/features/vertrag-detail/VertragDetailPage.tsx` for the
   prop-drive + EmptyState + doc-title patterns to mirror.
6. Read `src/features/mein-plan/MeinPlanPage.tsx` to understand
   where the navigate call to `/kapital` would land (likely a § 1 or
   § 2 link).
7. Decide: dual-sourcing (recommended) vs. combine-only Kapital
   page. Read the artboard before deciding.
8. Decide: where does `useChartDensity` live (`src/ui/charts/`
   recommended, but `src/ui/` works too) and what tokens does it
   return.
9. Branch: `git checkout -b feat/redesign-kapital origin/main`.
10. Report your call to the user with: proposed file list (added /
    modified / deleted), dual-mode vs. combine-only decision,
    `useChartDensity` token surface, any architectural questions
    (e.g. should chart-density live in `src/ui/` or a new
    `src/ui/charts/` namespace, should `BreakEvenChart` take the
    hook directly or accept density tokens as props), and any
    deviations from the plan. Ask for go.
```

---

## Repo state at handoff

- `main` is at squash commit `3bc930a` (PR #286 — feat(vertrag-detail):
  per-contract drill-in at /vertrag/:instanceId, PR 7).
- Previous landings: `0478682` (PR #284 — Mein Plan combine-mode redesign,
  PR 6), `5a56bec` (PR #283 — combine-mode `/eingaben` wiring),
  `61a0e50` (PR #281 — Deine Angaben page, PR 5), `13fdde5` (PR #278 —
  Methode page, PR 4), `7505dbe` (PR #275 — Artikel hub, PR 3),
  `a646443` (PR #273 — landing redesign, PR 2), `8513882` (PR #270 —
  chrome foundation, PR 1).
- `feat/redesign-vertrag-detail` branch deleted on remote;
  `feat/redesign-mein-plan`, `feat/angaben-combine-wiring`,
  `feat/redesign-angaben`, `feat/redesign-methode`, `feat/redesign-articles`,
  `feat/redesign-landing`, `feat/redesign-chrome` all merged and
  cleaned up. Some stale local branches may persist (incl. the now-
  orphan local `feat/redesign-vertrag-detail`); safe to delete.
- A `Rentenrechner-conflict-auto` sibling worktree still holds main
  checked out; local `git checkout main` fails. Branch from
  `origin/main` directly.
- Local working tree may still have `.scratch/redesign-handoff-v2/`
  and `.scratch/redesign-handoff/` untracked — intentional, do not
  commit the bundles.
- Issue #279 (cohort bug) — see "Open follow-ups" in the orchestrator
  prompt.

## Where the PR-7 patterns live

- `src/features/vertrag-detail/VertragDetailPage.tsx` — canonical
  dynamic-route page reference. Doc-title `useEffect` placed before
  early returns (Rules of Hooks), `workspace.mode` gating, local
  `EmptyState` helper, prop-driven KPI / scenario / provenance /
  metadata sub-components.
- `src/features/vertrag-detail/VertragKpiStrip.tsx` — 4-up KPI strip
  pattern. PR 8's KPI strip (if any) should mirror this shape.
- `src/features/vertrag-detail/VertragScenarioTable.tsx` — scenario-
  table pattern with `▸` current-row marker and signed delta column.
- `src/features/vertrag-detail/VertragProvenanceList.tsx` — `§ 2 Wie
  wir das berechnen` reference. Evidence keys MUST match
  `PRODUCT_EVIDENCE_FIELDS`.
- `src/features/vertrag-detail/VertragMetadataAside.tsx` —
  `RightRailAccordion` consumer with prop-drive `instance` data and
  SPA-link edit affordance.
- `src/app/useRoute.ts` — tagged-union `Route`, `ROUTES`
  constructors, `routeToPath` / `pathToRoute` with the
  malformed-URI try/catch. `routeToPath` exhaustive switch over
  `Route['kind']` — adding the new `'kapital'` variant will force
  every existing switch to cover it (which is the point).
- `src/app/useRoute.test.ts` — round-trip tests covering every
  variant + dynamic-segment URL-encoding. Mirror the pattern for the
  new `/kapital` test.
- `src/app/contractDecisions.ts` — extended in PR 7 with
  `beitragSenkenWhatIf` + `defaultBeitragSenkenEUR` +
  `'beitrag-senken'` kind. The `applyContractDecision` writer covers
  all six decision kinds now.
- `src/app/spaNavigation.ts` (`shouldUseSpaNavigation`) — modified-
  click guard. Every SPA `<a>` `onClick` uses this.

## PR 7 review iteration — what to expect repeating

Reviewers flagged each of these patterns in PR 286. Pre-empt them in
PR 8:

| Pattern | Round flagged | Action |
|---|---|---|
| Hardcoded `href="/"` / `href="/x"` | R3, R4 (back-link, edit-link, EmptyState) | Use `routeToPath(ROUTES.x)` from the first commit. |
| URI-decode throws `URIError` | R0, R1 | `try { decodeURIComponent(...) } catch { return ROUTES.notFound }` for any new dynamic-segment route. N/A for static `/kapital`. |
| Non-finite number reaches engine | R0, R1 | `if (!Number.isFinite(value)) return null` before writing to any what-if / filter state. |
| Doc title not set for non-publicRouteRegistry route | R0, R1 | `useEffect(() => { document.title = … }, [deps])` placed before early returns. |
| Empty-state copy: wrong article ("Diese Vertrag"), mismatched quotes | R0, R1 | Proofread German empty-state copy: `Dieser` for masculine, `Diese` for feminine; matched `„…"` quotes around interpolated values. |
| Test name doesn't match test coverage | R0, R1 | Test names list every state asserted (e.g. "rejects offered / surrendered / missing"). |
| Page-level mode gate uses `detectSavedMode()` | R1, R2 | Always use `workspace.mode` from the loaded workspace state. |
| `evidenceMap` keys don't match `PRODUCT_EVIDENCE_FIELDS` | R2 (Codex P2) | Cross-check every `evidenceKey` literal against `src/utils/evidence.ts` before opening the PR. Fee keys are DOTTED (`fees.wrapperAssetFee`). |
| `<a>` only rendered when `navigate` available | R0, R1 | Progressive enhancement: always render `<a href={…}>`, intercept click only when navigate is truthy. |
| Ad-hoc structural field probing instead of typed slot dispatch | R0, R1 | Exhaustive switch on `ProductId` with typed slot reads. Cite the engine's per-slot pipeline (e.g. `portfolioFunding.ts`) in the doc-comment. |

## Working tree state

Untracked at handoff (don't commit):
- `.scratch/redesign-handoff-v2.tar.gz` — original handoff bundle archive.
- `.scratch/redesign-handoff-v2/` — extracted bundle.
- `.scratch/redesign-handoff/` — older bundle iteration.
- `docs/redesign/handoff-pr7-onwards.md` — the previous session's
  paste-able prompt (kept for chain-back reference).
- `docs/redesign/handoff-pr8-onwards.md` — **this file**.

The current local branch is `feat/redesign-vertrag-detail` (now
orphaned — remote ref deleted post-merge). Switch to a fresh branch
from `origin/main` to start PR 8.
