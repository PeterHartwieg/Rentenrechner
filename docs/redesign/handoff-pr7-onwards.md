# Redesign Handoff — PR 7 onwards

> **Status:** Handoff prompt for a fresh session.
> **Last updated:** 2026-05-20.
> **Previous session landed:**
> - PR 6 — Mein Plan (combine mode) at squash commit `0478682`, merged via #284 (**7 review rounds**, ~3.5h elapsed).
>
> **Next up:** PR 7 — **Vertrag im Detail** (per plan §6). Full-page replacement for `OptimiereVorsorgeModal`. Estimated ~6 days. Includes deleting `OptimiereVorsorgeModal.tsx` and adding the first **dynamic route** (`/vertrag/:instanceId`) to the small custom router.

---

## Paste this as the new session's orchestrator prompt

```
You are orchestrating PR 7 of a multi-PR UI redesign for the Rentenrechner
repo (German retirement calculator, public name "RentenWiki.de"). Working
dir is C:\Users\Peter\Coding_Projects\Rentenrechner.

## Sources of truth (read these before doing anything)

1. **docs/redesign/implementation-plan.md** — binding plan for the whole
   redesign. PR 7 spec is in §6 ("Vertrag im Detail"). PR 7 has no
   dedicated risk in §8, but the route-extension touches §8 risk #10
   (storage / migration boundary — `/vertrag/:instanceId` reads an
   instance ID from the URL, which must resolve to a workspace instance
   without bypassing `migrateAndValidateState`).
2. **docs/redesign/handoff-pr7-onwards.md** — this file. Documents
   conventions and pitfalls established by PR 0–6 + PR 283.
3. **docs/redesign/handoff-pr6-onwards.md** — still authoritative for
   the conventions that did not change in PR 6; this new file carries
   only the deltas. The PR 6 handoff also documented PR 5/283 carry-
   forward; chain back through it if anything earlier is unfamiliar.
4. **.scratch/redesign-handoff-v2/rentenrechner/project/direction-d-pages.jsx**
   — Vertrag-Detail artboard ("M4a · Vertrag im Detail" or similar; grep
   `Vertrag`). Sober D, same chrome as Mein Plan / Eingaben / Methode.
5. **.scratch/redesign-handoff-v2/rentenrechner/project/responsive-views.jsx**
   — `MVertrag` (phone) ~lines 506-570 and `TVertrag` (tablet, grep
   for `TVertrag`).
6. **CLAUDE.md** — project guide. The "Review guidelines" P0/P1 ladder
   binds every PR. PR 7 deletes `OptimiereVorsorgeModal` and consumes
   existing `src/app/contractDecisions.ts` atoms — the "Non-obvious
   architecture" section on decision atoms matters here.
7. **CONTEXT.md** — domain glossary (compare/combine, baseline/what-if,
   instance, transfer event, evidence state, combine context). Vertrag
   im Detail lives in combine-mode; the per-instance contract is the
   glossary's `instance` concept.

## What's already shipped (do not redo)

- **AppShell** (`src/ui/chrome/AppShell.tsx`) — DisclaimerBanner +
  StatusBar + AppHeader + body + MethodFooter + MobileNav.
- **Sober D routes** — `/methode` (PR 4), `/eingaben` (PR 5), `/` Mein
  Plan combine-mode body (PR 6). White bg, IBM Plex Sans body, mono
  `§` section labels, stable section ids, module-eval-time fail-fast
  resolvers, right-rail aside that folds to phone accordion.
- **Editorial A routes** — `/` landing (PR 2 compare-mode / first-visit),
  `/artikel` (PR 3 hub + individual articles).
- **`/eingaben` is mode-aware** via `src/app/useAngabenState.ts`
  (PR 283). Compare-mode → STORAGE_KEY_V1; combine-mode → STORAGE_KEY_V2
  via `workspace.baseline.profile` / `workspace.baseline.assumptions`.
- **Mein Plan (combine-mode)** in `src/features/mein-plan/MeinPlanPage.tsx`
  (PR 6). § 1 Zusammensetzung + § 2 Sensitivität; statutory pension
  row in § 1 even with zero contracts; sensitivity rows gated on
  contract-instance presence; receipt prop-driven from Calculator.
- **RightRailAccordion** in `src/ui/chrome/RightRailAccordion.tsx` —
  use this for any new aside; it handles desktop aside ↔ phone bottom
  drawer.
- **Recommender copy already neutralised** (PR 6): no "Empfehlung"
  header, no per-candidate winner badge. Section heading is
  "Welcher Vertrag profitiert am stärksten von zusätzlichem Beitrag?"
- **Sensitivity selectors** in `src/features/mein-plan/`
  (`sensitivitySelectors.ts`, `sensitivityConfig.ts`). Pure, composable
  over `runCombineSimulation`. Five-row budget. Reuse the pattern if
  you need "what-if" rows on Vertrag-Detail (the existing per-contract
  decision atoms in `src/app/contractDecisions.ts` are what you'll
  actually consume — see "Your job" below).
- **Pension baseline label/sublabel pairs** in `MeinPlanPage.tsx`
  (`pensionBaselineLabel`, `pensionBaselineSublabel` — exhaustive
  switches over `PensionBaselineType`). If Vertrag-Detail surfaces the
  baseline pension somewhere, reuse them; do NOT duplicate the switch.
- **`buildProductSlots`** in `MeinPlanPage.tsx` — registry-driven slot
  iteration helper. If you need to walk every product type on the
  workspace, lift this into a shared helper rather than hand-rolling.
- **Self-hosted fonts**, **`__RW_BUILD_DATE__` Vite define**,
  **DisclaimerBanner on `sessionStorage`** — all PR 1+ infrastructure,
  no changes.

## Conventions established by PR 1-6 + PR 283 — follow these

Carry forward from PR 6 handoff still applies (SPA-navigation guards,
navigate threading, JSON-LD in head only, fail-fast resolvers, slugify
helper, post-hydration scroll-to-hash, jsdom + `inShell()` helper, no
PowerShell for file rewriting, viewport tests, brand discipline, German
typography, statutory values in `src/rules/`, `gh pr merge` worktree
gotcha, sweep numeric literals before opening the PR, stable anchor IDs,
paragraph-citation doc-comments on new `legalConstants.ts` entries,
`<NumberField>` for engine-bound numeric inputs, clamp setters with
dynamic min/max before writing engine state, mode-aware state hooks
in `src/app/`, `persistOnMount` flag for hooks that mix mount-hydrate
with mount-persist, `detectSavedMode()` as the canonical mode signal).
Read the PR 6 handoff if any are unfamiliar.

NEW conventions established or hardened in PR 6:

- **Prop-drive receipt-style components, do NOT re-detect mode at
  mount.** The R1 fix on PR 6 caught a race condition: combining
  `useAngabenState()` inside a child component re-reads
  `detectSavedMode()` from localStorage on mount, but
  `usePortfolioState` persists mode asynchronously in a `useEffect`.
  When the user transitions compare→combine in the same session, the
  receipt mounts before storage reflects the new mode and pins itself
  to the wrong store. **Fix**: pass live `mode` / `profile` /
  `assumptions` from the page-level state down through props. Every
  Vertrag-Detail child that displays workspace data follows this
  pattern. `useAngabenState` stays the page-level hook; child
  components are pure presentation.

- **Exhaustive switches over enums.** Use `default: const _: never =
  value; throw new Error(...)` so tsc complains when a future enum
  variant is added. The PR 6 R6 fix caught `pensionBaselineLabel`
  silently falling through on `'beamtenpension'` and `'none'` —
  exhaustive switching would have caught it at the original PR. If
  Vertrag-Detail dispatches on `ProductId`, `EvidenceState`, decision
  atom kinds, or any other union, use this pattern.

- **Paired label/sublabel switches.** When you write an exhaustive
  switch for a label, check whether a parallel sublabel / caption /
  legal citation / description also varies by the same enum. PR 6 R6
  fixed the label and R7 had to fix the matching sublabel that the
  R6 implementer missed. Audit BOTH at once.

- **Registry-driven product iteration.** Never hardcode product-id
  lists. `PRODUCT_REGISTRY` in `src/engine/productRegistry.ts` is the
  single source of truth. For workspace field-name mismatches (e.g.
  `versicherung → wsa.insurance`), use a small lookup constant.
  `buildProductSlots` in `MeinPlanPage.tsx` (PR 6 R2) is the
  reference implementation; consider lifting it into a shared utility
  if Vertrag-Detail needs the same iteration.

- **Split gating flags by render concern.** When guarding rendering of
  multiple sections, use distinct booleans. PR 6 R5 caught a
  `hasInstances` flag that hid the §1 statutory-pension row (which is
  always meaningful) just because the user had no contract instances.
  Vertrag-Detail will likely have similar split-flag needs (e.g. show
  contract metadata even if certain scenarios are unavailable).

- **`Array.isArray` guard before casting from generic storage shapes.**
  PR 6 R3 caught a `?? []` fallback that let any truthy non-array
  pass through. When pulling instance arrays from workspace fields
  via dynamic key lookup, always validate with `Array.isArray(raw)`
  before the cast.

- **ETF status differentiation matters in UI copy.** `paid_up` vs.
  `surrendered` vs. `offered` vs. empty arrays are distinct user
  states; do not collapse them into a single "no contract" fallback.
  PR 6 R4 + R5 worked through this for the ETF-bump sensitivity row.
  Vertrag-Detail's contract-status display surfaces this directly —
  it's literally one of the things the page shows.

## Review-loop reality (UPDATED from PR 6)

- **Plan for 5-8 review rounds, not 4-5.** PR 6 took 7 rounds. Each
  round produced 1-3 substantive findings; later rounds shifted to
  refinements (paired sublabels, edge-case ETF states, sublabel/
  label coupling). The user has explicitly said "fix everything" —
  treat 🟡 minor and 🔵 nit findings as must-fix.

- **Codex's green signal lives in issue comments, not formal reviews.**
  When Codex has no findings, it posts an **issue comment** with the
  literal string `"Codex Review: Didn't find any major issues.
  Hooray!"` — NOT a formal review and NOT a thumbs-up reaction (the
  reaction we saw was `"eyes"` while Codex was processing). The
  monitor MUST poll `/repos/{owner}/{repo}/issues/{n}/comments` for
  Codex's `chatgpt-codex-connector[bot]` user, not just
  `/pulls/{n}/reviews` and `/pulls/{n}/comments`. PR 6 spent ~25 min
  on a timeout because the monitor only checked the pulls endpoints.

