# Redesign Handoff — PR 11 onwards

> **Status:** Handoff prompt for a fresh session.
> **Last updated:** 2026-05-21.
> **Previous session landed:**
> - PR 10 — Vergleich-Detail at squash commit `6a27e44`, merged via #290 (**5 review rounds R0–R4**, ~12 reviewer findings total). Final commit Codex green ("Didn't find any major issues.").
>
> **Next up:** PR 11 — **Print + cross-cutting tests** (per plan §6). User chose the maximalist scope on both axes: **full per-page mirror** of the redesigned routes inside the A4 print, AND **full test sweep** (every `src/features/**/*.test.tsx` with DOM-shape assertions gets `eachViewport` coverage). Original plan estimated ~4 days; with the maximalist choices realistic range is 6–10 days incl. 2–4 review rounds.

---

## Paste this as the new session's orchestrator prompt

````text
You are implementing PR 11 of a multi-PR UI redesign for the Rentenrechner
repo (German retirement calculator, public name "RentenWiki.de"). Working
dir is the pre-created worktree at
C:/Users/Peter/Coding_Projects/Rentenrechner/.claude/worktrees/pr11-print-tests
on branch `feat/redesign-print-tests` based on origin/main at 6a27e44.

DO NOT re-create the worktree or re-branch. Run all commands from inside
the worktree (`cd <path> && ...` or `git -C <path>`). DO NOT switch the
sibling worktree at `Rentenrechner-conflict-auto` (it holds `main`).

## Sources of truth (read these before doing anything)

1. **docs/redesign/implementation-plan.md** — PR 11 spec is §6 PR 11 (~lines
   313-322). "Goal: PrintReport works on every redesigned page; disclaimer
   remains first child of #print-report (P0 guardrail). Test sweep: every
   `src/features/**/*.test.tsx` with DOM-shape assertions updated."
2. **docs/redesign/handoff-pr11-onwards.md** — this file. Carries PR 10
   deltas and the maximalist scope decisions made for PR 11.
3. **docs/redesign/handoff-pr10-onwards.md** — chain back here for the
   PR 9 + PR 10 conventions; this file only documents new deltas.
4. **CLAUDE.md** — project guide. PR 11 has a P0 disclaimer invariant:
   "DisclaimerBanner switched from sessionStorage to localStorage; OR
   disclaimer no longer the literal first child of `#print-report` in
   `PrintReport.tsx`; OR removed from the first section of `buildExportCsv`
   output; OR README's not-advice notice removed." Read the full P0/P1
   ladder.
5. **CONTEXT.md** — domain glossary + module ownership map. Pay
   particular attention to the routes already redesigned (Methode,
   Angaben, Mein Plan, Vertrag-Detail, Kapital, Vergleich, Vergleich-
   Detail) and the file paths for each.
6. **src/features/results/PrintReport.tsx** + **PrintReport.css** +
   **PrintReport.test.tsx** — the current 697-line component, 231-line
   stylesheet, and 487-line test file. Compare-mode and combine-mode
   branches both already exist; you EXTEND them with per-page sections
   rather than rewriting.
7. **src/test/viewport.ts** — the `mockViewport(viewport)` /
   `eachViewport(fn)` helpers ALREADY exist. Plan §6 said "add ...
   if vitest harness doesn't already have one" — it does. Six tests
   already consume it (AngabenPage, MeinPlanPage, MethodePage, chrome,
   VertragDetailPage, ArticleHubPage). Your job is to extend the
   coverage to every redesigned-page test PLUS every other
   `src/features/**/*.test.tsx` that asserts DOM shape.

## What's already shipped (do not redo)

Carry-forward from the PR 10 handoff still applies — every chrome
primitive, Sober D route (Methode / Angaben / Mein Plan / Vertrag-
Detail / Kapital / Vergleich / Vergleich-Detail), Editorial A route
(Startseite + Articles), and viewport-test helper. Plus PR 10
specifics:

- **`/vergleich/details` route** lives at `src/features/vergleich-detail/`
  with `VergleichDetailPage.tsx` + `VergleichDetailCard.tsx` +
  `VergleichDetailCardSection.tsx` + helpers `vergleichDetailRows.ts`
  + `vergleichDetailAvailability.ts`. Compare-mode only; combine-mode
  shows an EmptyState pointing to Mein Plan. 3-wide desktop → 2-wide
  tablet → scroll-snap phone.
