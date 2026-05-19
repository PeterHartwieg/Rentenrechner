# Redesign — Implementation Plan

> **Status:** Draft, ready for execution.
> **Date:** 2026-05-19.
> **Working name:** Hybrid A/D redesign (Direction A for editorial, Direction D for tool, shared chrome).
> **Owner during execution:** TBD per PR.

This plan turns the Claude Design handoff into a concrete PR sequence. It locks the decisions taken during the two grilling rounds on 2026-05-19, captures the responsive scope added the same day, and lists the new shared primitives + guardrails every PR must respect.

---

## 1. What we are building

A complete UI rewrite of the calculator and surrounding pages, structured as two visual systems sharing one chrome.

**Two visual systems**

| | Editorial A | Sober D |
|---|---|---|
| Used on | Startseite, Artikel-Übersicht, Artikel-Detail | Deine Angaben, Mein Plan, Vertrag im Detail, Kapital & Auszahlungen, Vergleich, Wohin geht das Geld, Methode & Quellen |
| Background | Cream `#F8F4EB` | White `#FFFFFF` (with `#F6F4EF` paper for asides) |
| Body type | Newsreader serif (300/400/500) | IBM Plex Sans (400/500/600/700) |
| Accent | Terracotta `#7B3F1A` / oxblood `#8A2E2E` on italic accent words | Oxblood `#8A2E2E` **only on the headline figure** |
| Mood | Letter from a financial advisor | Public notice, footnoted |

**One shared chrome** — black status bar (mono, `rentenwiki.de · Gemeinnütziges Projekt · github.com/… · v2.x · date`), unified header (kicker + H1 + 5-tab nav), methodology footer with `[1][2][3]` footnotes. Same on every page so the site reads as one thing.

**Voice rules (binding across every Tool page)** — from chat round 2:
- No "Empfehlung", no winner badges, no coach adjectives ("stark", "klasse").
- No CTAs beyond `Angaben bearbeiten` / `Quellcode öffnen`.
- Assumptions and sources are first-class, not tucked away.
- "Du"-Ansprache. One headline number per view. Max one chart.

**Three viewports**

| | Desktop ≥1024 px | Tablet 640–1023 px | Phone <640 px |
|---|---|---|---|
| Nav | top horizontal | top horizontal, compact | brand + `≡` hamburger row, **bottom tab bar** (Start / Plan / Vergleich / Artikel / Methode) |
| Hero figure | 64 px | 52 px | 44 px |
| Right rails | 320 px aside | 220–240 px aside | folds into sticky bottom accordion |
| Tables | full columns | full columns | vertical row blocks (one per record, label/value pairs) |
| KPI strips | 4-up | 4-up | 2×2 grid |
| Status bar text | full | full | URL + version only |

---

## 2. Source of truth

The Claude Design handoff bundle lives at `.scratch/redesign-handoff-v2/rentenrechner/`. Key files:

| File | Purpose |
|---|---|
| `chats/chat1.md`, `chat2.md`, `chat3.md` | Conversation transcripts — read these first; they explain the intent behind the visuals. |
| `project/Rentenrechner Redesign.html` | Canvas mounting all artboards. |
| `project/direction-a.jsx` | Editorial A (cream, serif, prose). |
| `project/direction-d.jsx` | Sober D (white, sans, mono labels) — Mein Plan + Vergleich. |
| `project/direction-d-pages.jsx` | Sober D — Startseite (deprecated all-D), Angaben, Vertrag-Detail, Kapital, Vergleich-Detail, Methode. |
| `project/direction-hybrid.jsx` | The chosen hybrid: editorial Startseite + Artikel pages, shared chrome with D. |
| `project/responsive-views.jsx` | Phone (`MStartseite`…`MMethode`) and tablet (`TStartseite`…`TMethode`) variants of all 10 pages. |
| `project/shared-data.jsx` | Sample numbers + `fmtEUR` / `fmtPct` helpers; mock data only, do not import. |

**The mock is the spec for visuals.** Copy in the mock is fictional in places (see § 5); the redesign uses the layouts but rewrites strings to match the real project posture.

---

## 3. Locked decisions

From the two grilling rounds with the user on 2026-05-19:

| Topic | Decision |
|---|---|
| Recommender / winner framing | **Reframe neutrally, keep math.** Keep `src/app/recommender.ts`, `OptimiereVorsorgeModal`, `contractDecisions.ts`. Relabel via `src/content/recommendationCopy.ts`: no winner badge, no "Empfehlung". `Optimiere` modal becomes the new full-page `Vertrag im Detail`. |
| Articles system | **Skin existing SEO topic pages.** Reuse `src/seo/publicRouteRegistry.ts` entries; wrap each `features/publicPages/*` in a new `ArticleLayout`. No new content infrastructure. |
| Mock copy fidelity | **Substitute with accurate single-maintainer copy.** Drop fictional `RentenWiki e.V.` / 7 board members / 318 contributors / MIT. Use real posture: single maintainer, PolyForm Noncommercial + paid commercial license, donations via Stripe / GitHub Sponsors. |
| Rollout strategy | **New chrome first, then page-by-page.** PR 1 builds chrome + tokens; each subsequent PR replaces one page; ships independently. |
| Disclaimer placement | **Keep current `DisclaimerBanner` dismissible session banner above the status bar.** Zero change to compliance behaviour. Visual treatment tuned in PR 1 so the warm banner over the black bar reads cleanly. |
| Responsive scope | **All three viewports in every PR.** No "mobile follow-up". Phone + tablet artboards in the handoff are detailed enough that deferring would mean inventing twice. |
| Sidebar branch (`feat/compare-persistent-sidebar`) | **Merge first, then start redesign from main.** Sidebar code gets replaced page-by-page during the redesign; no work lost. |
| Vergleich product count | **Keep all 6** (ETF, Basisrente, bAV, pAV, AVD, Riester). Table wraps / phone renders vertical cards. `PRODUCT_REGISTRY` stays the single source of truth. |

---

## 4. Defaults I'm making (push back during PR review if any of these are wrong)

| Topic | Default |
|---|---|
| Fonts | Self-host Newsreader, IBM Plex Sans, JetBrains Mono in `public/fonts/`. Matches privacy posture (no third-party calls). ~150 KB initial. |
| Token location | CSS custom properties in `src/App.css` (`--rw-bg`, `--rw-ink`, `--rw-accent`, etc.). No new TS module. |
| Breakpoints | `--rw-phone` (<640 px), `--rw-tablet` (640–1023 px), `--rw-desktop` (≥1024 px). Matches mock artboards (390 / 820 / 1280) with safety margin. |
| Bottom tab bar | 56 px + `env(safe-area-inset-bottom)`. Page content reserves matching `padding-bottom`. |
| Hamburger sheet items | Methode / Annahmen / Datenschutz / Impressum / GitHub / Spenden. The 5 most important live in the bottom bar; overflow into the sheet. |
| MonteCarloPanel + FeeDragChart | Removed from Mein Plan / Vergleich main views. MC → integrated into Methode (Renditeannahmen). Fee drag → single line on Vertrag im Detail. |
| Scenario library | Stays accessible as "Gespeicherte Pläne" subsection in Mein Plan. Share-URLs unchanged. |
| Annahmen tab | Folded into Deine Angaben § 4. Removed from nav. |
| Brand | `RentenWiki` as logotype in chrome (short form per CLAUDE.md "tight UI" rule). `RentenWiki.de` everywhere else (page titles, OG tags, share-URLs, exports). Status bar mono shows `rentenwiki.de`. |
| EvidenceBadge / provenance primitives | Keep behaviour, restyle to match mono labels. Already neutral in voice. |
| Charts on phone | Keep Recharts with `ResponsiveContainer`, tune ticks/legend at narrow widths via a shared `useChartDensity()` hook. Don't ship the mock's inline SVG. |
| Swipe row (PR 10) | CSS `scroll-snap-type: x mandatory`. No JS carousel. |
| QA overlay (`?qa=1`) on phone | Same overlay, repositioned so it doesn't collide with the bottom tab bar. |
| Tap targets | 44×44 px minimum at phone breakpoint. `NumberField` + `EvidenceBadge` may need padding bumps. |

---

## 5. Compliance guardrails to preserve

Non-negotiable. Every PR must keep these intact.