- **CodeRabbit's `SUCCESS` status check is the explicit approve
  signal.** Watch `statusCheckRollup` for context `"CodeRabbit"` with
  state `"SUCCESS"`. When that's green AND Codex's "no major issues"
  comment is posted, the PR is mergeable.

- **CodeRabbit's "incremental review system… already reviewed" ack
  means silently green.** When CR replies to `@coderabbitai review`
  with the standard "is applicable only when automatic reviews are
  paused" line and posts no new formal review or line comments, it
  has done its incremental scan and found nothing actionable. Treat
  this as green per the protocol established in PR 6 (user
  explicitly: "treat as green").

- **CodeRabbit re-tracks line comments forward.** Old `commit_sha`
  fields on line comments update to the latest commit when CR still
  considers them open. Don't read `commit_sha` as proof of
  re-review — read the review-list timestamps.

- **Both reviewers converge.** Final merge signal: CodeRabbit emits
  `SUCCESS` status check AND Codex says "Didn't find any major
  issues". This was the PR 6 convergence at round 8.

## CI workflow gating reminder

`feat/redesign-*` and `feat/angaben-*` branches do NOT trigger the
agent-only workflows (`pr-verify` / `claude-review` / `review-loop`).
Those are gated to `agent/issue-*` and `automation/retro-curate-*`
branch prefixes. So `npm run verify` runs locally in the implementer's
worktree, NOT in CI. You must verify locally before merge. The
Cloudflare `Workers Builds: rentenwiki` check runs on all branches;
treat it as the only meaningful CI signal for `feat/*` PRs.

