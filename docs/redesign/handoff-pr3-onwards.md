# Redesign Handoff — PR 3 onwards

> **Status:** Handoff prompt for a fresh session.
> **Last updated:** 2026-05-19.
> **Previous session landed:** PR 0 (sidebar merge), PR 1 (chrome foundation), small chrome fixups, and PR 2 (Editorial A Landing page) — squash commit `a646443`.
> **Next up:** PR 3 — Artikel hub + reskin of SEO pages.

---

## Paste this as the new session's orchestrator prompt

```
You are orchestrating PR 3 of a multi-PR UI redesign for the Rentenrechner
repo (German retirement calculator, public name "RentenWiki.de"). Working
dir is C:\Users\Peter\Coding_Projects\Rentenrechner.

## Sources of truth (read these before doing anything)

1. **docs/redesign/implementation-plan.md** — binding plan for the whole
   redesign. PR 3 spec is in §6 ("Artikel hub + reskin of SEO pages").
2. **docs/redesign/handoff-pr3-onwards.md** — this file. Documents
   conventions and pitfalls established by PR 0 + PR 1 + PR 2.
3. **.scratch/redesign-handoff-v2/rentenrechner/project/direction-hybrid.jsx**
   — editorial Landing + Articles mock. PR 3 visuals live in
   `HybridArtikelIndex` (hub) and `HybridArtikel` (article detail).
4. **.scratch/redesign-handoff-v2/rentenrechner/project/responsive-views.jsx**
   — phone + tablet variants. Search for `MArtikelIndex` / `MArtikel`
   (phone) and `TArtikelIndex` / `TArtikel` (tablet).
5. **CLAUDE.md** — project guide. The "Review guidelines" P0/P1 ladder
   binds every PR. PR-2-era gotchas now apply too: (a) no
   "Rentenrechner" string in public chrome; (b) build date from
   `__RW_BUILD_DATE__` Vite define, not `new Date()`; (c) German
   typography uses `„…"` (U+201E + U+201C), never ASCII `"`.

## What's already shipped (do not redo)

- **AppShell** (`src/ui/chrome/AppShell.tsx`) — composes DisclaimerBanner +
  StatusBar + AppHeader + body slot + MethodFooter + MobileNav (phone-only).
  Accepts `editorial?: boolean` which flips bg to cream and H1 to serif.
- **AppShell editorial wiring (PR 2)** — `src/App.tsx` computes
  `isEditorial` per route. Today only `/` (in landing view) is editorial;
  PR 3 must extend this to `/artikel` and to each `/<topic>-rechner` page
  that PR 3 wraps in `ArticleLayout`. The same flag is mirrored in
  `scripts/prerender.mjs` for the SSG pass — keep them in sync.
- **`view` state lives in `App.tsx`** since PR 2 (the old
  `CalculatorRoute` wrapper is gone). Adding a new route means adding an
  `else if (route === '/<new>')` branch in App.tsx; the AppShell wrapper
  takes care of chrome.
- **`useViewport()` hook** with three buckets (phone <640, tablet 640–
  1023, desktop ≥1024). Initial state hardcoded `'desktop'` for SSR
  parity; real viewport resolves in `useEffect`.
- **Test utilities:** `src/test/viewport.ts` exports `mockViewport()` and
  `eachViewport()`. Default mock seeded as desktop in `src/vitest.setup.ts`.
- **Self-hosted fonts** in `public/fonts/` — Newsreader, IBM Plex Sans,
  JetBrains Mono. `@fontsource` packages are devDeps; woff2 files committed.
- **DisclaimerBanner** rendered ONCE at AppShell level. `PrintReport.tsx`
  intentionally keeps its own copy — leave it alone.
- **Chrome tokens** in `src/App.css` (`--rw-bg-paper`, `--rw-bg-cream`,
  `--rw-ink-editorial{,-soft,-faint}`, `--rw-accent`, `--rw-rule-cream`,
  `--rw-font-serif`, `--rw-font-sans`, `--rw-font-mono`,
  `--rw-mobile-nav-height`).
- **Landing page (PR 2)** — `src/features/landing/LandingPage.tsx` and
  `LandingPage.css` are the canonical reference for editorial layouts
  (kicker / serif H1 with italic accent / aside cards / hub clusters).
- **hubClusters resolver pattern (PR 2)** —
  `src/features/landing/hubClusters.ts` exports
  `resolveFeaturedArticles()` + `countHubArticles()` + the
  `FEATURED_ARTICLE_HREFS` curated list. The resolver THROWS on unknown
  hrefs (CodeRabbit feedback) — copy this fail-fast pattern when wiring
  PR 3's article groups.
- **`__RW_BUILD_DATE__`** Vite define injects build-time UTC date so SSR
  and client agree. Don't recompute dates in components.

## Conventions established by PR 1 + PR 2 — follow these

- **Test environment.** Component tests use the `// @vitest-environment
  jsdom` directive on line 1. Engine/API tests stay node-env.
- **`inShell()` test helper.** When a test renders a page and needs to
  assert chrome behavior (or just survive AppShell wrapping), use the
  helper pattern from `src/features/publicPages/publicPages.test.tsx` /
  `src/features/landing/LandingPage.test.tsx`:
  ```ts
  function inShell(node: ReactElement, route: Route = '/') {
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
- **`publicRouteRegistry[route].h1` must match the rendered H1.** The
  registry comment at line 97 says so; PR 2's review confirmed it. If
  you reskin a page and rewrite its H1, update the registry too.
- **Privacy copy is truthful.** "Wir speichern nichts" is forbidden —
  the workspace IS persisted to localStorage. Use "bleibt lokal in
  deinem Browser — nichts wird an einen Server gesendet" or similar.
- **Featured / curated lists fail fast on drift.** When you cross-
  reference data between two sources of truth (e.g. registry × curated
  href list), make the resolver throw on missing entries — silent
  omissions caused review pushback in PR 2.
- **Worktree gotcha.** `main` is checked out in a separate worktree at
  `C:/Users/Peter/Coding_Projects/Rentenrechner-conflict-auto`, so
  `git checkout main` fails locally. Branch from origin directly:
  `git checkout -b feat/redesign-artikel origin/main`.
- **`gh pr merge --delete-branch` fails the same way** (it tries to
  switch to main to clean up). Use `gh pr merge --squash` then
  `git push origin --delete <branch>` separately.

## Review pipeline reminder

- **CodeRabbit** auto-reviews each push. Profile: ASSERTIVE. Run takes
  ~3–5 min after push.
- **Codex** ONLY reviews on PR-open / ready-for-review. To re-trigger
  after a fix commit, post a `@codex review` comment. Run takes ~3 min.
- Address all P0/P1/Major findings; explain skips with one sentence.
- Both reviewers landed clean on PR 2 (b5e649a → 7cb0605). The PR-2
  feedback that mattered: Codex flagged misleading privacy copy;
  CodeRabbit flagged a silent fall-through and a quote-mark mismatch.

## Your job — PR 3: Artikel hub + reskin of SEO pages

Start from a clean branch off main:
`git checkout -b feat/redesign-artikel origin/main`.

Goal per the plan §6: a `/artikel` hub plus an `ArticleLayout` wrapper
applied to each `features/publicPages/*Page.tsx`. Cream + serif body,
TOC left rail on desktop, meta right rail with author + Stand line,
footnoted `[1][2][3]` refs.

**Files added:**
- `src/features/articles/ArticleHubPage.tsx` — `/artikel` route. Groups
  `publicRouteRegistry` entries into Grundlagen / Produkte / Steuern (or
  the existing `HUB_CLUSTERS` headings — reuse if the taxonomy fits).
- `src/features/articles/ArticleLayout.tsx` — shared editorial wrapper.
  Renders cream bg, serif body, TOC left rail (desktop only — hidden
  on tablet + phone per the responsive views), meta right rail, optional
  footnotes footer.
- `src/features/articles/ArticleLayout.css` — visual styles using the
  existing editorial tokens (no new color/font constants).

**Files modified:**
- `src/app/useRoute.ts` — add `/artikel` to the `Route` union and
  `KNOWN_ROUTES` array. Add a `publicRouteRegistry` entry too (title,
  metaDescription, h1, jsonLdType: 'WebPage', etc.).
- `src/App.tsx` — add an `/artikel` branch that renders
  `<ArticleHubPage />`. Extend `isEditorial` to include `/artikel` and
  every `/<topic>-rechner` route once wrapped in ArticleLayout.
- `scripts/prerender.mjs` — extend the `editorial` set to match.
- Each `src/features/publicPages/*Page.tsx` — wrap content body in
  `<ArticleLayout>`. Heavy bespoke pages (`RentenluckeRechnerPage`,
  `EtfVsBavPage`, `BavRechnerPage`) may need partial rewrites — flag in
  the PR description before committing the deeper rework.
- Tests — adopt `inShell()` pattern for each public-page test that
  asserts chrome behavior. Use `eachViewport()` for layout assertions.

**Mobile:**
- Article hub 2-col grid → 1-col.
- TOC left rail hides on tablet + phone; in-content `<h2 id>` anchor
  jumps remain so the legacy SEO permalinks keep working.

**Critical content correction** (locked decision §3 of the plan): mock
copy includes fictional authors ("M. Sahin · Autorin", "L. Vogel ·
Prüfung", "K. Bauer"). Replace with truthful posture: author = "Peter
Hartwieg" (or omit author byline entirely until contributors exist),
"Fachprüfung" line replaced by a "Stand: <dateModified>" line sourced
from the registry. Article counts come from
`countHubArticles()` / a new sibling helper — never hardcoded.

**Acceptance criteria** (verify before opening PR):
- `npm run verify` green.
- `/artikel` renders the hub at all three viewports (390 / 820 / 1280).
- Each `/<topic>-rechner` route renders inside `ArticleLayout` with TOC
  on desktop, no TOC on tablet/phone, meta right rail visible at
  desktop+tablet.
- Disclaimer still session-dismissable; reappears next session.
- No regression in the existing `publicRouteRegistry` JSON-LD blocks
  (`Article` / `WebApplication` types preserved per registry).
- No new "Rentenrechner" copy in chrome; no fictional bylines; no
  ASCII closing quote next to a German opening one.

## Optional stretch — PR 4 if context permits

PR 4 is the Methode & Quellen page (`/methode` route). Same editorial
treatment, smaller scope. Plan §6 has the full spec. Only attempt if PR
3 lands cleanly and the context window has headroom.

## Open follow-ups (do not fix in PR 3)

- **PR 6 follow-up** — Codex P1 on `src/Calculator.tsx:622` re:
  combine-mode Mein-Plan Monte-Carlo pane reads compare-mode
  `monteCarloResult`. The whole sidebar that contains this code is
  scheduled for deletion in PR 6.
- **`publicPages/*` heavy layouts** — `RentenluckeRechnerPage` and
  `EtfVsBavPage` carry hand-rolled MDX-ish layouts. Reskinning may turn
  into rewriting; that's expected per plan §8 risk #6.

## Constraints — non-negotiable

1. **DisclaimerBanner** stays on `sessionStorage`. AppShell renders it.
   `PrintReport.tsx` keeps its own. Both are P0.
2. **No new network calls.** Self-host any new fonts. No CDN fetches.
3. **Brand:** `RentenWiki` in chrome, `RentenWiki.de` in titles / OG /
   exports. Never "Rentenrechner" in public copy.
4. **No statutory values outside `src/rules/`.** Year and rule-number
   citations on article copy are OK as prose; literal numbers come from
   the rule modules.
5. **Engine, storage, prerender pipeline untouched.** PR 3 is UI only.
   The SSG prerender script changes only its `editorial` set.

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

1. Read `docs/redesign/implementation-plan.md` §6 PR 3 lines.
2. Read `direction-hybrid.jsx` (`HybridArtikelIndex` ~line 230,
   `HybridArtikel` ~line 350) and skim `responsive-views.jsx` for
   `MArtikelIndex` / `MArtikel` / `TArtikelIndex` / `TArtikel`.
3. Branch: `git checkout -b feat/redesign-artikel origin/main`.
4. Decide whether the hub re-uses `HUB_CLUSTERS` or introduces its own
   Grundlagen / Produkte / Steuern taxonomy. Report your call to the
   user before implementing.
5. Report back with: proposed PR 3 file list, taxonomy decision, any
   deviations from the plan, ask for go.
```

---

## Repo state at handoff

- `main` is at `a646443` (squash-merge of PR #273 — feat: editorial A
  Landing) plus `f0afd39` (handoff doc for PR 2).
- `feat/redesign-landing` branch deleted both remotely and locally.
- Local working tree still has `.scratch/redesign-handoff-v2/`
  untracked — intentional, do not commit the bundle.
- No open PRs related to the redesign.
- A `Rentenrechner-conflict-auto` sibling worktree holds main checked
  out; that's why local `git checkout main` fails. Branch from
  `origin/main` directly.

## Where the PR-2 patterns live

- `src/features/landing/LandingPage.tsx` + `.css` — canonical editorial
  layout (kicker / serif H1 with `<em>` accent / aside cards / hub
  clusters / Stand line / LegalFooter).
- `src/features/landing/hubClusters.ts` — `resolveFeaturedArticles()` +
  `countHubArticles()` fail-fast resolver pattern.
- `src/features/landing/LandingPage.test.tsx` — `inShell()` helper,
  prerender-resilience suite, editorial-layout assertions, anti-
  regression tests for fictional copy.
- `src/App.tsx` (around lines 80–135) — view-state-lifted-to-App
  pattern, `isEditorial` derivation.
- `scripts/prerender.mjs` (around line 165) — SSG `editorial` flag.

## Estimated effort

- PR 3 alone: ~5 days (per plan §9).
- PR 3 + start of PR 4: ~7 days if context permits.
- Don't push to PR 5+ in the same session — each PR deserves its own
  context budget.