- **Per-product availability copy** in `src/content/productAvailabilityCopy.ts`
  — registry-driven. Use this for any "Verfügbar ab" text in print.
- **`taxAndSvSavings` is lifetime, not annual** — the engine value
  represents the cumulative tax + SV benefit over the entire savings
  horizon. Treat as lifetime in any print column / row.
- **bAV "GRV-Reduktion" is a separate negative row**, NOT folded into
  the Steuer- & SV-Vorteil row. The savings benefit and the GRV
  reduction are presented as distinct lines (see VergleichDetailCard).
- **Per-product tax label nuance** — ETF capital-gain tax is
  Abgeltungsteuer; every other product's payout-phase tax is
  Einkommensteuer (marginal). Don't blanket-label as "Steuer".

## Conventions established by PR 1-10 — follow these

Carry forward from PR 10 handoff still applies:
- `routeToPath(ROUTES.x)` for every internal href; never bare strings
- SPA-progressive-enhancement (real `href` + click-intercept only when
  `navigate` truthy); Cmd-click new-tab must work
- Doc-title `useEffect` placed BEFORE any conditional returns
- `formatCurrency(value, 0)` for every euro display, never
  `Math.round(value).toLocaleString('de-DE')`
- `interface` for object shapes, `type` for unions/aliases
- No `word-break: break-word` (use `word-break: normal;
  overflow-wrap: anywhere;`)
- No `aria-hidden="true"` on empty-state copy
- Stable anchor IDs for in-page sections
- Exhaustive switches on `ProductId` with `const _: never = …` default
- `PRODUCT_REGISTRY` is the single source of product iteration —
  never hardcode a product list
- Dynamic `{retirementAge}` in section headers — NEVER hardcode `67`
- Empty-state copy uses the EmptyState component with `ctaTarget: Route`
- Statutory ages / amounts trace to `src/rules/legalConstants.ts` or
  `src/rules/de2026.ts`

NEW conventions hardened in PR 290 (PR 10):

- **Scenario-id threading + URL preservation across three nav paths.**
  In-memory updates, Cmd-click new tab, and SPA `navigate()` calls
  all need to preserve the active scenario when crossing a redesigned
  route boundary. PR 10 R3 had a finding about a scenario-id getting
  dropped on Cmd-click open. If your print code reads scenario state,
  treat the active scenario as a normal prop, not derived inside.

- **Lifetime-vs-annual math labels.** PR 10 R1 had `taxAndSvSavings`
  rendered as annual; it's lifetime cumulative. For every number in
  print, double-check the temporal label (mtl / p.a. / einmalig /
  Lebenszeit). The print is a permanent artefact — getting a unit
  wrong is more visible than in the web UI.

- **Registry-derived test ids.** Test IDs like
  `data-testid="card-${productId}"` must iterate `PRODUCT_REGISTRY`,
  not be hardcoded per product. Look at PR 10's
  `VergleichDetailPage.test.tsx` for the pattern.

- **Live `contractStartYear`.** pAV Verfügbarkeit derives from
  `profile.contractStartYear` (current year fallback if unset), NOT
  hardcoded. Same applies to any age-related copy in print.

NEW conventions for PR 11 (load-bearing):

- **Disclaimer is the LITERAL first child of #print-report — both
  branches.** Compare-mode AND combine-mode AND any new mode you
  add. The `.pr-disclaimer-top` section is non-negotiable. Adding
  new top-level sections requires inserting them AFTER the
  disclaimer block, never before. Existing test
  `PrintReport.test.tsx` already pins this — keep that test green.

- **Print is desktop-only by definition.** A4 paper is a fixed
  width. Do NOT add phone/tablet print branches. The viewport
  helper exists for the web app tests, not for print. `@media
  print` rules in `PrintReport.css` may need extension, but the
  rendering tree stays single-branch per mode.

- **Print sections mirror redesigned pages, not vice versa.** Each
  new print section reuses pure helpers (e.g. `vergleichDetailRows.ts`,
  `wendepunkte.ts`, `sensitivitySelectors.ts`) but with print-specific
  layout. Don't try to share JSX between web and print — print needs
  fixed table widths, no overflow, no scroll-snap.

## Review-loop reality (UPDATED from PR 290)

