# Lock SEO/GEO scope and architecture decisions

Status: done
Type: HITL
Resolved: 2026-05-06 (decisions captured in Comments below)

## Parent

.scratch/seo-geo-discovery/PRD.md

## What to build

Lock the human policy and architecture choices that the SEO/GEO discovery layer needs before any AFK code work begins: initial topic-page set, static-rendering pipeline, crawler policy for search and AI bots, share-URL canonicalization, llms.txt scope, and content-brief format. Every downstream slice depends on these answers.

## Acceptance criteria

- [x] Initial topic-page set decided (which pages ship in wave 1 vs. backlog).
- [x] Static-rendering approach decided.
- [x] Crawler policy decided for search bots, AI-answer bots, and AI-training bots.
- [x] Share-URL canonicalization strategy decided.
- [x] llms.txt scope decided.
- [x] Content-brief format and storage location decided.
- [x] Decisions recorded in this issue's Comments before any AFK slice starts.

## Blocked by

None - can start immediately.

## Comments

### Decisions (2026-05-06)

| # | Decision | Choice |
|---|----------|--------|
| 1.1 | Initial page set | All 11 pages: `/`, `/rentenluecke-rechner`, `/bav-rechner`, `/etf-vs-bav`, `/riester-rechner`, `/altersvorsorgedepot-rechner`, `/riester-vs-altersvorsorgedepot`, `/basisrente-rechner`, `/private-rentenversicherung-rechner`, `/rente-netto-berechnen`, `/altersvorsorgeprodukte-vergleichen`. |
| 1.2 | Static rendering | `vite-react-ssg` + MDX. Topic pages authored as `.mdx`; calculator route stays unchanged. |
| 1.3 | Crawler policy | Allow: Googlebot, Bingbot, Applebot, OAI-SearchBot, ChatGPT-User, PerplexityBot. Disallow: GPTBot, ClaudeBot, anthropic-ai, Google-Extended, CCBot. Cloudflare Content Signals: `search=yes, ai-input=yes, ai-train=no`. |
| 1.4 | Share-URL canonicalization | Canonical strip in registry (every page sets `<link rel="canonical">` to the bare path). On hydration, inject `<meta name="robots" content="noindex,follow">` when share state detected. Sitemap pulls only canonical paths from registry. |
| 1.5 | llms.txt | Publish both `llms.txt` (minimal index) and `llms-full.txt` (full prose), generated from the registry. Treat as experimental; not a measured success surface. |
| 1.6 | Content briefs | Briefs at `.scratch/seo-geo-discovery/briefs/<slug>.md` (target query, intent, sources, must-include caveats, final copy). Registry at `src/seo/publicRouteRegistry.ts` is typed code consumed by sitemap, JSON-LD, robots, SSG. Two artifacts per page; clean separation of human authoring vs machine truth. |
