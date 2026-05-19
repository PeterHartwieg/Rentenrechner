# Redesign Handoff — PR 5 onwards

> **Status:** Handoff prompt for a fresh session.
> **Last updated:** 2026-05-19.
> **Previous session landed:** PR 4 — Methode & Quellen page (squash commit `13fdde5d06`, merged via #278).
> **Next up:** PR 5 — Deine Angaben page (`/eingaben` route).

---

## Paste this as the new session's orchestrator prompt

```
You are orchestrating PR 5 of a multi-PR UI redesign for the Rentenrechner
repo (German retirement calculator, public name "RentenWiki.de"). Working
dir is C:\Users\Peter\Coding_Projects\Rentenrechner.

## Sources of truth (read these before doing anything)

1. **docs/redesign/implementation-plan.md** — binding plan for the whole
   redesign. PR 5 spec is in §6 ("Deine Angaben page").
2. **docs/redesign/handoff-pr5-onwards.md** — this file. Documents
   conventions and pitfalls established by PR 0 + PR 1 + PR 2 + PR 3 + PR 4.
3. **.scratch/redesign-handoff-v2/rentenrechner/project/direction-d-pages.jsx**
   — `DirectionDAngaben` mock. PR 5 is Sober D (same chrome as Mein Plan /
   Vergleich / Methode), NOT editorial A.
4. **.scratch/redesign-handoff-v2/rentenrechner/project/responsive-views.jsx**
   — `MAngaben` (phone) and `TAngaben` (tablet).
5. **CLAUDE.md** — project guide. The "Review guidelines" P0/P1 ladder
   binds every PR. The "UI rounding boundary" section is load-bearing for
   PR 5 because every input bound to engine output flows through
   `<NumberField>`.

## What's already shipped (do not redo)

- **AppShell** (`src/ui/chrome/AppShell.tsx`) — DisclaimerBanner +
  StatusBar + AppHeader + body + MethodFooter + MobileNav. `editorial?`
  flag flips bg + H1 font; PR 5 must NOT extend `isEditorialChromeRoute`
  to include `/eingaben` — Sober D stays white + sans.
- **`/methode` route + Sober D template** (PR 4). `src/features/methode/
  MethodePage.tsx` is the canonical Sober D reference layout: white bg,
  IBM Plex Sans body, mono `§` section labels, stable section ids,
  module-eval-time fail-fast resolvers, right-rail aside that folds to
  bottom on phone. Read it before writing AngabenPage; the chrome +
  responsive + a11y patterns transfer 1-1.
- **`/artikel` route + editorial ArticleLayout** (PR 3). Reuse the
  `shouldUseSpaNavigation` guard and `<navigate>` threading pattern.
- **`view` state in `App.tsx`** — adding a new route means: (1) a
  registry entry, (2) an `else if (route === '/<new>')` branch in
  App.tsx, (3) a `buildComponentMap` + `hydrateStable` entry in
  `scripts/prerender.mjs`, (4) a `routeToNavId` mapping in
  `src/ui/chrome/chromeRoutes.ts`.
- **`useViewport()` hook** (phone <640 / tablet 640-1023 / desktop ≥1024).
- **Self-hosted fonts** in `public/fonts/`.
- **DisclaimerBanner** rendered once at AppShell level — leave alone.
- **Chrome tokens** in `src/App.css` (`--rw-*`).
- **`__RW_BUILD_DATE__`** Vite define — don't recompute dates in
  components.

## Conventions established by PR 1 + PR 2 + PR 3 + PR 4 — follow these

Carry forward from the PR 4 handoff still applies (SPA-navigation guards,
navigate threading, JSON-LD in head only, fail-fast resolvers, slugify
helper, post-hydration scroll-to-hash, jsdom + `inShell()` helper, no
PowerShell for file rewriting, viewport tests, brand discipline, German
typography, statutory values in `src/rules/`, `gh pr merge` worktree
gotcha). These are now load-bearing — read the PR 4 handoff section if
any of them are unfamiliar.

NEW conventions from PR 4's seven review rounds:

- **Statutory hardcodes have zero tolerance in user-visible copy.**
  Round-1 flagged Ertragsanteil literals (0.18 / 0.17). Round-6 flagged
  `30 %` Aktienfonds-Teilfreistellung and `23` PV-Kinderlosen-Schwelle.
  Every percentage, age, EUR threshold, and statutory rate in JSX text
  must be imported from `src/rules/legalConstants.ts` (cross-year, e.g.
  `aktienfondsTeilfreistellungPrivat`, `pvBeitragszuschlagKinderloseMinAge`,
  `ertragsanteilByAge`) or read from `activeRules` (year-bound). If a
  constant doesn't exist yet, add it to `legalConstants.ts` with a
  paragraph-citation doc-comment. Sweep every numeric literal in
  user-visible JSX before opening the PR.
- **Cohort helpers belong in `legalConstants.ts`, not the year file.**
  Round-3 moved `besteuerungsanteilGrv`, `versorgungsfreibetrag`,
  `werbungskostenPauschalRenten`, `werbungskostenPauschalVersorgungsbezuege`,
  and `sonderausgabenPauschbetrag` out of `de2026.ts` and into
  `legalConstants.ts`. Year-specific values (e.g. BBG, Bezugsgröße,
  Rentenwert) stay in `de2026.ts` and reach pages via `activeRules`.
- **Stable anchor IDs.** Round-4 caught year-bearing section anchors
  that broke `/methode#…` links on year rollover. ANY section anchor
  on `/eingaben` (`§ Person`, `§ Einkommen`, etc.) needs a stable `id`
  field separate from the visible title.
- **Module-eval-time fail-fast for cross-source lookups.** Round-5
  added `RESOLVED_RENDITEN` at module scope. If `AngabenPage` reads
  `defaultAssumptions.returnScenarios` (or any registry/cluster cross
  ref), precompute at module scope and throw on missing entries — same
  pattern as `RESOLVED_HUB_GROUPS` in `articleResolver.ts` and
  `RESOLVED_RENDITEN` in MethodePage.tsx.
- **`returnScenarios[0]` is konservativ, not basis** (CLAUDE.md gotcha).
  Always look up by `id` (`'konservativ' | 'basis' | 'optimistisch'`),
  never by position. PR 4 round-3 was the second time this bit a
  reviewer — assume PR 5 will touch returnScenarios via Annahmen tab.
- **Don't synthesize publication identifiers.** Round-7 caught
  `BMF-Schreiben ${RULES_YEAR}-01-13` — the BMF circular IS annually
  re-issued but not always dated `YYYY-01-13`. Same for BGBl. issue
  numbers (fixed historical). Use evergreen labels ("BMF-Schreiben
  (jährlich)") OR look up the canonical citation from rules metadata.
  Where the publication NAME carries the year (e.g. `SVBezGrV ${YEAR}`,
  `Rentenwertbestimmungsverordnung ${YEAR}`), interpolate is fine.
- **Statutory footnotes must cite the right paragraph.** Round-7 caught
  the 30 % Teilfreistellung cited under `§ 20 EStG` footnote — the value
  actually comes from `§ 20 Abs. 1 InvStG`. If `AngabenPage` cites any
  statute, double-check the paragraph matches the value source. Every
  SOURCES entry must be cited at least once in the body.
- **Pre-existing engine bugs go to follow-up issues, not the redesign
  PR.** Round-3 of PR 4 surfaced a pre-existing Versorgungsfreibetrag
  schedule bug for the 2021/2022 cohorts (filed as issue #279). Do not
  scope-creep wrong-number-math fixes into a UI PR.

## Review-loop reality (from PR 4)

- **CodeRabbit auto-walkthrough doesn't always fire on synchronize.**
  Round 5/7 of PR 4 needed explicit `@coderabbitai review` retriggers
  after push. If no review lands within 5 min of push, comment it
  yourself. CodeRabbit's incremental review respects "since last
  reviewed commit", so the trigger is cheap.
- **Codex is inconsistent.** Sometimes responds in 5 min, sometimes
  silent. `@codex review` retrigger usually works. If Codex stays
  silent across two retriggers, assume they have no findings (their
  "thumbs up" path is also silent).
- **Plan for 5-7 review rounds, not 2-3.** PR 4 took seven review
  rounds — the user has explicitly said "fix everything" because the
  redesign is foundation work. Treat 🟡 minor and 🔵 nit findings as
  must-fix, not skip. Skip only what CodeRabbit themselves label as
  "low value", and even then only after stating the rationale.
- **CodeRabbit re-tracks line comments forward.** A "duplicate (1)"
  count means an earlier finding still applies to the new commit
  (because the fix didn't address it OR position tracking surfaced it
  on a different line). Always expand the duplicate-comment collapse
  in the review body to confirm.
- **Both reviewers eventually converge.** Round-8 of PR 4 had
  CodeRabbit explicitly saying "Nothing further to flag here" and
  Codex saying "Didn't find any major issues. Nice work!" That's the
  signal to merge.

## CI workflow gating reminder

`feat/redesign-*` branches do NOT trigger the agent-only workflows
(`pr-verify` / `claude-review` / `review-loop`). Those are gated to
`agent/issue-*` and `automation/retro-curate-*` branch prefixes. So
`npm run verify` runs locally in the implementer's worktree, NOT in CI.
You must verify locally before merge. The Cloudflare `Workers Builds:
rentenwiki` check runs on all branches; treat it as the only meaningful
CI signal for `feat/*` PRs.

## Your job — PR 5: Deine Angaben page

Start from a clean branch off main:
`git checkout -b feat/redesign-angaben origin/main`.

Goal per plan §6: a new `/eingaben` route that replaces the current
input-panel surface (compare-mode `InputsPanel` and combine-mode wizard
inputs flow). Sections: **§ 1 Person / § 2 Einkommen / § 3 Renteneintritt
/ § 4 Annahmen**. The `Annahmen` tab from the old nav folds in here
(remove from chrome nav). Form-receipt visual treatment (mono value,
dotted-underline hints) applied at all three viewports.

**Files added:**
- `src/features/inputs/AngabenPage.tsx` — `/eingaben` route component.
  Sober D chrome, four ordered sections, sticky left TOC (desktop +
  tablet), right-rail "Warum wir das fragen" explanations.
- `src/features/inputs/AngabenPage.css` — visual styles using existing
  `--rw-*` tokens.

**Files modified:**
- `src/app/useRoute.ts` — add `/eingaben` to `Route` union + `KNOWN_ROUTES`.
- `src/seo/publicRouteRegistry.ts` — `/eingaben` entry (`jsonLdType:
  'WebPage'`).
- `src/App.tsx` — `else if (route === '/eingaben')` branch. Do NOT
  extend `isEditorial`.
- `scripts/prerender.mjs` — register in `buildComponentMap` + add to
  `hydrateStable`. NOT in `EDITORIAL_ROUTE_IDS`.
- `src/ui/chrome/AppHeader.tsx` + `src/ui/chrome/MobileNav.tsx` — wire
  the "Angaben" / "Plan" / "Vergleich" placeholder tabs (whichever maps
  to inputs) to clickable links to `/eingaben`. Use the
  `shouldUseSpaNavigation` guard. **Remove the Annahmen tab** from
  the nav since it folds into Section 4.
- `src/ui/chrome/chromeRoutes.ts` — extend `routeToNavId` so
  `/eingaben` maps to the right ChromeNavId. May need a new id if
  none of `'home' | 'plan' | 'compare' | 'artikel' | 'method'` fits
  semantically.
- `src/features/inputs/productUiRegistry.tsx` — reskin per-product
  input components to form-receipt look (mono value, dotted-underline
  hints) at all three viewports. **Behavior unchanged** — only the
  visual envelope and tap-target padding change. Validation, evidence
  states, provenance primitives stay wired exactly as today.
- `src/ui/NumberField.tsx` — padding bump at phone breakpoint (44 px
  tap target). Desktop and tablet padding unchanged. Verify the
  Calculator's compare-mode dashboard doesn't visually regress at
  phone breakpoint as a side effect.
- Tests — `AngabenPage.test.tsx` (new) + viewport tests for the
  NumberField padding bump + nav-tab tests reflecting Annahmen-tab
  removal.

**Right-rail content ("Warum wir das fragen"):**

One explanation card per section. Truthful, single-maintainer copy —
no fictional reviewers, no fabricated user stories. Examples (rewrite
to fit the mock):

- **§ Person:** "Geburtsjahr und Renteneintritt steuern Kohortenwerte
  (§ 22 Nr. 1, § 19 Abs. 2 EStG). Familienstand schaltet das
  Ehegattensplitting (§ 32a Abs. 5 EStG)."
- **§ Einkommen:** "Bruttogehalt entscheidet über Vorsorgepauschale
  (§ 39b EStG) und §3 Nr. 63 / §1 SvEV-Förderhöchstbeträge bei der
  bAV."
- **§ Renteneintritt:** "Renteneintrittsalter und -jahr fixieren
  Besteuerungsanteil und Versorgungsfreibetrag — beides cohort-bound."
- **§ Annahmen:** "Renditeannahmen folgen historischen MSCI-World-
  Renditen über 30 Jahre rollierend (konservativ = 10er-Quantil,
  Basis = realer Median, optimistisch = 90er-Quantil). Inflation:
  EZB-Ziel 2 %."

Numbers in these strings (`§ 3 Nr. 63`, `§ 32a Abs. 5`, `2 %`) are
statute citations or well-known constants — fine as literals when they
refer to a paragraph number, not a value. The `2 %` EZB target IS a
value but it's policy, not statute; document as "EZB-Mittelfrist-Ziel"
and accept the literal.

**Form-receipt visual treatment:**

Per the mock — input value renders as IBM Plex Mono inline; descriptive
text is sans-serif body with **dotted-underline** for hover-revealed
helper context (use `border-bottom: 1px dotted var(--rw-rule)` + a `<InfoTip>`
trigger, not browser `title` tooltips). The existing `<EvidenceBadge>`
and provenance primitives in `src/features/results/provenance.tsx` keep
their behavior; restyle to mono labels matching the rest of Sober D.

**Mobile:**
- 2-column form grid → 1-column at phone.
- Right rail → bottom accordion at phone (mirror MethodePage pattern,
  CSS-only fold).
- NumberField padding bumps to 12-14px vertical at phone breakpoint
  for 44 px tap target. Verify the resulting tap target with
  `getComputedStyle(...).paddingTop + height + paddingBottom ≥ 44`.
- `<EvidenceBadge>` tap target also needs the 44 px treatment if it's
  interactive at phone.

**Acceptance criteria** (verify before opening PR):
- `npm run verify` green.
- `/eingaben` renders all four sections at 390 / 820 / 1280 px.
- "Angaben" nav tab is active on `/eingaben`; clickable on both
  desktop AppHeader and phone MobileNav.
- Annahmen tab no longer appears in nav.
- Modified-click (Cmd/Ctrl/middle/Shift) on every SPA-intercept
  anchor preserves browser-default behavior.
- All NumberField + EvidenceBadge interactive elements at phone
  breakpoint measure ≥ 44 × 44 px.
- Compare-mode dashboard (`/`) and combine-mode wizard input flow
  do NOT visually regress as a side effect of the NumberField /
  productUiRegistry changes. Smoke-test both.
- Disclaimer still session-dismissable; reappears next session.
- Page emits a single WebPage JSON-LD via the head pipeline (no
  inline `<JsonLd>`).
- Every statutory value rendered traces to `src/rules/legalConstants.ts`
  or `activeRules`.
- No new "Rentenrechner" copy in chrome.
- Truthful single-maintainer posture.

## Optional stretch — PR 6 if context permits

PR 6 is Mein Plan (combine mode) — large scope (~7 days estimated):
new layout, sensitivity rows ("Was sich ändern würde, wenn …"),
delete-page-by-page of the sidebar code from PR 0. Plan §6 has the
full spec. Don't attempt unless PR 5 lands cleanly with significant
context budget remaining.

## Open follow-ups (do not fix in PR 5)

- **#279** — Pre-existing Versorgungsfreibetrag 2021/2022 cohort bug
  in `src/rules/legalConstants.ts`. Wrong-number-fix with full
  preflight; needs its own PR with regression test.
- **PR 6 follow-up** — Codex P1 on `src/Calculator.tsx:622` re:
  combine-mode Mein-Plan Monte-Carlo pane reads compare-mode
  `monteCarloResult`. Whole sidebar scheduled for deletion in PR 6.

## Constraints — non-negotiable

1. **DisclaimerBanner** stays on `sessionStorage`. AppShell renders
   it. `PrintReport.tsx` keeps its own. Both are P0.
2. **No new network calls.** Self-host any new fonts. No CDN fetches.
3. **Brand:** `RentenWiki` in chrome, `RentenWiki.de` in titles / OG /
   exports. Never "Rentenrechner" in public copy.
4. **No statutory values outside `src/rules/`.** Sweep every literal
   in AngabenPage.tsx before opening the PR.
5. **Engine, storage, prerender data shapes untouched.** PR 5 is UI
   only (plus NumberField padding which is presentational). Validation
   logic, evidence-state derivation, provenance, share-URL round-trip
   all stay byte-identical.

## Working style

- Read the plan + the two mock files in full before doing anything.
- Use Plan / Explore agents for broad reading; Read / Grep / Glob when
  you know the file.
- For test edits across many files, use Python (UTF-8 safe) not
  PowerShell.
- Pop options to the user as terse numbered lists when you hit a real
  decision. Don't restate locked decisions.
- Test at all three viewports.
- End-of-turn summaries: one or two sentences.
- Plan for 5-7 review rounds. Each round, sweep CodeRabbit comments
  for "duplicate (N)" collapses — don't trust the headline "Actionable
  comments posted" count alone.

## First step

1. Read `docs/redesign/implementation-plan.md` §6 PR 5 lines.
2. Read `direction-d-pages.jsx` (`DirectionDAngaben`) and skim
   `responsive-views.jsx` for `MAngaben` / `TAngaben`.
3. Branch: `git checkout -b feat/redesign-angaben origin/main`.
4. Identify: (a) the current Annahmen-tab location in chrome (it's
   visual placeholder per `chromeRoutes.ts`), (b) which existing tab
   should promote to `/eingaben`, (c) any productUiRegistry consumers
   beyond `InputsPanel` to confirm scope.
5. Report your call to the user with: proposed PR 5 file list, the
   nav-tab decision, the "Warum wir das fragen" copy you'll ship,
   any deviations from the plan. Ask for go.
```

---

## Repo state at handoff

- `main` is at squash commit `13fdde5d06` (PR #278 — feat(methode):
  Methode & Quellen page).
- `feat/redesign-methode` branch deleted both remotely and locally.
- A `Rentenrechner-conflict-auto` sibling worktree still holds main
  checked out; local `git checkout main` fails. Branch from
  `origin/main` directly.
- Local working tree may still have `.scratch/redesign-handoff-v2/`
  untracked — intentional, do not commit the bundle.

## Where the PR-4 patterns live

- `src/features/methode/MethodePage.tsx` + `.css` — canonical Sober D
  reference. Stable section ids, mono `§` kickers, right-rail aside,
  module-eval fail-fast (`RESOLVED_RENDITEN`).
- `src/rules/legalConstants.ts` — now houses cohort helpers plus
  `aktienfondsTeilfreistellungPrivat` and `pvBeitragszuschlagKinderloseMinAge`
  (added in PR 4 rounds 3 + 6). Pattern: cross-year statutory data
  with paragraph-citation doc-comments.
- `src/features/methode/MethodePage.test.tsx` — pattern for `inShell()`,
  modified-click assertions, `eachViewport()` smoke, registry-driven
  H1 check, no-inline-JSON-LD assertion, fictional-byline absence.

## Review-loop appendix

PR 4 went through seven review rounds before clean. Commit progression:
1. `67afe5f` initial — 4 findings (1 P0 Ertragsanteil, 1 Minor footnote, 1 Nit clip CSS, 1 dup)
2. `09d8353` round 1 fix — addressed all four
3. `6918899` round 2 fix — Codex P1 cohort-helper drift
4. `4d3964d` round 3 fix — moved 5 helpers to legalConstants + dropped year-pinned filename in copy + uncited SOURCES + rendite dedup + ertragsanteilByAge consistency
5. `9ebe125` round 4 fix — stable section ids + RULES_YEAR in citations
6. `6185a5d` round 5 fix — module-eval fail-fast on scenarioById
7. `b80f3c7` round 6 fix — externalized 30% + age 23 → legalConstants
8. `003a6de` round 7 fix — de-pinned BMF date + corrected InvStG citation + new SOURCES entry

Both reviewers explicitly approved round 8. Same cadence likely for PR 5.

## Estimated effort

- PR 5 alone: ~5 days (per plan §9; bigger than PR 4 due to the
  productUiRegistry reskin touching every product's input component).
- PR 5 + start of PR 6: not advised in one session — PR 6 (Mein Plan)
  is the largest single-PR scope in the redesign (~7 days).
- Plan for 7 review rounds; budget ~3 hours of orchestration time
  beyond the implementation work.