The `worker:typecheck` step in `npm run verify` may fail on
`@cloudflare/workers-types` not being installed in some worktrees;
this is pre-existing and unrelated to PR 7. Document and move on if
it fires; don't try to fix it inside PR 7.

## Your job — PR 7: Vertrag im Detail

Start from a clean branch off main:
`git checkout -b feat/redesign-vertrag-detail origin/main`.

> The sibling worktree `Rentenrechner-conflict-auto` still holds main
> checked out, so `git checkout main` fails locally. Always branch
> from `origin/main` directly.

Goal per plan §6 PR 7: replace `OptimiereVorsorgeModal.tsx` with a
full-page Vertrag-Detail view at route `/vertrag/:instanceId`.
Estimated ~6 days incl. mobile.

**Vertrag-Detail layout (per mock):**

- Header: kicker "Mein Plan › Vertrag N von M", H1 with contract name
  and product type (e.g. "ETF-Depot · Trade Republic"), back link to
  Mein Plan. AppHeader pattern from existing Sober D pages.
- **§ 1 KPI strip** — 4-up on desktop / tablet; 2×2 on phone:
  - Beitrag pro Monat (heute)
  - Einzahlungen (über N Jahre)
  - Kapital (mit Renteneintritt — oxblood headline figure)
  - Netto-Rente (pro Monat — secondary oxblood)
