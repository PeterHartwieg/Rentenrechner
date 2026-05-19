# Redesign Handoff — PR 2 onwards

> **Status:** Handoff prompt for a fresh session.
> **Last updated:** 2026-05-19.
> **Previous session landed:** PR 0 (merge `feat/compare-persistent-sidebar` → main), PR 1 (chrome foundation), and a small follow-up fixing review nits.
> **Next up:** PR 2 — Landing page (Editorial A redesign). Optionally start PR 3 if context allows.

---

## Paste this as the new session's orchestrator prompt

```
You are orchestrating PR 2 (and optionally start PR 3) of a multi-PR UI
redesign for the Rentenrechner repo (German retirement calculator, public
name "RentenWiki.de"). Working dir is
C:\Users\Peter\Coding_Projects\Rentenrechner.

## Sources of truth (read these before doing anything)

1. **docs/redesign/implementation-plan.md** — binding plan for the whole
   redesign. PR 2 spec is in §6. PR 3 spec follows it.
2. **docs/redesign/handoff-pr2-onwards.md** — this file. Documents
   conventions and pitfalls established by PR 0 + PR 1.
3. **.scratch/redesign-handoff-v2/rentenrechner/project/direction-hybrid.jsx**
   — editorial Landing + Articles mock. Read this for PR 2 visual spec.
4. **.scratch/redesign-handoff-v2/rentenrechner/project/responsive-views.jsx**
   — phone + tablet variants. Search for `MStartseite` / `TStartseite`
   (PR 2) and `MArtikel` / `TArtikel` (PR 3).
5. **CLAUDE.md** — project guide. The "Review guidelines" P0/P1 ladder
   binds every PR. Two PR-1-era P0 gotchas to watch for: (a) no
   "Rentenrechner" string in public chrome (the status bar dropped its
   GitHub URL for "Open Source" because of this); (b) build date must
   come from the `__RW_BUILD_DATE__` Vite define, not `new Date()`.

## What's already shipped (do not redo)

- **AppShell** (`src/ui/chrome/AppShell.tsx`) wraps every route on both
  the client (in `src/App.tsx`) AND the SSG prerender pass (in
  `scripts/prerender.mjs`). It composes DisclaimerBanner + StatusBar +
  AppHeader + body slot + MethodFooter + MobileNav (phone-only).
- **Chrome primitives** at `src/ui/chrome/` — StatusBar, AppHeader,
  MobileNav, MobileSheet, MethodFooter, RightRailAccordion, chromeRoutes.
- **`useViewport()`** hook with three buckets (phone <640, tablet
  640–1023, desktop ≥1024). Initial state is hardcoded `'desktop'` for
  SSR/hydration parity; real viewport resolves in `useEffect`.
- **Test utilities:** `src/test/viewport.ts` exports `mockViewport()` and
  `eachViewport()`. Default mock seeded as desktop in `src/vitest.setup.ts`.
- **`AppShell` prop `editorial?: boolean`** flips bg to cream and H1 to
  serif. PR 2 (Landing) and PR 3 (Articles) use it.
- **Self-hosted fonts** in `public/fonts/`:
  - Newsreader 400 + 400-italic + 500
  - IBM Plex Sans 400 / 500 / 600 / 700
  - JetBrains Mono 400
  `@fontsource` packages are devDependencies; woff2 files are committed.
- **DisclaimerBanner** rendered ONCE at AppShell level (no longer
  per-page). 12 inline calls removed in PR 1. `PrintReport.tsx`
  intentionally keeps its own copy — leave it alone.
- **Chrome tokens** in `src/App.css` (`--rw-bg-paper`, `--rw-ink`, …,
  `--rw-font-serif`, `--rw-mobile-nav-height`).
- **`__RW_BUILD_DATE__`** Vite define injects build-time UTC date so SSR
  and client agree. Don't recompute dates in components.

## Conventions established by PR 1 — follow these

- **Test environment.** Component tests use the `// @vitest-environment
  jsdom` directive on line 1. Engine/API tests stay node-env.
- **`inShell()` test helper.** When a test renders a page and needs to
  assert chrome behavior (or just survive AppShell wrapping), use the
  helper pattern from `src/features/publicPages/publicPages.test.tsx`:
  ```ts
  function inShell(node: ReactElement, route: Route = '/') {
    return createElement(AppShell, { route, navigate: () => {}, children: node })
  }
  ```
  Pass the page's actual canonical route so AppHeader's active-tab
  computation matches production.
- **No PowerShell for file rewriting.** PowerShell's `Get-Content -Raw`
  / `Set-Content -Encoding utf8` cycle double-encodes UTF-8 (§ → Â§,
  ü → Ã¼, — → â€"). It cost the previous session 30 minutes of
  unwinding. Use the `Edit` tool or a Python one-liner with explicit
  `encoding='utf-8'` instead.
- **Viewport tests at all three sizes.** Use `eachViewport()` for assertions
  that should hold everywhere, or `mockViewport('phone'|'tablet'|'desktop')`
  for variant-specific tests. `chrome.test.tsx` is the canonical pattern.
- **Brand in public chrome.** "RentenWiki" as logotype (chrome only),
  "RentenWiki.de" everywhere else. Never "Rentenrechner" in user-visible
  text. Internal symbols (file paths, npm package) keep "Rentenrechner".

## Your job — PR 2: Landing page (Editorial A)

Start from a clean branch off main: `feat/redesign-landing`.

Goal per the plan: serif hero, 3-step row, "Empfohlene Artikel" right
rail from `publicRouteRegistry`, accurate single-maintainer "Wer steht
hinter RentenWiki" panel. Editorial mode (cream bg + Newsreader). Entry-
decision logic in `src/app/useRoute.ts` untouched.

**Files to modify (per plan §6):**
- `src/features/landing/LandingPage.tsx` — replace hero / 3-step / hub /
  CTA layout per `HybridStartseite` in
  `.scratch/redesign-handoff-v2/rentenrechner/project/direction-hybrid.jsx`.
- `src/App.tsx` — pass `editorial={true}` to `<AppShell>` when the
  Landing page is rendered (the `CalculatorRoute` `view === 'landing'`
  branch). Same for the article and method routes when they land.
- `src/features/landing/LandingPage.test.tsx` — update DOM-shape
  assertions to the new layout. The disclaimer-presence tests already
  work via `inShell()` — don't break them.
- `src/features/landing/LandingPage.css` (if missing, create) — visual
  styles. Or add scoped styles to `src/ui/chrome/chrome.css` only if
  cross-page.

**Phone variant** (referenced by `MStartseite` in `responsive-views.jsx`):
hero / 3-step / featured articles stack vertically; CTAs full-width;
hamburger overflow handles the "Wer steht hinter" panel.

**Critical copy correction** (locked decision §3 of the plan): the mock
mentions "RentenWiki e.V. … 318 ehrenamtliche Beitragende … MIT" — these
are fictional. Use the truthful posture: single maintainer (Peter
Hartwieg), source-available under PolyForm Noncommercial 1.0.0, paid
commercial license for brokers/advisors, donations via Stripe / GitHub
Sponsors. The mock's "47 Artikel" count must derive from
`publicRouteRegistry.ts`, not be hardcoded.

**Acceptance criteria** (verify before opening PR):
- `npm run verify` green.
- Resizing across 390 / 820 / 1280 px shows the Landing page in the
  editorial palette (cream bg, serif H1, oxblood italic accent on
  "wirklich").
- Disclaimer still session-dismissable; reappears next session.
- Featured articles list pulls from `publicRouteRegistry` (no
  hardcoded titles).
- Entry-decision (`detectSavedMode` / saved share-URL) still routes
  returning users to the dashboard without showing Landing.

## Open follow-up (do not fix in PR 2; PR 6 handles it)

Codex P1 on `src/Calculator.tsx:622`: combine-mode Mein-Plan
Monte-Carlo pane reads compare-mode `monteCarloResult` instead of
portfolio data. Pre-existing in the now-deleted-by-PR-6 sidebar code.

## Constraints — non-negotiable

1. **DisclaimerBanner** stays on `sessionStorage`. AppShell already
   renders it. `PrintReport.tsx` keeps its own instance for the printed
   report. Both are P0.
2. **No new network calls.** Self-host any new fonts (devDeps + woff2 in
   `public/fonts/`). No CDN fetches at runtime.
3. **Brand:** `RentenWiki` in chrome, `RentenWiki.de` in titles / OG /
   exports. Never "Rentenrechner" in public copy or chrome.
4. **No statutory values outside `src/rules/`.** Year and rule-number
   citations on the Landing copy are OK as prose; literal numbers must
   come from the rule modules.
5. **Engine, storage, prerender pipeline untouched.** PR 2 is UI only.

## Working style

- Read the plan and the mock in full before doing anything.
- Use Plan / Explore agents for broad codebase reading; Read / Grep /
  Glob when you know the file.
- For test edits across many files, use Python (UTF-8 safe) not
  PowerShell.
- Pop options to the user as terse numbered lists when you hit a real
  decision. Don't restate locked decisions.
- Test at all three viewports (`eachViewport()` or per-viewport
  `mockViewport()` calls).
- End-of-turn summaries: one or two sentences.

## First step

1. Read `docs/redesign/implementation-plan.md` §6 (PR 2 line).
2. Read `direction-hybrid.jsx` (~540 lines) — especially
   `HybridStartseite` and the `HBase` chrome composition.
3. Skim `responsive-views.jsx` for `MStartseite` and `TStartseite`.
4. Branch from main: `git checkout main && git pull && git checkout -b
   feat/redesign-landing`.
5. Report back with: proposed PR 2 file list, any deviations from the
   plan, ask for go before implementing.
```

---

## Repo state at handoff

- `main` is at commit `e694d5a` — three redesign commits land (`5d9d7dd`,
  `8513882`, `e694d5a`).
- Local working tree may still have `.scratch/redesign-handoff-v2/`
  untracked — that's intentional, do not commit the bundle.
- No open PRs related to the redesign.
- `temp-main` is a local branch tracking origin/main (artifact of the
  blocked-worktree workaround during merges); safe to delete or keep.

## Where the lessons live

- `src/ui/chrome/chrome.test.tsx` — canonical pattern for viewport tests.
- `src/ui/chrome/RightRailAccordion.tsx` — canonical pattern for non-modal
  drawers with focus management.
- `scripts/prerender.mjs` — canonical pattern for wrapping pages in
  AppShell during SSG (you should not need to touch this for PR 2; it
  already wraps every prerendered route).
- `src/test/viewport.ts` — `mockViewport()` and `eachViewport()` helpers.

## Estimated effort

- PR 2 alone: ~3 days (per plan §9).
- PR 2 + start of PR 3: ~5 days (if context permits).
- Don't push to PR 4+ in the same session — they each deserve their own
  context budget.