1. **Disclaimer banner.** `DisclaimerBanner` stays on `sessionStorage` (NOT `localStorage`). Must remain the literal first child of `#print-report` in `PrintReport.tsx`. Must remain the first section of `buildExportCsv` output. README's not-advice notice must stay.
2. **Statutory values stay in `src/rules/`.** Year-specific in [src/rules/de2026.ts](src/rules/de2026.ts); cross-year in [src/rules/legalConstants.ts](src/rules/legalConstants.ts). No statutory literal anywhere in `src/engine/`, `src/app/`, or `src/features/`.
3. **Brand in public copy.** Page titles, marketing copy, OG tags, share-URL slugs, PDF / CSV export headers say `RentenWiki.de`. Internal symbols stay "Rentenrechner".
4. **No unsanctioned network calls.** No new `fetch` / `XMLHttpRequest` / `navigator.sendBeacon` outside the QA Worker / Simulate API Worker / planned OCR. Self-hosted fonts means no Google Fonts CDN calls either.
5. **`PRODUCT_REGISTRY` not bypassed.** Vergleich derives products from the registry. No hardcoded product lists.
6. **Engine rounding stays put.** Engine returns full-precision floats; statutory rounding only where law requires. Display rounding happens in `src/utils/format.ts` and `<NumberField>`.

See [CLAUDE.md](../../CLAUDE.md) § "Review guidelines" for the full P0 / P1 ladder.

---

## 6. PR sequence

### PR 0 — Merge `feat/compare-persistent-sidebar` to main

Pre-req. Recent commits (`34c57f9` distribute Vergleich graphics + Mein-Plan sidebar; `7a95be9` CodeRabbit + Codex fixes) look ready. The sidebar work gets *replaced* by the new layouts page by page; no rewrite lost.

### PR 1 — Chrome foundation + responsive tokens

**Goal:** every later PR composes on top of finished chrome and breakpoints. Old page bodies still render underneath; the visible site is unchanged until PR 2 lands.

**Files added (new):**
- `src/ui/chrome/StatusBar.tsx` — three internal viewport variants.
- `src/ui/chrome/AppHeader.tsx` — kicker + H1 + nav (top nav on desktop/tablet, brand + hamburger on phone).
- `src/ui/chrome/MobileNav.tsx` — bottom tab bar, sticky, safe-area-aware.
- `src/ui/chrome/MobileSheet.tsx` — slide-up sheet for overflow nav.
- `src/ui/chrome/MethodFooter.tsx` — three viewport variants.
- `src/ui/chrome/RightRailAccordion.tsx` — desktop aside ↔ phone bottom accordion. **Get this right; it's reused by 4+ pages.**
- `src/ui/chrome/AppShell.tsx` — composes the above; pages render their body inside.
- `public/fonts/{newsreader,ibm-plex-sans,jetbrains-mono}/*` — self-hosted woff2.

**Files modified:**
- [src/App.tsx](src/App.tsx) — wrap route bodies in `AppShell`.
- [src/App.css](src/App.css) — add CSS custom properties for the two palettes + three breakpoint media queries + `@font-face` declarations.
- [src/features/workspace/DisclaimerBanner.tsx](src/features/workspace/DisclaimerBanner.tsx) — restyle to sit cleanly above the black status bar; behaviour unchanged.

**Acceptance:**
- Resizing across 390 / 820 / 1280 px shows the three chrome variants.
- Disclaimer still dismissible per session; reappears next session.
- `npm run verify` green.
- No visual change to any page body (intentional — they still render the pre-redesign UI).

**Estimate:** ~5 days.

### PR 2 — Landing page (Editorial A)

**Files modified:**
- [src/features/landing/LandingPage.tsx](src/features/landing/LandingPage.tsx) — serif hero ("Was bekommst du *wirklich* an Rente?"), 3-step row, accurate single-maintainer copy.
- Right rail: "Empfohlene Artikel" pulling from [src/seo/publicRouteRegistry.ts](src/seo/publicRouteRegistry.ts) + truthful "Wer steht hinter RentenWiki" (single maintainer, PolyForm, paid broker license, donations).
- Entry-decision logic in [src/app/useRoute.ts](src/app/useRoute.ts) (`detectSavedMode` / `appViewFromMode`) untouched.