- **§ 2 Was wäre, wenn …** — scenario table consuming
  `src/app/contractDecisions.ts` atoms (`applyContractDecision`,
  `simulateContractDecision`). One row per decision atom: current
  state (`▸` marker), Beitrag-up, Beitrag-down, stilllegen, kündigen,
  übertragen. Each row shows: scenario label, resulting Netto-Rente,
  delta vs. current (signed). Color rules: positive delta neutral
  ink, negative delta accent oxblood. NO winner highlight.
- **§ 3 Wie wir das berechnen** — reuses `src/features/results/
  provenance.tsx` primitives (`ProvLabel`, `FieldWithProv`). Lists
  the inputs flowing into this contract's projection with their
  EvidenceState pills. Pulls from
  `src/features/results/provenanceHelpers.ts` for the
  EvidenceState → ProvKind mapping.

**Right rail = `RightRailAccordion`** with contract metadata:
"Anbieter", "Vertragsbeginn", "Garantiezins" (if applicable),
"Fonds" (ETF only), "TER", "Effektivkosten", "Status" (active /
paid_up / surrendered / offered). Same prop-drive pattern as Mein
Plan's "Deine Angaben" receipt — pass live `instance` data from the
parent. Phone collapse via the existing accordion component.

**Sidebar deletion.** Vertrag-Detail did not exist as a sidebar
surface, so nothing to delete here directly. But if any compare-mode
sidebar code happens to reference `OptimiereVorsorgeModal`, those
references must be cleaned up alongside the modal deletion.