- **Plan for 2-4 review rounds.** PR 290 took 5 rounds (R0–R4).
  PR 288 took 3. PR 287 took 3. Each round 1–6 findings; later
  rounds shift to ARIA semantics, tap targets, stylelint, type-
  vs-interface, deprecated-CSS nits, dynamic-age labels. The user
  has explicitly said "0 findings including 0 nitpicks" — treat
  🟡 minor and trivial "non-finding observations" as must-fix.

- **CodeRabbit's "No actionable comments were generated in the
  recent review. 🎉"** is the green signal. Combine with the
  SUCCESS status check on the `CodeRabbit` context.

- **Codex's green signal** lives in issue comments with literal
  phrasing `"Codex Review: Didn't find any major issues."` followed
  by a flavor sign-off ("Nice work!" / "Bravo." / "Chef's kiss." /
  "Excellent."). Codex ALSO posts a 👍 reaction. NOT a formal
  review. Poll `/repos/{owner}/{repo}/issues/{n}/comments` for
  `chatgpt-codex-connector[bot]`, plus `/issues/{n}/reactions` for
  the thumbs-up.

- **CodeRabbit posts STALE reviews on previous commits.** When you
  push a new commit, the in-progress comment updates with a new
  `Run ID`; previous-run reviews may still arrive later flagging
  things now fixed. Trust the in-progress comment's `Reviewing
  files that changed from … and between BASE and HEAD` line — the
  `HEAD` SHA tells you which commit the review is actually against.

- **CodeRabbit auto-pauses after ~4 commits in quick succession.**
  Resume via `@coderabbitai review` or the "Trigger review" checkbox.

- **Codex acknowledges with 👀 then takes 1-6 min to verdict.**
  Wait 6 min before re-nudging.

- **Both reviewers converge.** Final merge signal: CodeRabbit
  `SUCCESS` status + "No actionable comments… 🎉" AND Codex
  "Didn't find any major issues" or 👍 reaction. PR 290 converged
  at R4.

## CI workflow gating reminder

`feat/redesign-*` branches do NOT trigger the agent-only workflows
(`pr-verify` / `claude-review` / `review-loop`). Those are gated to
`agent/issue-*` and `automation/retro-curate-*` branch prefixes. So
`npm run verify` runs locally in the implementer's worktree, NOT in
CI. You MUST verify locally before opening the PR AND after every
review-fix commit. The Cloudflare `Workers Builds: rentenwiki` check
runs on all branches; treat it as the only meaningful CI signal for
`feat/*` PRs.

## The `gh pr merge --delete-branch` worktree gotcha (PR 286-290 lesson)

The sibling worktree `C:/Users/Peter/Coding_Projects/Rentenrechner-conflict-auto`
still holds `main` checked out. `gh pr merge --squash --delete-branch`
fails with `fatal: 'main' is already used by worktree at …` — but
the merge ITSELF succeeds server-side. The error is from the post-
merge local cleanup step. Recovery: drop `--delete-branch`, verify
the PR shows `state: MERGED`, then delete the remote ref:

```bash
gh api -X DELETE repos/PeterHartwieg/Rentenrechner/git/refs/heads/feat/redesign-print-tests
```

Local branch cleanup needs no API call. PR 288–290 used this
pattern cleanly.

---

## Your job — PR 11: Print + cross-cutting tests

### Scope decision (FROM ORCHESTRATOR — already locked, do NOT re-ask)

The user picked the maximalist option on both axes:

1. **Print scope = "Full per-page mirror."** The A4 print output mirrors every
   redesigned page in section order:

   **Compare-mode print** (extend existing branch):
   - `.pr-disclaimer-top` (KEEP — first child invariant)
   - Header table (KEEP — title + date + tagline)
   - Profile + GRV summary table (KEEP)
   - § Rentenszenarien & Annahmen table (KEEP)
   - § Produktvergleich — alle Szenarien table (KEEP — this is the
     Vergleich-page mirror)
   - § **NEW** Wohin geht das Geld — per-product breakdown grid
     (Ansparphase / Mit {retirementAge} / Im Alter) for every visible
     product. Reuse the helpers from `src/features/vergleich-detail/`
     (`vergleichDetailRows.ts`, `vergleichDetailAvailability.ts`).
     Print-specific layout: stacked rows per product instead of a card
     grid — A4 needs fixed table widths.
   - § **NEW** Methode & Quellen — short methodology block: which
     rule year (de2026), which §s of EStG/SGB applied, link/text
     reference to `/methode` for the full page. Pull short copy from
     `MethodePage.tsx` (single source of truth). Keep terse — 1
     A4 page max.
   - § Hinweise und Grenzen (KEEP — full disclaimer list)
   - Footer (KEEP)

   **Combine-mode print** (extend existing branch):
   - `.pr-disclaimer-top` (KEEP)
   - Header table (KEEP — "Mein Plan" subtitle)
   - Profile + GRV summary (KEEP)
   - § Rentenszenarien & Annahmen (KEEP)
   - § Kombiniertes Renteneinkommen je Szenario (KEEP)
   - § Mein Plan — Detail je Vertrag table (KEEP)
   - § **NEW** Zusammensetzung & Sensitivität — composition summary
     (per-instance contribution → combined net) + the sensitivity
     rows ("Was sich ändern würde, wenn …"). Reuse selectors from
     `src/features/mein-plan/sensitivitySelectors.ts`. Pick the
     basis-scenario sensitivity rows; do not enumerate per scenario.
   - § **NEW** Kapital & Auszahlungen — wendepunkte table per
     instance. Reuse `src/features/kapital/wendepunkte.ts`
     (`buildWendepunkteRows`). Print-specific table layout (fixed
     widths). One table per instance, OR one combined table with
     an instance column — pick the cleaner option after looking
     at the source helper.
   - § **NEW** Vertrag im Detail (per contract) — for every
     instance, a short block of contract metadata + the basis-scenario
     KPI strip (Beitrag, Kapital, Brutto-Rente, Netto-Rente). Mirror
     the Vertrag-Detail page's KPI strip + provenance-list section.
     One block per contract, page-break-before:auto. Keep terse.
   - § **NEW** Methode & Quellen (same block as compare-mode print)
   - § Hinweise und Grenzen (KEEP)
   - Footer (KEEP)

2. **Test sweep = "Full sweep."** Every `src/features/**/*.test.tsx` that
   asserts DOM shape gets `eachViewport(() => { ... })` coverage. AND:
   - Create missing page-level tests for `KapitalPage` + `VergleichPage`
     (only helper tests exist on main).
   - Convert any remaining `window.matchMedia` ad-hoc stubs to
     `mockViewport()`. There is currently one (`QaComposer.a11y.test.tsx`).
   - Add a `PrintReport.test.tsx` test for EACH new section described
     above (compare-mode Wohin / Methode; combine-mode Zusammensetzung /
     Kapital / Vertrag / Methode). The disclaimer-first invariant test
     stays — make sure it still passes with new sections inserted
     after the disclaimer.

### Files added

- **None for `src/test/viewport.ts`** — helper already exists.
- New page-level tests:
  - `src/features/kapital/KapitalPage.test.tsx`
  - `src/features/vergleich/VergleichPage.test.tsx`
- New PrintReport selectors if needed (extract pure helpers from the
  monolithic PrintReport.tsx if a new section's row-building logic
  exceeds ~30 lines):
  - `src/features/results/printReportRows.ts` (or per-section files)

### Files modified

- `src/features/results/PrintReport.tsx` — extend both compare-mode and
  combine-mode branches with the new sections. Disclaimer-first
  invariant non-negotiable.
- `src/features/results/PrintReport.css` — add print-specific styling
  for the new sections (`@media print` rules where appropriate; fixed
  table widths for the per-contract block).
- `src/features/results/PrintReport.test.tsx` — extend with section
  tests + viewport sweep helpers (if needed).
- Every `src/features/**/*.test.tsx` that asserts DOM shape — wrap
  the existing render → assertion blocks in `eachViewport(viewport => { ... })`
  so the assertion runs at phone + tablet + desktop. Skip files that
  test pure logic with no DOM. Audit list — likely candidates:
  - `LandingPage.test.tsx`
  - `ArticleHubPage.test.tsx` (already uses)
  - `ArticleLayout.test.tsx`
  - `AngabenPage.test.tsx` (already uses)
  - `MeinPlanPage.test.tsx` (already uses)
  - `MethodePage.test.tsx` (already uses)
  - `VertragDetailPage.test.tsx` (already uses)
  - `VergleichPage.test.tsx` (CREATE)
  - `VergleichDetailPage.test.tsx`
  - `KapitalPage.test.tsx` (CREATE)
  - `LegalFooter.test.tsx` + `DatenschutzPage.test.tsx`
  - `InputsPanel.test.tsx`
  - `InventoryWizard.*.test.tsx`
  - `CombineDashboardSidebar.test.tsx`
  - `CombineIncomePanel.test.tsx`
  - `DashboardCards.test.tsx` (RecommenderCard / LueckeSchliessen /
    ContractDecisionMenu / ContractDecisionCards)
  - `PrintReport.test.tsx` (only for the section-rendering tests; the
    disclaimer-first invariant test does not need viewport sweep)

  When the existing assertion is viewport-agnostic (e.g. "renders
  product label"), `eachViewport` is correct. When the assertion is
  layout-specific (e.g. "shows mobile hamburger"), it stays viewport-
  pinned via `mockViewport('phone')`.

- `CONTEXT.md` — add a "Print report" section under the module map
  with a pointer to PrintReport.tsx + the helpers it consumes.
- `CLAUDE.md` "Quick navigation" — add row "Extend the printable A4
  report" pointing at `PrintReport.tsx` + `printReportRows.ts` if
  created.

### Files NOT modified

- Engine (`src/engine/`) — entirely untouched. PR 11 consumes existing
  helpers + selectors only.
- Workspace schema (`src/storage.ts`, `src/app/portfolioState.ts`) —
  unchanged.
- Compliance surfaces (`DisclaimerBanner`, README's not-advice notice,
  `buildExportCsv`'s disclaimer-first invariant) — unchanged BEHAVIOUR.
  PrintReport.tsx's disclaimer block stays the literal first child.

### Acceptance criteria (verify before opening PR)

- `npm run verify` green locally (lint + vitest + tsc -b + build +
  prerender).
- Disclaimer is the LITERAL first child of `#print-report` in BOTH
  compare-mode and combine-mode branches. Add an assertion to
  `PrintReport.test.tsx` that DOM-walks `#print-report.firstElementChild`
  and confirms it's `.pr-disclaimer-top` for both branches.
