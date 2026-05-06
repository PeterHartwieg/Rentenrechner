# PRD - Search and AI Discovery for RentenWiki.de

Status: needs-triage
Created: 2026-05-06
Research snapshot: 2026-05-06

## Problem Statement

People in Germany are actively searching for pension and retirement-planning calculators, but RentenWiki.de is not yet shaped as a discoverable web publication. The live app is valuable once someone arrives, yet its public search surface is thin: one JavaScript-heavy calculator route, a short document title, legal routes, no topic URLs, no sitemap, no robots policy, no canonical metadata, no Open Graph metadata, and no structured content that explains the tool's calculation scope before the app loads.

That creates two discovery risks:

1. Classic search engines may understand only the brand and the generic homepage, not the high-intent topics RentenWiki.de can answer.
2. Generative search systems may not cite RentenWiki.de when users ask comparison-style questions such as "bAV oder ETF?", "Riester oder Altersvorsorgedepot?", "Rentenluecke berechnen", or "private Rentenversicherung vs ETF".

The opportunity is strong because RentenWiki.de has a differentiated position: free, public, source-available, non-commercial, no broker funnel, no affiliate posture, explicit not-advice guardrails, and a calculation engine that compares ETF, bAV, private insurance, Basisrente, Altersvorsorgedepot, Riester, statutory pension, tax, KV/PV, transfer events, and portfolio-mode decisions in one place.

## Solution

Create a search and generative-engine discovery layer for RentenWiki.de that makes the existing calculator findable, understandable, and citeable without weakening the project's privacy, legal, or non-commercial posture.

The first version should add a crawlable public information architecture around the calculator:

- A small set of high-intent German topic pages, each with a focused search intent, visible explanatory copy, calculator entry points, source/evidence notes, and a clear "keine Steuer-, Rechts- oder Anlageberatung" disclaimer.
- A route/metadata/content registry that is the single source of truth for page title, meta description, canonical URL, sitemap inclusion, structured data, date modified, visible H1, and internal-link relationships.
- Static or pre-rendered HTML for public pages so Google, Bing, ChatGPT Search, Perplexity, and other crawlers can understand the page even when they do not execute the full React app.
- A robots and crawler policy that allows search and AI answer inclusion while preserving the option to restrict training crawlers where that matches the license posture.
- XML sitemap, canonical URLs, Open Graph/Twitter metadata, and JSON-LD that exactly matches visible page content.
- A measurement loop using Google Search Console, Bing Webmaster Tools including AI Performance, manual AI-answer prompt checks, and no frontend analytics, cookies, telemetry, accounts, or hidden tracking.

RentenWiki.de should be positioned as "ein kostenloser, transparenter Modellrechner fuer Altersvorsorge in Deutschland 2026", not as advice and not as a broker/product recommendation site. The discovery work should help users reach the right calculator path quickly and help AI systems extract accurate, source-grounded facts about what the tool does.

## User Stories