**Files added:**
- `src/features/dashboard/VertragDetailPage.tsx` (or place under
  `src/features/vertrag-detail/` for module-map cleanliness — your
  call; mirror PR 6's `src/features/mein-plan/` decision).
- Per-section components co-located (KPI strip, scenario table,
  provenance section). Keep small + pure where possible.
- Optional: a shared `contractMetadataFor(instance: InstanceCommon)`
  selector under `src/app/` if the metadata extraction grows beyond
  a few lines.

**Files modified:**
- `src/app/useRoute.ts` — extend `Route` union and `KNOWN_ROUTES` to
  support dynamic `/vertrag/:instanceId`. The current router is a
  small custom hook with no react-router; you'll need to add path-
  matching for the dynamic segment. Keep the router shape minimal
  — see "Route shape" below.
- `src/App.tsx` — render `VertragDetailPage` for the matched route.
- `src/features/mein-plan/MeinPlanPage.tsx` — wire the per-row link
  on the § 1 Zusammensetzung instance rows to navigate to
  `/vertrag/<instanceId>`. SPA-navigation safe (modified-click guard).
- `scripts/prerender.mjs` — ensure `/vertrag/*` paths are NOT in the
  `hydrateStable` allowlist (they read URL state and
  per-instance workspace data).
- `public/_redirects` and `vercel.json` — add `/vertrag/*` SPA
  fallback rules if they aren't already covered by a wildcard.
- `CONTEXT.md` module map — add the new Vertrag-Detail surfaces and
  the route. Update the route table.
- `CLAUDE.md` "Quick navigation" — add a row for "Edit Vertrag-Detail
  view".

**Files deleted (at end of PR):**
- `src/features/dashboard/OptimiereVorsorgeModal.tsx` — full delete.
- `src/features/dashboard/OptimiereVorsorgeModal.css` — full delete.
- `src/features/dashboard/OptimiereVorsorgeModal.test.tsx` — full
  delete.
- Any imports of `OptimiereVorsorgeModal` elsewhere — chase and
  update. Likely callers: `Calculator.tsx`, `MeinPlanSidebar.tsx`
  (already scheduled for deletion in PR 9), `RentenluckeDashboard.tsx`.

**Route shape (the hardest engineering bit of PR 7):**

The current `src/app/useRoute.ts` exports a `Route` union of literal
paths. PR 7 needs a dynamic segment. Two acceptable approaches:

1. **Tagged union with the instance id inside the variant:**
   ```ts
   type Route =
     | { kind: 'home' }
     | { kind: 'eingaben' }
     | { kind: 'methode' }
     | { kind: 'artikel'; slug?: string }
     | { kind: 'impressum' }
     | { kind: 'datenschutz' }
     | { kind: 'vertrag'; instanceId: string }
   ```
   - Pro: type-safe, matches React-Router's typed routes.
   - Con: every existing `Route === '/methode'` comparison breaks;
     touch every callsite.

2. **Keep `Route` as a string union, parse dynamic segment at the
   call-site:**
   ```ts
   type Route = '/' | '/eingaben' | '/methode' | '/vertrag' | ...
   // Caller does: const instanceId = location.pathname.match(/^\/vertrag\/(.+)$/)?.[1]
   ```
   - Pro: minimal change to existing call-sites.
   - Con: leaks URL parsing into VertragDetailPage; less type-safe.

**Recommendation**: option (1) is the right long-term shape, but the
churn is non-trivial. If you go option (2), document the parsing
contract in `useRoute.ts` and add a regression test that
`/vertrag/<id>` round-trips through navigate() correctly. Either way,
the dynamic segment must be URL-decoded properly (instance IDs in
this codebase are like `bav:1f3a-...` so they include colons that
URL-encode to `%3A`).

**Invalid `:instanceId` handling**: if the URL contains an instance
ID that doesn't exist in the active workspace (user shared a link to
an instance they later deleted), render an explicit "Diese Vertrag
wurde nicht gefunden" empty state with a back link to `/`. Do NOT
redirect silently — that hides the user's intent.

**Acceptance criteria (verify before opening PR):**
- `npm run verify` green.
- Vertrag-Detail renders at 390 / 820 / 1280 px with all three
  viewports tested.
- KPI strip: 4-up desktop, 4-up tablet, 2×2 phone.
- Scenario table renders one row per `contractDecisions.ts` atom;
  current-state row is marked; deltas signed correctly.
- Right-rail metadata reads live `instance` data via props, not via
  `useAngabenState`.
- Edit link from Mein Plan's § 1 Zusammensetzung row navigates to
  `/vertrag/<instanceId>` SPA-safely (modified-click test).