- Every new print section uses German labels matching the source page's
  labels (compare with `VergleichDetailPage`, `MethodePage`,
  `MeinPlanPage` sensitivity rows, `KapitalPage` wendepunkte, etc.).
- Every euro display goes through `formatCurrency(value, 0)` — sweep
  the diff for `toLocaleString` and `Math.round`.
- Section headers use dynamic `{retirementAge}`, never hardcoded `67`.
- Every `data-testid` on new tests is registry-derived where it
  references a product id.
- `KapitalPage.test.tsx` + `VergleichPage.test.tsx` exist and test
  at least: empty state (no products / no instances), basic-scenario
  render, and viewport-pinned mobile layout differences.
- `eachViewport` coverage extends to every redesigned-page test +
  every other `src/features/**/*.test.tsx` with DOM-shape assertions.
- No new `window.matchMedia` stubs outside `src/test/viewport.ts`.
  Convert the one in `QaComposer.a11y.test.tsx`.
- All `href` go through `routeToPath(ROUTES.x)`. Grep new files for
  literal `href="/"` — zero matches.
- No `word-break: break-word` (use modern equivalent).
- No `aria-hidden="true"` on empty-state copy.
- Type aliases for object shapes use `interface`, not `type`.
- No emojis in shipped code/copy unless already present (per CLAUDE.md).
- `npx tsc -b` passes — the harder check than `npx tsc --noEmit`.
  PR 9 + PR 10 both had tsc-b-only catches that broke `npm run verify`.