1. As a German search user, I want to find RentenWiki.de when I search for "Rentenluecke Rechner", so that I can estimate my monthly pension gap without being pushed into a sales funnel.
2. As a German search user, I want to find RentenWiki.de when I search for "bAV oder ETF", so that I can compare tradeoffs with the same net cost basis.
3. As a German search user, I want to find RentenWiki.de when I search for "ETF vs bAV Rechner", so that I can model the impact of tax, social-security savings, employer subsidy, GRV reduction, and retirement KV/PV.
4. As a German search user, I want to find RentenWiki.de when I search for "Riester Rechner 2026", so that I can understand allowance, tax benefit, and payout effects in one model.
5. As a German search user, I want to find RentenWiki.de when I search for "Altersvorsorgedepot Rechner", so that I can model the new product without relying only on provider or affiliate pages.
6. As a German search user, I want to find RentenWiki.de when I search for "Riester oder Altersvorsorgedepot", so that I can compare old and new subsidized pension paths.
7. As a German search user, I want to find RentenWiki.de when I search for "Basisrente Rechner" or "Ruerup Rechner", so that I can estimate tax-deduction and retirement-tax effects.
8. As a German search user, I want to find RentenWiki.de when I search for "private Rentenversicherung Rechner", so that I can compare Versicherungsmantel fees, tax modes, and payout choices.
9. As a German search user, I want to find RentenWiki.de when I search for "Rente netto berechnen", so that I can see statutory pension, tax, KV, and PV assumptions clearly.
10. As a German search user, I want to find RentenWiki.de when I search for "Altersvorsorge Rechner Deutschland 2026", so that I can use current German statutory assumptions.
11. As a German search user, I want search result titles and snippets to describe the specific calculator or comparison I need, so that I do not have to guess whether the page is relevant.
12. As a German search user, I want the landing page to immediately confirm that the calculator is free and non-commercial, so that I can trust the intent of the site.
13. As a German search user, I want every public topic page to say that it is a model calculation and not advice, so that I understand the boundary before using results.
14. As a German search user, I want topic pages to link directly into the relevant calculator path, so that I can move from search intent to modelling without navigating the whole app.
15. As a German search user, I want topic pages to show what inputs the calculator needs, so that I know whether I can answer the question before starting.
16. As a German search user, I want topic pages to show which statutory assumptions are used, so that I can judge whether the model is current.
17. As a German search user, I want topic pages to show what the calculator does not decide for me, so that I do not mistake an illustration for financial advice.
18. As a returning user, I want public search pages not to overwrite my saved workspace, so that discovery content does not disturb my personal model.
19. As a user with a share URL, I want my personalized share URL not to become an indexed public search page, so that private modelling assumptions are not promoted as generic content.
20. As an AI search user, I want ChatGPT, Bing Copilot, Perplexity, and Google AI features to find accurate RentenWiki.de pages, so that generated answers cite the tool when relevant.
21. As an AI search user, I want AI answers to describe RentenWiki.de as a free model calculator, not an advisor or broker, so that the citation is accurate.
22. As an AI search user, I want AI answers to distinguish ETF, bAV, private insurance, Basisrente, AVD, and Riester correctly, so that product terms are not collapsed into generic "pension plan" language.
23. As an AI search user, I want cited RentenWiki.de pages to contain definitions, comparisons, tables, examples, and source notes, so that AI systems can ground their answer in extractable evidence.
24. As a privacy-conscious user, I want search and discovery work to avoid analytics, cookies, accounts, and telemetry, so that the current no-phone-home posture remains true.
25. As a privacy-conscious user, I want any future analytics proposal to be treated as a separate GDPR/consent decision, so that SEO measurement does not quietly become user tracking.
26. As a legal/compliance reviewer, I want the disclaimer to remain visible on all public discovery pages, so that SEO pages do not soften the not-advice posture.
27. As a legal/compliance reviewer, I want public copy to use RentenWiki.de instead of the internal Rentenrechner name, so that brand language stays consistent.
28. As a legal/compliance reviewer, I want all public export/download examples to embed the disclaimer where applicable, so that discovery pages do not promote unguarded outputs.
29. As a license reviewer, I want discovery pages to keep the non-commercial license posture visible, so that brokers and advisors understand commercial use requires a license.
30. As a maintainer, I want one page registry for metadata and sitemap generation, so that titles, descriptions, canonicals, JSON-LD, and page content do not drift.
31. As a maintainer, I want all public slugs to be ASCII while visible text uses natural German terms, so that URLs stay clean and copy remains user-friendly.
32. As a maintainer, I want each topic page to have one primary search intent, so that we avoid thin near-duplicate pages.
33. As a maintainer, I want an internal-link graph between related topics, so that users and crawlers can move from "Rentenluecke" to product comparisons naturally.
34. As a maintainer, I want page content to be human-reviewed, source-backed, and updateable, so that AI-generated filler does not create YMYL risk.
35. As a maintainer, I want date-modified metadata and visible "Stand" notes, so that stale statutory assumptions are easy to find and update.
36. As a maintainer, I want a yearly search-content update checklist tied to statutory rule-year updates, so that SEO content does not lag behind the engine.
37. As a maintainer, I want Google Search Console and Bing Webmaster Tools setup documented, so that indexing and discovery health can be monitored without adding frontend analytics.
38. As a maintainer, I want Bing AI Performance checked after launch, so that AI citations and grounding queries become visible where Microsoft exposes them.
39. As a maintainer, I want ChatGPT Search crawler access checked, so that OAI-SearchBot can include RentenWiki.de in search answers.
40. As a maintainer, I want Cloudflare robots and AI crawler settings audited, so that the CDN does not accidentally block search or AI-answer crawlers.
41. As a maintainer, I want an optional llms.txt generated from the same registry, so that we can provide a low-risk machine-readable site map while treating it as experimental rather than guaranteed.
42. As a maintainer, I want Core Web Vitals budgets for public pages, so that static discovery pages load quickly on mobile.
43. As a maintainer, I want page screenshots/social cards to render the brand and calculator topic clearly, so that shared links look trustworthy.
44. As a developer, I want public pages to be pre-rendered or statically emitted, so that non-JavaScript crawlers can read the content.
45. As a developer, I want route-specific titles, meta descriptions, canonical URLs, and robots tags to be testable without a browser, so that regressions are caught before deployment.
46. As a developer, I want structured data to be generated from typed inputs, so that JSON-LD stays valid and visible-content compliant.
47. As a developer, I want sitemap and robots outputs to be deterministic, so that reviews can catch accidental URL churn.
48. As a developer, I want share-state query parameters excluded from canonical indexing, so that personal scenarios do not create duplicate or privacy-sensitive indexable URLs.
49. As a developer, I want public pages not to import heavy simulation code unless the user starts the app, so that discovery pages remain fast.
50. As a developer, I want tests that prove search pages still display the disclaimer, so that compliance does not depend on manual review.
51. As a content editor, I want a seed keyword and intent map, so that writing starts from user questions rather than internal product architecture.
52. As a content editor, I want page briefs that specify target user question, calculator CTA, source notes, and not-advice copy, so that pages are consistent.
53. As a content editor, I want every FAQ answer to be visible on the page before it appears in JSON-LD, so that structured data follows Google guidelines.
54. As a content editor, I want comparison tables to include plain-language caveats, so that AI systems do not extract misleading one-line winners.
55. As a product owner, I want SEO/GEO success metrics that do not require tracking individual users, so that discovery can be improved while respecting the no-backend boundary.