- Invalid `:instanceId` shows the explicit empty state, not a
  silent redirect.
- `OptimiereVorsorgeModal` and its test/CSS are fully deleted; no
  remaining imports.
- DisclaimerBanner still session-dismissable.
- Single JSON-LD via head pipeline (no inline `<JsonLd>`).
- Every statutory value traces to `src/rules/legalConstants.ts` or
  `activeRules`.
- Workspace `schemaVersion: 2` unchanged. `migrateAndValidateState` /
  `validateWorkspace` stay single funnels.
- No regression on the existing MeinPlanPage + AngabenPage tests.
- Pre-render works for `/vertrag/:instanceId` placeholder route
  (probably a no-op since these paths can't be statically rendered;
  document accordingly).

## Optional stretch — none

PR 7 is the second-largest PR in the redesign. Do not bundle PR 8
(Kapital & Auszahlungen) into this session. PR 8 adds the
`/kapital` route, full-page lifecycle chart, and `useChartDensity` —
that's a separate 5-day scope.

## Open follow-ups (do not fix in PR 7)

- **#279** — Pre-existing Versorgungsfreibetrag 2021/2022 cohort bug
  in `src/rules/legalConstants.ts`. Wrong-number-fix with full
  preflight; needs its own PR with regression test.
- **Sidebar deletion completion** — PR 6 removed the sidebar from
  Mein Plan only; PR 9 (Vergleich) finishes the deletion for
  compare-mode dashboards.
- **CombineDetailView.tsx retirement** — still used by the combine-
  mode "Details & Export" tab body; not in PR 7's scope. Likely
  superseded when PR 9 / PR 10 land.
- **MeinPlanSidebar.tsx + meinPlanPanes.ts orphan deletion** —
  flagged in the PR 6 retro; PR 9 sweep will clean up.
- **PR 6 5th sensitivity row (bAV → ETF counterfactual)** — flagged
  in PR 6 retro as deferred. Doesn't belong in PR 7.

## Constraints — non-negotiable

1. **DisclaimerBanner** stays on `sessionStorage`. AppShell renders
   it. `PrintReport.tsx` keeps its own. Both are P0.
2. **No new network calls.** Self-host any new fonts. No CDN fetches.
3. **Brand:** `RentenWiki` in chrome, `RentenWiki.de` in titles / OG
   / exports. Never "Rentenrechner" in public copy.
4. **No statutory values outside `src/rules/`.** Sweep every literal
   in new Vertrag-Detail components before opening the PR.
5. **Engine untouched.** Vertrag-Detail consumes existing simulation
   results + `contractDecisions.ts` atoms. No new engine entry
   points, no changes to `simulateRetirementComparison` /
   `simulatePortfolio` / `combinePortfolio` shape.
6. **Workspace `schemaVersion: 2` unchanged.** Per plan §8 risk #10.
   No new top-level workspace fields, no new migrations. Instance
   IDs in URLs are read-only consumers of the workspace.
7. **`useAngabenState` is the single mode-aware state source.** Do
   not create a parallel mode-detection path. If Vertrag-Detail
   needs workspace data the hook doesn't expose, pass it through
   props from Calculator.tsx rather than re-reading storage.
8. **Page-level state, prop-driven children.** Every metadata /
   receipt / scenario component takes live data via props.
   `useAngabenState` and `usePortfolioState` are called ONCE at the
   page level.
9. **Exhaustive switches** over `ProductId`, `InstanceCommon['status']`,
   decision-atom kinds, evidence states, and any other union you
   dispatch on. Default branch must be `const _: never = value`.
10. **Paired label/sublabel switches.** If you write one, audit
    whether a sublabel parallel exists. The PR 6 R6→R7 cycle was
    forced because of a missed parallel.

## Working style

- Read the plan + the mock file + the existing
  `OptimiereVorsorgeModal.tsx` end-to-end before doing anything. The
  modal is what you're replacing — its scenario table, contract
  metadata, and KPI math are the inputs to your new layout.