**Mobile:** Hero / 3-step row / featured articles stack vertically. CTAs full-width.

**Estimate:** ~3 days incl. mobile.

### PR 3 — Artikel hub + reskin of SEO pages

**Files added:**
- `src/features/articles/ArticleHubPage.tsx` — `/artikel` route, groups `publicRouteRegistry` entries (Grundlagen / Produkte / Steuern).
- `src/features/articles/ArticleLayout.tsx` — cream + serif + TOC left rail + meta right rail + footnoted body. Reused as wrapper for existing public pages.

**Files modified:**
- [src/app/useRoute.ts](src/app/useRoute.ts) — add `/artikel` route.
- Each `src/features/publicPages/*Page.tsx` — wrap in `ArticleLayout`. Heavy bespoke layouts (`RentenluckeRechnerPage`, `EtfVsBavPage`) may turn into rewrites — flag during review.

**Mobile:** Article hub 2-col grid → 1-col. TOC left rail on detail page hides; in-content anchor jumps remain.

**Estimate:** ~5 days incl. mobile + per-page bespoke layouts.

### PR 4 — Methode & Quellen page

**Files added:**
- `src/features/methode/MethodePage.tsx` — new `/methode` route. Pulls rule-year tables from [src/rules/de2026.ts](src/rules/de2026.ts), model docs from [CONTEXT.md](../../CONTEXT.md) + ADRs.
- Right-rail Quellen + Mitwirkende (accurate: single maintainer + commercial-license note + donation links).

**Mobile:** Tables collapse to row blocks. Right rail → bottom accordion.

**Estimate:** ~3 days incl. mobile.

### PR 5 — Deine Angaben page

**Files added:**
- `src/features/inputs/AngabenPage.tsx` — `/eingaben` route. Sections: § Person / § Einkommen / § Renteneintritt / § Annahmen. `Annahmen` tab from old nav folds in here.

**Files modified:**
- [src/features/inputs/productUiRegistry.tsx](src/features/inputs/productUiRegistry.tsx) — input components reskinned to form-receipt look (mono value, dotted-underline hints) at all three viewports.
- [src/ui/NumberField.tsx](src/ui/NumberField.tsx) — padding bumped at phone breakpoint for 44 px tap target.
- Right-rail "Warum wir das fragen" explanations.

**Mobile:** 2-col form grid → 1-col. Right rail → bottom accordion.

**Estimate:** ~5 days incl. mobile.

### PR 6 — Mein Plan (combine mode)

**Files modified:**
- [src/features/results/CombineDetailView.tsx](src/features/results/CombineDetailView.tsx) replaced by new layout: lead statement → headline figure (oxblood) → § 1 Zusammensetzung table + composition bar → § 2 sensitivity rows ("Was sich ändern würde, wenn …").
- Right rail = `RightRailAccordion` with "Deine Angaben" receipt + edit link.
- [src/features/dashboard/RecommenderCard.tsx](src/features/dashboard/RecommenderCard.tsx) stays; copy neutralised via [src/content/recommendationCopy.ts](src/content/recommendationCopy.ts) ("Welcher Vertrag profitiert am stärksten von zusätzlichem Beitrag?" — no winner badge).
- Sidebar work from PR 0 deleted page-by-page; this PR removes it from Mein Plan.

**Files likely added:**
- New pure selectors in [src/app/simulationSelectors.ts](src/app/simulationSelectors.ts) for sensitivity rows ("if return drops to 3 %", "if you retire at 70"). Engine doesn't expose these today — add as composable selectors over existing `simulateRetirementComparison` results.

**Mobile:** Composition table → vertical rows. Right rail → bottom accordion.

**Estimate:** ~7 days incl. mobile + selector work.

### PR 7 — Vertrag im Detail

**Files added:**
- `src/features/dashboard/VertragDetailPage.tsx` — full-page replacement for `OptimiereVorsorgeModal`. Route: `/vertrag/:instanceId`.

**Files modified / deleted:**
- `OptimiereVorsorgeModal.tsx` — deleted at end of PR.
- Scenario table maps to existing [src/app/contractDecisions.ts](src/app/contractDecisions.ts) atoms.
- § 2 "Wie wir das berechnen" reuses [src/features/results/provenance.tsx](src/features/results/provenance.tsx).
- Right rail: contract metadata (Anbieter, Fonds, TER, eff. Kosten).