## Implementation Decisions

- Treat GEO as generative-engine optimization, not local geographic SEO. RentenWiki.de is a Germany-focused calculator, but it is not a local business that needs location landing pages.
- Start with a narrow, high-quality page set rather than many thin pages. Initial candidates: homepage, Rentenluecke Rechner, ETF vs bAV, bAV Rechner, Riester Rechner, Altersvorsorgedepot Rechner, Riester vs Altersvorsorgedepot, Basisrente/Ruerup Rechner, private Rentenversicherung Rechner, Rente netto berechnen, Altersvorsorgeprodukte vergleichen, and "Wo geht mein naechster Euro hin?".
- Use ASCII slugs such as `/rentenluecke-rechner`, `/etf-vs-bav`, `/riester-rechner`, and `/altersvorsorgedepot-rechner`. Visible page text should use natural German spellings, including umlaut variants where user-facing copy benefits.
- Introduce a public route and metadata registry. Each route should declare canonical URL, page title, meta description, H1, short summary, date modified, sitemap priority/change frequency if used, robots policy, structured-data type, related routes, and primary calculator entry point.
- Generate sitemap XML from the registry and include only canonical, public, indexable pages. The sitemap should not include query-parameter share URLs or app state.
- Add a robots policy that includes the sitemap and allows ordinary search crawling. Explicitly decide search-vs-training crawler policy: recommended default is allow Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User where applicable, and PerplexityBot for search/answer inclusion; restrict training crawlers such as GPTBot only if that matches the license/content policy.
- If using Cloudflare managed robots or Content Signals, set a deliberate policy rather than inheriting defaults. Recommended policy direction: `search=yes`, `ai-input=yes` for answer/search grounding, and `ai-train=no` if the project wants to reserve training rights under the non-commercial/source-available posture.
- Make public topic pages statically readable before React hydration. Pre-rendering or static page generation is preferred because Google says server-side/pre-rendering helps crawlers and not all bots can run JavaScript.
- Keep the interactive app as the primary first-screen experience where appropriate. Topic pages should not become marketing brochures; they should explain the exact modelling question and route users into the calculator.
- Use route-specific canonical tags. Canonicals should strip share-state query parameters and tracking parameters.
- Add `noindex,follow` behavior for personal share-state pages if technically feasible without breaking share-link previews. If static hosting cannot vary headers by query, canonical stripping plus client-rendered noindex should be documented as a partial mitigation.
- Add route-specific Open Graph and social metadata. Use RentenWiki.de public brand language in every title and social card.
- Add JSON-LD using structured APIs rather than hand-rolled string concatenation. Likely schema types: `WebSite`, `Organization`, `WebApplication` or `SoftwareApplication` for the calculator, `BreadcrumbList`, and `Article` for explanatory pages if they have article-like source notes. **`FAQPage` JSON-LD is deferred indefinitely** (post-launch decision, 2026-05-06): Google's FAQ rich results in 2024-2026 are restricted mostly to authoritative health/government domains; broad `FAQPage` schema on YMYL finance pages adds little ranking value and risks looking spammy. Visible Q/A copy on topic pages stays — only the structured-data emission is parked. Re-evaluate if Google policy changes.
- Structured data must exactly match visible content. Do not mark up hidden FAQs, unsupported claims, or fake reviews. Do not use structured data as an attempt to make claims that are not on the page.
- Every public page must include a visible not-advice disclaimer. SEO pages must not imply personalized recommendation, tax advice, legal advice, investment advice, broker service, or product suitability.
- Every public page should expose current rule-year/source context. For 2026 pages, visible copy should indicate that calculations use German 2026 statutory values where applicable and that future legal changes can alter results.
- Create content briefs before writing page copy. Each brief should name the target query cluster, user intent, calculator path, core entities, related products, must-include caveats, source/evidence references, and internal links.
- Use comparison tables and compact definitions because Bing's AI Performance guidance specifically calls out clear headings, tables, FAQ sections, evidence, and freshness as useful for AI answer references.
- Avoid page-level "winner" copy. Comparisons should frame conditions, assumptions, and tradeoffs, because the calculator is illustrative and product ranking can change with income, employer subsidy, fees, tax mode, health insurance status, children, and retirement assumptions.
- Make author/ownership and editorial responsibility clear. The Impressum already exists; discovery pages should make the project owner, non-commercial license posture, and source-available repository easy to find.
- Add source links to official/public references where a page explains statutory values or legal mechanics. The engine remains authoritative for calculations; page copy should cite the public sources that explain the law/rules at a high level.
- Add internal links from homepage to all major topic pages and between related topics. Use descriptive anchors such as "bAV oder ETF vergleichen" instead of generic "mehr".
- Add an optional experimental `llms.txt` and possibly `llms-full.txt` generated from the registry. Treat this as a machine-readable convenience file, not a confirmed ranking factor or substitute for crawlable HTML, structured data, sitemap, and robots.
- Set up Google Search Console and submit the sitemap. Google reports AI feature traffic within ordinary Web performance reporting, so the measurement plan must not expect a clean AI Overview filter.
- Set up Bing Webmaster Tools, submit sitemap, and use IndexNow for updated topic pages if the hosting/deployment workflow can do it safely.
- Use Bing AI Performance after the site has enough impressions to inspect AI citations, cited URLs, and grounding queries.
- Track ChatGPT Search and Perplexity visibility through a manual prompt lab. The prompt lab should record prompts, answer date, whether RentenWiki.de was cited, cited URL, answer accuracy, and whether citation language respected the not-advice posture.
- Do not add Google Analytics, pixels, cookies, error tracking, behavioral tracking, or ad tech in this PRD. Any analytics or telemetry proposal is a separate GDPR/consent/backend-boundary decision.
- Do not gate public discovery pages behind commercial-license checks. The calculator remains public and free; commercial use restrictions are communicated via license/legal copy.
- Keep public content maintainable by tying page freshness to statutory rule-year updates. When the rule year moves from 2026 to a future year, affected page metadata and "Stand" notes must be updated in the same release train.
- Preserve existing compare-mode and combine-mode behavior. SEO pages may deep-link into the calculator, but must not change calculations, localStorage migrations, share URLs, exports, or the session-only disclaimer behavior.