- Use Plan / Explore agents for broad reading; Read / Grep / Glob
  when you know the file.
- For test edits across many files, use Python (UTF-8 safe) not
  PowerShell.
- Pop options to the user as terse numbered lists when you hit a
  real decision. Don't restate locked decisions.
- Test at all three viewports.
- End-of-turn summaries: one or two sentences.
- Plan for 5-8 review rounds.
- **Monitor reviewer activity on three endpoints**: `/issues/{n}/
  comments`, `/pulls/{n}/reviews`, `/pulls/{n}/comments`. Codex's
  green signal arrives via issue comments — `/pulls/{n}/reviews`
  alone will miss it.
- Each round, sweep CodeRabbit comments for "duplicate (N)" collapses
  — don't trust the headline "Actionable comments posted" count
  alone.
- Codex sometimes goes silent for 25+ min. Acceptable to nudge once
  at 12 min, but if a second nudge produces no response after another
  ~10 min, push the next fix anyway — Codex will pick it up on the
  new commit. Don't wait indefinitely.

## First step

1. Read `docs/redesign/implementation-plan.md` §6 PR 7 lines + §8
   risks #1, #8, #10.
2. Read the Vertrag-Detail artboard in
   `.scratch/redesign-handoff-v2/rentenrechner/project/
   direction-d-pages.jsx` (grep `Vertrag`) and the responsive
   variants in `responsive-views.jsx` (`MVertrag` ~lines 506-570,
   `TVertrag` later in the file).