**Mobile:** 4-up KPIs → 2×2 grid. Scenario table → vertical rows with delta on right. Contract metadata rail → bottom accordion.

**Estimate:** ~6 days incl. mobile.

### PR 8 — Kapital & Auszahlungen

**Files added:**
- `src/features/results/KapitalPage.tsx` — `/kapital` route. Full-page lifecycle chart + Wendepunkte table.
- `src/ui/charts/useChartDensity.ts` — viewport-aware tick/legend density for Recharts.

**Files modified:**
- [src/features/results/BreakEvenChart.tsx](src/features/results/BreakEvenChart.tsx) — adopt `useChartDensity` for narrow-width tuning. Lifecycle conventions in CLAUDE.md ("UI chart conventions") still apply.

**Mobile:** Filter chips wrap. Chart axes thinned. Wendepunkte table → vertical row blocks.

**Estimate:** ~5 days incl. mobile + chart density work.

### PR 9 — Vergleich

**Files modified:**
- Replace current compare-mode results layout. Top: rendite-annahme strip (folds in [src/features/workspace/ScenarioToolbar.tsx](src/features/workspace/ScenarioToolbar.tsx)).
- Main: neutral comparison table for **all 6 products** (table wraps to handle width).
- Pro/Contra row underneath (4-wide on desktop → 3×2 → 1-col on phone). No winner.
- [src/features/workspace/EmptyComparison.tsx](src/features/workspace/EmptyComparison.tsx) and [src/features/workspace/ComparisonPicker.tsx](src/features/workspace/ComparisonPicker.tsx) reused with new styling.

**Mobile:** 6-product table breaks into vertical product cards (one per product, label/value pairs). Pro/Contra grid → 1-up.

**Estimate:** ~6 days incl. mobile.

### PR 10 — Wohin geht das Geld (compare drill-in)

**Files added:**
- `src/features/results/VergleichDetailPage.tsx` — `/vergleich/details`. Per-product breakdown cards: Ansparphase / Mit 67 / Im Alter cashflow stacks.
- Pulls from existing [src/features/cashflows/CashflowTable.tsx](src/features/cashflows/CashflowTable.tsx) + [src/features/results/FairnessPanel.tsx](src/features/results/FairnessPanel.tsx) data, restyled.

**Mobile:** 4 cards → horizontal scroll-snap row (`scroll-snap-type: x mandatory`). 2×2 on tablet.

**Estimate:** ~5 days incl. mobile.

### PR 11 — Print + cross-cutting tests

**Goal:** PrintReport works on every redesigned page; disclaimer remains first child of `#print-report` (P0 guardrail).

**Files modified:**
- [src/features/results/PrintReport.tsx](src/features/results/PrintReport.tsx) — restructure around new page layouts. A4 print is desktop-only by definition; phone/tablet chrome doesn't affect it.
- Test sweep: every `src/features/**/*.test.tsx` with DOM-shape assertions updated. Add viewport-mocking helper if vitest harness doesn't already have one.

**Estimate:** ~4 days.

---

## 7. Cross-cutting work baked into every PR

- **Tests at all three viewports.** Each page test asserts behaviour via `window.matchMedia` mocks at phone / tablet / desktop. Budget +30 % test count per PR.
- **A11y sweep.** Tap targets ≥ 44 px on phone, focus rings on every interactive element, keyboard navigation through the bottom tab bar.
- **Brand audit.** No new uses of "Rentenrechner" in user-visible copy; `RentenWiki` (chrome) / `RentenWiki.de` (titles, OG, exports) only.
- **No emojis in shipped code / copy** unless the user explicitly asks.

---

## 8. Risks

