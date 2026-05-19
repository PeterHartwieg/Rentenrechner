# Redesign Handoff — PR 4 onwards

> **Status:** Handoff prompt for a fresh session.
> **Last updated:** 2026-05-19.
> **Previous session landed:** PR 3 — Artikel hub + editorial `ArticleLayout` (squash commit `7505dbe`).
> **Next up:** PR 4 — Methode & Quellen page.

---

## Paste this as the new session's orchestrator prompt

```
You are orchestrating PR 4 of a multi-PR UI redesign for the Rentenrechner
repo (German retirement calculator, public name "RentenWiki.de"). Working
dir is C:\Users\Peter\Coding_Projects\Rentenrechner.

## Sources of truth (read these before doing anything)

1. **docs/redesign/implementation-plan.md** — binding plan for the whole
   redesign. PR 4 spec is in §6 ("Methode & Quellen page").
2. **docs/redesign/handoff-pr4-onwards.md** — this file. Documents
   conventions and pitfalls established by PR 0 + PR 1 + PR 2 + PR 3.
3. **.scratch/redesign-handoff-v2/rentenrechner/project/direction-d-pages.jsx**
   — `DirectionDMethode` mock (~line 695). PR 4 is Sober D, NOT editorial
   A. White bg, IBM Plex Sans, mono labels — the same chrome as the
   tool pages (Deine Angaben / Mein Plan / Vergleich), not the cream
   serif of Startseite + Artikel.
4. **.scratch/redesign-handoff-v2/rentenrechner/project/responsive-views.jsx**
   — `MMethode` (phone, ~line 795) and `TMethode` (tablet, ~line 1816).
5. **CLAUDE.md** — project guide. The "Review guidelines" P0/P1 ladder
   binds every PR. PR-3-era gotchas now apply too — see the
   "Conventions established by PR 1 + PR 2 + PR 3" section below.

## What's already shipped (do not redo)

- **AppShell** (`src/ui/chrome/AppShell.tsx`) — composes DisclaimerBanner +
  StatusBar + AppHeader + body slot + MethodFooter + MobileNav (phone-only).
  Accepts `editorial?: boolean` which flips bg to cream and H1 to serif.
- **AppShell editorial wiring** — `src/App.tsx` computes `isEditorial`
  via `isEditorialChromeRoute(route)` from `src/features/articles/
  articleResolver.ts`. Today the editorial routes are `/`, `/artikel`,
  and every `/<topic>-rechner` route. PR 4 must NOT extend this set:
  `/methode` is Sober D (white + sans), not editorial cream.
- **ArticleLayout** (`src/features/articles/ArticleLayout.tsx`) wraps
  every `src/features/publicPages/*Page.tsx`. PR 4's `MethodePage` does
  NOT use this — it has its own white/sans layout.
- **`/artikel` route** (`ArticleHubPage`) — re-uses `HUB_CLUSTERS` as the
  hub taxonomy via `resolveHubGroups()` (fail-fast at module-eval time).
- **Navigation chrome**: Both `Startseite` and `Artikel` are clickable
  links in the desktop nav and the phone bottom-tab bar. PR 4 should
  promote `Methode` to a clickable link too (currently a placeholder).
- **`view` state lives in `App.tsx`** — adding a new route means adding
  an `else if (route === '/<new>')` branch in App.tsx, plus a registry
  entry, plus an entry in `scripts/prerender.mjs`'s `buildComponentMap`.
- **`useViewport()` hook** with three buckets (phone <640, tablet
  640–1023, desktop ≥1024). Initial state hardcoded `'desktop'` for SSR
  parity; real viewport resolves in `useEffect`.
- **Test utilities:** `src/test/viewport.ts` exports `mockViewport()` and
  `eachViewport()`. Default mock seeded as desktop in `src/vitest.setup.ts`.
- **Self-hosted fonts** in `public/fonts/` — Newsreader, IBM Plex Sans,
  JetBrains Mono. Use IBM Plex Sans for the Methode body.
- **DisclaimerBanner** rendered ONCE at AppShell level. `PrintReport.tsx`
  intentionally keeps its own copy — leave it alone.
- **Chrome tokens** in `src/App.css` (`--rw-bg-paper`, `--rw-bg-cream`,
  `--rw-ink`, `--rw-ink-soft`, `--rw-ink-faint`, `--rw-accent`,
  `--rw-rule`, `--rw-rule-soft`, `--rw-font-serif`, `--rw-font-sans`,
  `--rw-font-mono`, `--rw-mobile-nav-height`). Sober D uses `--rw-bg-paper`
  (#fff) and `--rw-ink` (the cooler ink, not the editorial warm-brown).
- **`__RW_BUILD_DATE__`** Vite define injects build-time UTC date so SSR
  and client agree. Don't recompute dates in components.
- **Landing page (PR 2)** — `src/features/landing/LandingPage.tsx` and
  `LandingPage.css`. Canonical reference for the editorial Hybrid feel.
- **Artikel hub + ArticleLayout (PR 3)** — `src/features/articles/`.
  Reference for: per-page navigate threading, `shouldUseSpaNavigation`
  guard, fail-fast resolver, head-pipeline JSON-LD only.

## Conventions established by PR 1 + PR 2 + PR 3 — follow these

- **SPA-navigation click guards.** Every anchor that intercepts its own
  `onClick` must call `shouldUseSpaNavigation(event)` from
  `src/app/spaNavigation.ts` before `preventDefault()`. This preserves
  Cmd/Ctrl/middle/Shift-click open-in-new-tab. Applies to the new
  Methode-page anchors too (e.g. internal "Mehr zur Vorsorgepauschale"
  jumps, "Annahmen ändern" deep-links into `/eingaben`).
- **Navigate threading.** App.tsx passes `navigate` as a prop to every
  page component. Pages forward it to layouts; layouts forward it to
  LegalFooter / breadcrumb anchors. `MethodePage` should accept
  `navigate?: (target: Route) => void` and pass it to LegalFooter (and
  any inline jump-back links).
- **JSON-LD lives in the head pipeline.** `renderRouteHeadHtml(routeId)`
  emits a single JSON-LD block per route from `publicRouteRegistry`.
  Do NOT emit a body-level `<JsonLd>` inside `MethodePage`. The
  homepage (`/`) is the ONE exception — see `buildJsonLd` in
  `src/seo/routeHead.ts` for the comment that explains why.
- **Fail-fast at module-eval time.** When you cross-reference data
  between two sources of truth (e.g. registry × cluster taxonomy),
  precompute the resolved value at module scope and throw on missing
  entries. See `RESOLVED_HUB_GROUPS` in `src/features/articles/
  articleResolver.ts` for the pattern.
- **Slugify helper.** `src/utils/slugify.ts` exports `slugify(text)` —
  handles German umlauts (ä→ae, ö→oe, ü→ue, ß→ss) and lowercases +
  collapses runs of non-alphanumeric chars. Use this for any in-page
  anchor id generation (Methode has many `<h2>` sections — same TOC
  pattern as ArticleLayout will probably apply).
- **Post-hydration scroll-to-hash.** If `MethodePage` assigns `<h2 id>`
  values in a `useEffect` (the way `ArticleLayout` does), it MUST
  re-trigger `scrollIntoView()` after assignment so direct-fragment
  loads (`/methode#vorsorgepauschale`) actually land on the section.
  See `ArticleLayout.tsx`'s effect at the end of the id-assignment
  block.
- **Test environment.** Component tests use the `// @vitest-environment
  jsdom` directive on line 1. Engine/API tests stay node-env.
- **`inShell()` test helper.** When a test renders a page and needs to
  assert chrome behavior (or just survive AppShell wrapping), use the
  helper pattern from `src/features/publicPages/publicPages.test.tsx` /
  `src/features/landing/LandingPage.test.tsx` /
  `src/features/articles/ArticleHubPage.test.tsx`:
  ```ts
  function inShell(node: ReactElement, route: Route = '/methode') {
    return createElement(AppShell, { route, navigate: () => {}, children: node })
  }
  ```
- **No PowerShell for file rewriting.** PowerShell's `Get-Content -Raw`
  / `Set-Content -Encoding utf8` cycle double-encodes UTF-8 (§ → Â§,
  ü → Ã¼, — → â€"). Use the `Edit` tool or Python with explicit
  `encoding='utf-8'` instead.
- **Viewport tests at all three sizes.** Use `eachViewport()` for
  assertions that should hold everywhere, or `mockViewport(...)` for
  variant-specific tests. `chrome.test.tsx` is the canonical pattern.
- **Brand in public chrome.** "RentenWiki" as logotype (chrome only),
  "RentenWiki.de" everywhere else. Never "Rentenrechner" in user-visible
  text. Internal symbols (file paths, npm package) keep "Rentenrechner".
- **German typography.** Open with `„` (U+201E LOW-9), close with `"`
  (U+201C LEFT DOUBLE) — not ASCII `"`. CodeRabbit's ASSERTIVE profile
  flags mismatches.
- **`publicRouteRegistry[route].h1` must match the rendered H1.** Adding
  `/methode` means adding a registry entry first; the page renders
  `registry.h1`, not a hand-coded string.
- **Statutory values stay in `src/rules/`.** Year-specific in
  `src/rules/de2026.ts`; cross-year in `src/rules/legalConstants.ts`.
  The Methode page renders TABLES of these values — read them from
  the rule modules, never copy literals into the component.
- **Worktree gotcha.** `main` is checked out in a separate worktree at
  `C:/Users/Peter/Coding_Projects/Rentenrechner-conflict-auto`, so
  `git checkout main` fails locally. Branch from origin directly:
  `git checkout -b feat/redesign-methode origin/main`.
- **`gh pr merge --delete-branch` fails the same way** (it tries to
  switch to main to clean up). Use `gh pr merge --squash` then
  `git push origin --delete <branch>` separately.

## Review pipeline reminder

- **CodeRabbit** auto-reviews each push. Profile: ASSERTIVE. Run takes
  ~3–5 min after push.
- **Codex** ONLY reviews on PR-open / ready-for-review. To re-trigger
  after a fix commit, post a `@codex review` comment. Run takes ~3 min.
- Address all P0/P1/Major findings; explain skips with one sentence.
- PR 3 (#275) went through four review rounds. Recurring themes from
  PR-3 reviewers worth applying defensively in PR 4:
  - Modified-click on every SPA-intercept anchor (see `shouldUseSpaNavigation`).
  - JSON-LD-in-head-only (no inline duplicate).
  - Per-route source links (GitHub edit URL based on registry slug).
  - aria-current on active TOC items.
  - Module-eval-time fail-fast for cross-source resolvers.
  - Visible-content audit: structured-data fields must match rendered copy verbatim.

## Your job — PR 4: Methode & Quellen page

Start from a clean branch off main:
`git checkout -b feat/redesign-methode origin/main`.

Goal per the plan §6: a new `/methode` route that renders the Methode &
Quellen page in Sober D (white + IBM Plex Sans + mono labels). Pulls
rule-year tables from `src/rules/de2026.ts` and model docs from
`CONTEXT.md` + the ADRs under `docs/adr/`. Right-rail Quellen +
Mitwirkende with accurate single-maintainer copy + commercial-license
note + donation links.

**Files added:**
- `src/features/methode/MethodePage.tsx` — `/methode` route component.
  White bg, sans body, mono section labels, footnoted `[1][2][3]` refs.
- `src/features/methode/MethodePage.css` — visual styles using the
  existing `--rw-*` tokens (no new color/font constants).

**Files modified:**
- `src/app/useRoute.ts` — add `/methode` to the `Route` union and
  `KNOWN_ROUTES` array.
- `src/seo/publicRouteRegistry.ts` — add a `/methode` entry
  (`jsonLdType: 'WebPage'` — same as `/artikel`, since Methode is a
  reference page, not an article).
- `src/App.tsx` — add a `/methode` branch that renders
  `<MethodePage navigate={navigate} />`. Do NOT extend `isEditorial`
  to include `/methode` — Sober D stays white + sans.
- `scripts/prerender.mjs` — register the new component in
  `buildComponentMap` and add `/methode` to the `hydrateStable` set.
  Do NOT add it to `EDITORIAL_ROUTE_IDS`.
- `src/ui/chrome/AppHeader.tsx` + `src/ui/chrome/MobileNav.tsx` —
  promote the `Methode` tab from placeholder to clickable link
  (`target: '/methode'`). Use the existing `shouldUseSpaNavigation`
  guard.
- `src/ui/chrome/chromeRoutes.ts` — extend `routeToNavId` so
  `/methode` maps to `'method'` (the existing ChromeNavId slot).
- Tests — new `MethodePage.test.tsx`, plus updates to `chrome.test.tsx`
  for the placeholder-count drop (3 → 2 after Methode goes clickable).

**Right-rail content (Quellen + Mitwirkende):**

Single maintainer posture — same as PR 2 / PR 3. NO fictional reviewers,
NO "Fachprüfung", NO CC BY-SA. Copy that's safe to ship:
- Wartung: Peter Hartwieg.
- Lizenz: PolyForm Noncommercial 1.0.0 (Quellcode).
- Kommerzielle Nutzung — z. B. durch Versicherungsmakler oder
  Anlageberater — ist lizenzpflichtig; Kontakt
  `peter@hartwieg.com`.
- Spenden: Stripe + GitHub Sponsors (link to the repo's Sponsors page).
- Quellen: list the laws + BMF/DRV publications cited inline. Each
  entry should be a real, verifiable source — pull from the existing
  `src/rules/de2026.ts` comments and the `docs/adr/` files.

**Rule-year tables — render these from `src/rules/de2026.ts`:**
- Beitragsbemessungsgrenzen (RV / KV/PV West vs. Ost).
- §3 Nr. 63 EStG / §1 SvEV bAV-Förderhöchstbeträge.
- Riester max-Sonderausgaben + Grund-/Kinderzulage.
- Basisrente (§10 Abs. 3 EStG) Sonderausgabenhöchstbetrag.
- Sparerpauschbetrag (§20 Abs. 9 EStG).
- Vorsorgepauschale building blocks.
- Soli-Freigrenze 2026.

DO NOT hardcode any of these numbers in `MethodePage.tsx`. Import
`RULES_YEAR` and the relevant constants from `src/rules/de2026.ts`,
and render them via `formatCurrency` / `formatPercent` from
`src/utils/format.ts`.

**Mobile:**
- Tables collapse to row blocks (vertical key/value pairs, one per
  record). Mirror the convention already used by `ArticleLayout.css`
  for the MDX table treatment.
- Right rail → bottom accordion (via `RightRailAccordion` if it
  shipped in PR 1, or a similar approach).

**Acceptance criteria** (verify before opening PR):
- `npm run verify` green.
- `/methode` renders the Methode page at all three viewports
  (390 / 820 / 1280).
- `Methode` nav tab is active on `/methode`; clickable on both
  desktop AppHeader and phone MobileNav.
- Modified-click (Cmd/Ctrl/middle/Shift) on every SPA-intercept anchor
  preserves browser-default behaviour.
- Disclaimer still session-dismissable; reappears next session.
- Page emits a single WebPage JSON-LD block via the head pipeline (no
  inline `<JsonLd>`).
- Every statutory value rendered on the page traces back to a
  `src/rules/de2026.ts` constant — no hardcoded numbers.
- No new "Rentenrechner" copy in chrome.
- No fictional bylines; truthful single-maintainer + license posture.

## Optional stretch — PR 5 if context permits

PR 5 is the Deine Angaben page (`/eingaben` route). Larger scope —
form receipt look, all three viewports, NumberField padding bumps for
44 px tap targets, Annahmen tab folds in. Plan §6 has the full spec.
Only attempt if PR 4 lands cleanly and the context window has headroom.

## Open follow-ups (do not fix in PR 4)

- **PR 6 follow-up** — Codex P1 on `src/Calculator.tsx:622` re:
  combine-mode Mein-Plan Monte-Carlo pane reads compare-mode
  `monteCarloResult`. The whole sidebar that contains this code is
  scheduled for deletion in PR 6.
- **Public-page reskinning was uniform in PR 3** — all 10 pages used
  the same lightweight skeleton, so no per-page rewrites were needed.
  The handoff note about "heavy bespoke" layouts (`RentenluckeRechnerPage`,
  `EtfVsBavPage`, `BavRechnerPage`) was outdated.

## Constraints — non-negotiable

1. **DisclaimerBanner** stays on `sessionStorage`. AppShell renders it.
   `PrintReport.tsx` keeps its own. Both are P0.
2. **No new network calls.** Self-host any new fonts. No CDN fetches.
3. **Brand:** `RentenWiki` in chrome, `RentenWiki.de` in titles / OG /
   exports. Never "Rentenrechner" in public copy.
4. **No statutory values outside `src/rules/`.** Methode renders
   tables of statutory values — pull from the rule modules, never
   inline.
5. **Engine, storage, prerender pipeline untouched.** PR 4 is UI only.
   The SSG prerender script changes only its component map +
   `hydrateStable` set.

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

## First step

1. Read `docs/redesign/implementation-plan.md` §6 PR 4 lines.
2. Read `direction-d-pages.jsx` (`DirectionDMethode` ~line 695) and
   skim `responsive-views.jsx` for `MMethode` / `TMethode`.
3. Branch: `git checkout -b feat/redesign-methode origin/main`.
4. Decide which rule-year tables to render and which Quellen to list.
   Report your call to the user before implementing.
5. Report back with: proposed PR 4 file list, table/source decision,
   any deviations from the plan, ask for go.
```

---

## Repo state at handoff

- `main` is at `7505dbe` (squash-merge of PR #275 — feat(articles):
  Artikel hub + editorial ArticleLayout).
- `feat/redesign-artikel` branch deleted both remotely and locally.
- A `Rentenrechner-conflict-auto` sibling worktree still holds main
  checked out; local `git checkout main` fails. Branch from
  `origin/main` directly.
- Local working tree may still have `.scratch/redesign-handoff-v2/`
  untracked — intentional, do not commit the bundle.

## Where the PR-3 patterns live

- `src/features/articles/ArticleHubPage.tsx` + `.css` — editorial hub
  layout (cream + serif, sectioned groups, hub kicker + Stand line).
- `src/features/articles/ArticleLayout.tsx` + `.css` — wrapper for
  every public page (breadcrumb, TOC, related-routes right rail,
  GitHub-edit link, post-hydration scroll-to-hash, aria-current TOC,
  per-route github-edit-href default).
- `src/features/articles/articleResolver.ts` — fail-fast at
  module-eval (`RESOLVED_HUB_GROUPS`); `resolveHubGroups()`,
  `findArticleByPath`, `isEditorialChromeRoute`.
- `src/app/spaNavigation.ts` — `shouldUseSpaNavigation(event)` guard.
- `src/utils/slugify.ts` — German-aware slug helper.
- `src/App.tsx` — navigate threading, `isEditorial` derivation.
- `scripts/prerender.mjs` — `EDITORIAL_ROUTE_IDS` set + component map.

## Estimated effort

- PR 4 alone: ~3 days (per plan §9).
- PR 4 + start of PR 5: ~5 days if context permits.
- Don't push to PR 6+ in the same session — each PR deserves its own
  context budget.