### Decisions to surface to the user (if any genuine ambiguity surfaces during implementation)

The orchestrator has already locked the two scope choices. If during
implementation you discover a NEW genuine product/design call not
covered above, surface it as a terse numbered list and pause for
the user's answer — do not invent the answer yourself. Examples
that would warrant pausing:

1. Where should the new combined "Wohin geht das Geld" print section
   live in section order — directly after the Produktvergleich table,
   or as a separate page (`page-break-before:always`)?
2. For the per-contract Vertrag-Detail blocks: one block per contract
   on its own page (page-break-before), or compact stacked layout
   on shared pages?

But for the cosmetic / convention-following / test-pattern questions,
follow the established convention without asking — that's why the
carry-forward sections above exist.

### Workflow

1. Read all sources of truth (above).
2. Read `PrintReport.tsx` + `PrintReport.css` + `PrintReport.test.tsx`
   in full. Walk the existing compare-mode and combine-mode branches
   so you know exactly where to insert new sections.
3. Audit every `src/features/**/*.test.tsx`. For each, decide:
   viewport-agnostic (needs `eachViewport` wrap) vs viewport-pinned
   (already correct as-is) vs pure logic (skip). Produce the list
   before editing.
4. Implement print sections first (compare-mode then combine-mode),
   then run `npm run verify` to catch tsc-b errors early.