## Testing Decisions

- Test public route metadata as data. Unit tests should verify every indexable route has a title, meta description, canonical URL, H1, date modified, sitemap inclusion decision, and robots policy.
- Test sitemap generation from the registry. The sitemap must include only canonical public URLs and must exclude query URLs, share URLs, legal-only duplicates, and non-public app state.
- Test robots output. The robots file must include the sitemap URL and the deliberately chosen crawler policy for search and AI crawlers.
- Test structured data generation. JSON-LD must parse as JSON, contain expected route-specific entities, use canonical URLs, and avoid fields that are not represented in visible page content.
- Test visible disclaimer presence on every public discovery page. This is a compliance guardrail, not just copy.
- Test route rendering without localStorage dependency. Public pages must render useful crawlable content before user-specific saved state is read.
- Test that share-state URLs do not become canonical. Route metadata should resolve canonicals without query parameters.
- Test that page content does not import or run heavy simulation work before the user enters the calculator, unless a page intentionally renders a lightweight example.
- Test internal links. Every public topic page should link to the homepage, the calculator entry point, and at least two relevant sibling pages where appropriate.
- Test page titles and meta descriptions for brand compliance. Public titles should use RentenWiki.de and should not introduce new public "Rentenrechner" branding.
- Test no hidden structured-data content. If an FAQ schema is generated, the visible page should contain matching questions and answers.
- Test Open Graph metadata snapshots for the initial page set, including title, description, canonical URL, and image reference if social cards are added.
- Test accessibility basics for public pages: one visible H1, logical heading order, descriptive links, and keyboard-accessible calculator CTAs.
- Test Core Web Vitals budget with lab tooling as a proxy before launch, then monitor field data in Search Console once enough traffic exists. Targets should align with Google's good thresholds: LCP under 2.5s, INP under 200ms, CLS under 0.1.
- Test deployment outputs. The built artifact should contain `sitemap.xml`, `robots.txt`, prerendered/static HTML where chosen, and the SPA fallback should still work for app routes.
- Run `npm run verify` after implementation. If separate static-generation or SEO audit commands are added, include them in `npm run verify` or document why they remain manual.
- After launch, verify indexing manually with Search Console URL Inspection for the homepage and initial topic pages.
- After launch, run the manual AI prompt lab monthly for at least the first three months and after major content changes.