1. **Sensitivity rows on Mein Plan (PR 6).** Engine doesn't expose deltas for "if return drops to 3 %" etc. — needs new selectors. Low risk (composable, no engine change), but adds scope to PR 6.
2. **PrintReport (PR 11).** Currently shaped around the old layouts; likely larger than estimated. P0 disclaimer invariant non-negotiable.
3. **Test churn.** ~30 % overhead per PR for DOM-shape updates, on top of the viewport-coverage expansion.
4. **Disclaimer-over-status-bar visual join.** Warm cream banner above a black mono bar on the editorial pages will look odd if naively stacked. PR 1 needs to design that join (probably: disclaimer collapses to a thinner ink-on-cream strip).
5. **Recommender re-copy.** Same engine ranks products under different labels. Worth a once-over with the broker commercial-license framing in mind before shipping.
6. **Public-page reskin (PR 3).** Some `features/publicPages/*` have heavy bespoke layouts (`rentenluecke`, `etf-vs-bav`). Reskin may turn into rewrite for those.
7. **Bottom tab bar + disclaimer banner stacking.** Disclaimer at top, tab bar at bottom — no overlap, but combined ~120 px of viewport consumed on phone. Verify usable content remains.
8. **`RightRailAccordion` correctness in PR 1.** Reused by 4+ pages. Bad version means we re-do it 4×.
9. **Recharts mobile tuning.** `BreakEvenChart`, `FeeDragChart`, `MonteCarloPanel` all need narrow-width treatments via the shared `useChartDensity` hook.
10. **Storage migration.** None planned — pages change but `workspaceIdentity` / `migrateAndValidateState` / `schemaVersion: 2` all stay. If a PR ends up touching state shape, that's a P0 routing question (go via [src/storage.ts](src/storage.ts) `migrateAndValidateState`).

---

## 9. Timing estimate

| Phase | Estimate |
|---|---|
| PR 0 (merge sidebar branch) | 0.5 d |
| PR 1 (chrome foundation) | 5 d |
| PR 2 (Landing) | 3 d |
| PR 3 (Artikel hub + reskin) | 5 d |
| PR 4 (Methode) | 3 d |
| PR 5 (Deine Angaben) | 5 d |
| PR 6 (Mein Plan) | 7 d |
| PR 7 (Vertrag im Detail) | 6 d |
| PR 8 (Kapital & Auszahlungen) | 5 d |
| PR 9 (Vergleich) | 6 d |
| PR 10 (Wohin geht das Geld) | 5 d |
| PR 11 (Print + test sweep) | 4 d |
| Cross-PR mobile a11y / tap-target / viewport-test sweep | 3 d |
| **Total** | **~57 person-days ≈ 11–13 weeks** at one full-time implementer. |

Half that at two implementers if PRs 2/3/4 run in parallel after PR 1 lands (they don't share files).

---

## 10. Next step

1. Land **PR 0** — merge `feat/compare-persistent-sidebar` to `main`.
2. Open **PR 1** — chrome foundation + responsive tokens. Start branch from `main` post-merge.

Once PR 1 is in review, this plan should be split into 10 GitHub issues (one per remaining PR) per CLAUDE.md "Open work after launch now lives in GitHub Issues". The issues link back to this doc as the spec.

---

## Appendix · Files added or modified, summarised

**New directories:**
- `src/ui/chrome/` — shared chrome primitives.
- `src/ui/charts/` — `useChartDensity.ts`.
- `src/features/articles/` — article hub + layout.
- `src/features/methode/` — Methode page.
- `public/fonts/{newsreader,ibm-plex-sans,jetbrains-mono}/` — self-hosted webfonts.

**New routes** added in [src/app/useRoute.ts](src/app/useRoute.ts):
- `/artikel`
- `/methode`
- `/eingaben`
- `/vertrag/:instanceId`
- `/kapital`
- `/vergleich/details`

**Deleted:**
- `OptimiereVorsorgeModal.tsx` (replaced by `/vertrag/:instanceId`).
- Sidebar code from `feat/compare-persistent-sidebar` (replaced page by page during PRs 6 / 9).

**Untouched (intentional):**
- All of `src/engine/` (engine math is correct; redesign is UI only).
- `src/rules/de2026.ts`, `src/rules/legalConstants.ts`.
- `src/storage.ts` migration pipeline (`migrateAndValidateState`).
- `src/app/recommender.ts`, `src/app/contractDecisions.ts` — only their copy / surface UI changes.
- `PRODUCT_REGISTRY` and `productUiRegistry` shape (entries reskinned, not restructured).