3. Read `src/features/dashboard/OptimiereVorsorgeModal.tsx` end-to-
   end. Note which inputs it consumes (instance, decisions, scenario
   atoms, provenance) and which outputs it produces (the modal's
   step machine vs. the new page's flat sections).
4. Read `src/app/contractDecisions.ts` to understand the atom shape
   you'll consume in § 2 "Was wäre, wenn …".
5. Read `src/app/useRoute.ts` end-to-end to plan the dynamic-route
   extension. Compare the cost of route-shape option (1) vs. (2)
   above.
6. Read `src/features/mein-plan/MeinPlanPage.tsx` to understand
   where the § 1 instance rows are rendered (you'll add the navigate
   call there).
7. Branch: `git checkout -b feat/redesign-vertrag-detail origin/main`.
8. Report your call to the user with: proposed file list (added /
   modified / deleted), route-shape decision (option 1 vs. 2), the
   scenario table's decision-atom set you'll surface, any
   architectural questions (e.g. should `contractMetadataFor`
   become a shared selector, should `useRoute` adopt a tagged-union
   shape now or after PR 8), and any deviations from the plan.
   Ask for go.
```

---

## Repo state at handoff

- `main` is at squash commit `0478682` (PR #284 — feat(mein-plan):
  combine-mode results redesign, PR 6).
- Previous landings: `5a56bec` (PR #283 — combine-mode `/eingaben`
  wiring), `61a0e50` (PR #281 — Deine Angaben page), `13fdde5`
  (PR #278 — Methode page), `7505dbe` (PR #275 — Artikel hub),
  `a646443` (PR #273 — landing redesign), `8513882` (PR #270 —
  chrome foundation).
- `feat/redesign-mein-plan`, `feat/angaben-combine-wiring`,
  `feat/redesign-angaben` branches are merged; cleaned up locally
  after PR 6 merge. Some other stale local branches remain (e.g.
  `feat/redesign-artikel`, `docs/redesign-handoff-pr*`); safe to
  delete if you want a tidy local state, none block PR 7.
- A `Rentenrechner-conflict-auto` sibling worktree still holds main
  checked out; local `git checkout main` fails. Branch from
  `origin/main` directly.
- Local working tree may still have `.scratch/redesign-handoff-v2/`
  untracked — intentional, do not commit the bundle.
- Issues #279 (cohort bug) — see "Open follow-ups" in the
  orchestrator prompt.

## Where the PR-6 patterns live

- `src/features/mein-plan/MeinPlanPage.tsx` — canonical Sober D
  results-page reference. Section headings (§ 1 / § 2), prop-driven
  receipt aside, exhaustive `pensionBaselineLabel` +
  `pensionBaselineSublabel` switches, registry-driven
  `buildProductSlots` helper, split `hasContractRows` /
  `hasZusammenRows` gating flags.
- `src/features/mein-plan/sensitivitySelectors.ts` — composable
  selectors over `runCombineSimulation`. Note differentiation between
  ETF `paid_up_only` / `no_etf_instance` cases (R4/R5 lesson).
- `src/features/mein-plan/MeinPlanPage.test.tsx` — viewport tests +
  mount-no-op assertions + `vi.spyOn` on sensitivity selectors for
  the empty-instances guard. 22 tests; mirror its structure for
  Vertrag-Detail.
- `src/ui/chrome/RightRailAccordion.tsx` — reuse as-is; do not
  re-build.
- `src/app/useAngabenState.ts` — page-level mode-aware state hook.
  Vertrag-Detail's page will likely also call this (for the back-
  link's mode-aware target) but child components must NOT.
- `src/app/contractDecisions.ts` — the decision atoms your § 2
  scenario table consumes. Read it before designing the table shape.
- `src/features/results/provenance.tsx` + `provenanceHelpers.ts` —
  reuse for § 3 "Wie wir das berechnen".

## Review-loop appendix

PR 6 went through 7 rounds. Commit progression:

### PR 284 (`feat/redesign-mein-plan`)
1. `a9e0736` initial — Codex P1 + CR Major (clip CSS) + CR docstring
2. `bc0c4ba` R1 — receipt prop-drive + clip-path + docstrings
3. `7291ab6` R2 — registry-driven slots + hasInstances guard
4. `55f2e45` R3 — AVD/Riester field + Array.isArray + test spy
5. `e6ba20c` R4 — ETF paid_up + retirement clamp note
6. `167cad1` R5 — split §1/§2 gating + ETF status fallback
7. `f3ddb9a` R6 — pensionBaselineLabel exhaustive switch
8. `b706bc8` R7 — variant-aware statutory sublabel
9. `0478682` squash-merge on main

Both reviewers explicitly approved on the final commit:
- Codex: `"Codex Review: Didn't find any major issues. Hooray!"`
  (issue comment 11:06 UTC, 2026-05-20).
- CodeRabbit: `SUCCESS` status check at 11:14 UTC + silent on R7
  (per the established protocol).

Per-round finding counts:
- R1: 1 P1 (Codex) + 1 Major (CR) + 1 docstring warning = 3
- R2: 1 P2 (Codex) + 1 Major outside-diff (CR) = 2
- R3: 1 P2 (Codex) + 1 Minor + 1 Nitpick (CR) = 3
- R4: 2 (Codex P2 + P3) + 0 CR silent-green = 2
- R5: 0 Codex silent-green + 1 Major outside-diff + 1 Minor (CR) = 2
- R6: 1 P2 (Codex) + 0 CR silent-green = 1
- R7: 0 Codex silent-green + 1 Major outside-diff (CR) = 1

Total 14 substantive findings across 7 rounds. ~3.5h elapsed,
~30 min per round (including agent dispatch + verify + push +
reviewer wait). PR 7 should follow similar cadence — budget 4-5h of
orchestration time.

## Estimated effort

- PR 7 alone: ~6 days (per plan §9; involves dynamic-route extension,
  modal-to-page conversion, scenario-table over decision atoms, and
  contract-metadata surface).
- PR 7 + start of PR 8: not advised in one session — PR 8 (Kapital &
  Auszahlungen) is another 5-day scope and adds the `useChartDensity`
  shared primitive.
- Plan for 5-8 review rounds; budget ~4-5 hours of orchestration time
  beyond the implementation work.