## Out of Scope

- Paid search ads, sponsored placements, affiliate pages, lead-gen forms, broker funnels, retargeting, and ad pixels.
- Backend analytics, user accounts, cookies, telemetry, event tracking, CRM integrations, newsletter capture, or form submissions.
- Automated mass page generation for every keyword variant.
- Cloaking, hidden text, hidden FAQ schema, doorway pages, synthetic backlinks, link farms, fake reviews, or any tactic that creates content for crawlers rather than users.
- A commercial-license enforcement system. The PRD may surface license posture, but gating commercial use is a separate product/legal feature.
- A full CMS. The first version can use typed content/config files or Markdown compiled into the app if that is enough.
- Local business SEO such as Google Business Profile optimization. RentenWiki.de is a public online calculator, not a local advisory office.
- Non-German localization. German search visibility is the first target.
- Rewriting calculation logic, product simulators, funding caps, tax rules, or recommendation rules.
- Permanent dismissal of the disclaimer or any weakening of export/legal guardrails.

## Further Notes

### Research Snapshot - May 2026

- Google says the same SEO fundamentals apply to AI Overviews and AI Mode. Pages need to be indexable and snippet-eligible; Google lists no special AI-only requirements. Its AI features can use query fan-out, so topic pages should cover the real subquestions users ask, not just exact keywords. Source: [Google Search Central - AI features and your website](https://developers.google.com/search/docs/appearance/ai-features?hl=en).
- Google Search now blends AI Overviews into a more conversational AI Mode path, with Gemini 3 as the default model for AI Overviews globally as of January 27, 2026. This makes comparison-style, multi-step user questions more important. Source: [Google - Just ask anything: a seamless new Search experience](https://blog.google/products-and-platforms/products/search/ai-mode-ai-overviews-updates/).
- Google JavaScript SEO guidance says Google can render JavaScript, but pre-rendering/server-side rendering is still helpful for users and crawlers, and not all bots run JavaScript. The current app should therefore add crawlable static HTML for public discovery pages. Source: [Google Search Central - JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
- Google structured-data guidance requires markup to represent visible page content and warns that correct markup does not guarantee rich results. Source: [Google Search Central - General structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).
- Google helpful-content guidance remains central: content should be reliable and made for people, not to manipulate rankings. This matters especially because retirement/tax topics are high-trust financial topics. Source: [Google Search Central - Helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).
- Google reports traffic from AI features inside the normal Search Console Web performance report, so measurement must account for limited AI-specific visibility in Google. Source: [Google Search Central - AI features and your website](https://developers.google.com/search/docs/appearance/ai-features?hl=en).
- OpenAI documents OAI-SearchBot as the crawler for ChatGPT search result inclusion and separates it from GPTBot for training. A site can allow OAI-SearchBot while disallowing GPTBot. Source: [OpenAI - Overview of OpenAI Crawlers](https://developers.openai.com/api/docs/bots).
- OpenAI Help says ChatGPT Search ranking uses multiple factors and cannot be guaranteed, but inclusion requires allowing OAI-SearchBot and host/CDN access from published IPs. Source: [OpenAI Help - ChatGPT search](https://help.openai.com/en/articles/9237897-chatgpt-search).
- Bing launched AI Performance in Webmaster Tools public preview in February 2026. It reports AI-answer citations, cited URLs, grounding queries, and trends. Bing explicitly recommends clear structure, evidence, and freshness for AI answers. Source: [Bing Webmaster Blog - AI Performance](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview).
- Bing's IndexNow remains a useful route for faster discovery of added, updated, or deleted content. Source: [Bing - IndexNow](https://www.bing.com/indexnow?source=Campaign).
- Cloudflare's managed robots feature can add Content Signals for `search`, `ai-input`, and `ai-train`. This is relevant because RentenWiki.de is hosted on Cloudflare Pages and should not inherit accidental crawler behavior. Source: [Cloudflare - robots.txt setting](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/).
- The original GEO research frames generative engines as black-box systems where content creators have less control, and reports visibility gains up to 40% from domain-specific optimization. Treat this as directional, not a guarantee. Source: [arXiv - GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735).
- A 2026 citation-measurement paper argues that GEO should measure not only whether a page is cited, but whether its language, evidence, structure, definitions, numerical facts, comparisons, and procedural steps are absorbed into answers. Source: [From Citation Selection to Citation Absorption](https://papers.cool/arxiv/2604.25707).
- Current German SERP checks show many active 2026 calculator pages for "Rentenluecke Rechner", "Riester Rechner", "Altersvorsorgedepot Rechner", "Basisrente Rechner", and related terms. RentenWiki.de should not compete by being louder; it should compete by being transparent, non-commercial, source-backed, and broader in comparison scope.

### Seed Query Map

- Renten gap: "Rentenluecke Rechner", "Rentenluecke berechnen", "Rente netto berechnen", "Wunschrente Rechner", "Versorgungsluecke berechnen".
- bAV and ETF: "bAV Rechner", "betriebliche Altersvorsorge Rechner", "bAV oder ETF", "ETF vs bAV", "Entgeltumwandlung Rechner", "Arbeitgeberzuschuss bAV Rechner".
- Riester and AVD: "Riester Rechner 2026", "Riester Zulagen Rechner", "Altersvorsorgedepot Rechner", "Riester oder Altersvorsorgedepot", "Riester Vertrag uebertragen Altersvorsorgedepot".
- Basisrente: "Basisrente Rechner", "Ruerup Rechner", "Basisrente Steuervorteil berechnen", "Ruerup oder ETF".
- Private insurance: "private Rentenversicherung Rechner", "private Rentenversicherung vs ETF", "Rentenversicherung Auszahlung Steuer", "Kapitalverzehr oder Leibrente".
- Portfolio planner: "Altersvorsorge Rechner Deutschland", "Altersvorsorgeprodukte vergleichen", "naechster Euro Altersvorsorge", "ETF Riester bAV Vergleich", "Rentenplanung Rechner kostenlos".

### Success Metrics

- Technical launch: all public discovery pages indexable, canonical, sitemap-listed, and rendered with useful HTML before hydration.
- 30 days after launch: Google Search Console shows impressions for at least the homepage and first topic pages; Bing Webmaster Tools confirms indexed URLs.
- 60 days after launch: at least five target query clusters show impressions in Search Console, even if clicks are still low.
- 90 days after launch: at least one topic page appears in Bing AI Performance or manual AI prompt-lab citations for a relevant query.
- Ongoing: manual AI prompt-lab answers describe RentenWiki.de as a free model calculator and preserve the not-advice boundary.