5. Implement page-level tests for KapitalPage + VergleichPage.
6. Sweep the rest of the test files for `eachViewport` coverage.
7. Final `npm run verify` green.
8. Commit with a structured message (see PR 290's commit body
   structure — Reproduction-style sections aren't right here; use
   "Sections added" + "Conventions preserved" + "Tests").
9. Push and open PR via `gh pr create`. Set base = main.

### Commit message template

```text
feat(print+tests): per-page mirror in A4 + cross-cutting viewport sweep (PR 11)

PR 11 of the redesign sequence — extends `PrintReport.tsx` to mirror
every redesigned page in the A4 print output, and runs `eachViewport`
coverage through every DOM-shape-asserting test in `src/features/`.

## Print sections added (compare-mode)
- Wohin geht das Geld — per-product breakdown (reuses vergleich-detail helpers)
- Methode & Quellen — short methodology block

## Print sections added (combine-mode)
- Zusammensetzung & Sensitivität — composition + basis-scenario sensitivity
- Kapital & Auszahlungen — per-instance wendepunkte table
- Vertrag im Detail — per-contract KPI strip + provenance metadata
- Methode & Quellen — short methodology block

## Tests
- `KapitalPage.test.tsx` + `VergleichPage.test.tsx` created (page tests
  were missing on main, only helper tests shipped).
- `eachViewport` coverage extended across N `src/features/**/*.test.tsx`
  files. (Replace N with the actual count.)
- `PrintReport.test.tsx` extended with one test per new section + the
  disclaimer-first invariant covered for both branches.

## Architectural invariants preserved
- Engine entirely untouched.
- Workspace schemaVersion 2 unchanged.
- PRODUCT_REGISTRY single source of product iteration.
- Disclaimer is the LITERAL first child of `#print-report` in both
  compare and combine branches.
- Display rounding boundary unchanged (`formatCurrency`).
- Statutory ages trace to `legalConstants`.
- DisclaimerBanner sessionStorage unchanged.
- No new network calls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Open the PR with `gh pr create --base main` and reply with the PR
URL when done. DO NOT merge — the orchestrator handles merge after
Codex + CodeRabbit both come back green.
````

---

## Orchestrator playbook for monitoring + merge

Once the implementer opens the PR:

1. Poll `gh pr view <N>` for status checks + reviewer comments.
2. CodeRabbit posts a summary comment within ~1-3 min of PR open;
   Codex posts via the `chatgpt-codex-connector[bot]` user within
   1-6 min.
3. For every finding (P0/P1/P2/P3/Major/Minor/nit), spawn a fix agent
   pointing at the same worktree with the verbatim finding text + a
   focused "fix only this; do not modify anything else" guardrail.
4. After every fix push: wait for both reviewers' next pass. CodeRabbit
   auto-runs on push; Codex needs `@codex review` from a real user
   account (the bot identity won't trigger it; see agentic_pipeline
   gotcha #7). If the orchestrator session can't post from a real
   account, the user must post `@codex review` manually OR rely on
   Codex's `pull_request.synchronize` auto-trigger which DOES work.
5. Convergence signal: CodeRabbit "No actionable comments… 🎉" AND
   Codex "Didn't find any major issues" or 👍 reaction on HEAD.
6. Merge: `gh pr merge <N> --squash` (drop `--delete-branch` to avoid
   the worktree gotcha). Then `gh api -X DELETE
   repos/PeterHartwieg/Rentenrechner/git/refs/heads/feat/redesign-print-tests`
   to clean the remote ref.
7. Local cleanup: `git -C C:/Users/Peter/Coding_Projects/Rentenrechner
   worktree remove -f -f .claude/worktrees/pr11-print-tests` and
   `git branch -D feat/redesign-print-tests` (ignore Permission Denied
   on the dir-remove per orchestration gotcha #16).

---

## Estimate

User picked maximalist on both axes. Realistic range:
- Implementation: 4–6 days wall-clock (multi-section print + ~30
  test files swept)
- Review rounds: 3–5 (PR 290 took 5, this PR has wider surface so
  budget for 4–5)
- Total: 8–14 days

Smaller than the engine PRs but wider surface area than any UI PR
since PR 6 (Mein Plan).
