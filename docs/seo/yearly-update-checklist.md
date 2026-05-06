# Yearly rule-year update checklist for SEO content

This checklist captures every SEO-facing surface that needs touching when the
calculator's active rule year moves forward (e.g. `de2026.ts` → `de2027.ts`).
It runs alongside the engine update so that the public site, structured data,
sitemap, and AI-discovery surfaces never lag behind the calculation engine.

## 1. Overview

**When this applies.** Once per year, as part of the
`de2026.ts` → `deYYYY.ts` migration. The trigger is typically the German
statutory values update (BBG, GKV Zusatzbeitrag, Rentenwert, Basiszins,
cohort tables) for the new calendar year.

**Release train.** The rule-year update lands as a single release train:

1. Engine: add the new year file, swap the active export, fix any
   golden-test deltas.
2. SEO content: refresh visible "Stand" copy, registry `dateModified`
   fields, and the `llms.txt` purpose statement.
3. Build + deploy: regenerate sitemap, robots, llms.txt, llms-full.txt,
   prerendered HTML.
4. Post-deploy validation: AI prompt lab, Search Console / Bing Webmaster
   Tools, IndexNow ping.

All steps below must be ticked before the rule-year branch merges to `main`.

## 2. Engine update steps

The engine swap point is documented in `src/rules/index.ts` itself
(comments at the top of the file). Summary:

- [ ] Copy `src/rules/de2026.ts` to `src/rules/deYYYY.ts` (template) and
      update changed values (BBG, GKV Zusatzbeitrag, Rentenwert, Basiszins,
      cohort tables, etc.).
- [ ] Update the single re-export line in `src/rules/index.ts`:
      `export { deYYYYRules as activeRules } from './deYYYY'`.
- [ ] Run `npx vitest run`. Goldens that depend on annual rates may need
      updates — review oracle-validated tests (`simulate.integration.test.ts`,
      payroll/retirement-tax/bAV-funding oracles) carefully before bumping
      golden values.
- [ ] Cross-year statutory constants (1/120 spreading, Fünftelregelung
      divisor, 12-year contract minimum, Halbeinkünfte age split by
      contract year, halbeinkünfte factor) live in
      `src/rules/legalConstants.ts` and only change on actual law amendment
      — leave them unless legislation changed.

## 3. SEO content steps

These are the new surfaces this checklist exists to cover. Forgetting any
of them produces a stale public site even though the engine is current.

- [ ] **Registry `dateModified`.** Update `dateModified` in
      `src/seo/publicRouteRegistry.ts` for every registered public route.
      The sitemap `<lastmod>` is generated from this field, so the
      registry is the single source of truth.
- [ ] **Visible "Stand 2026" copy.** Search and replace "Stand 2026" →
      "Stand YYYY" in all topic-page MDX/TSX bodies under
      `src/features/publicPages/`. Use sentence-case for the new year
      (e.g. "Stand 2027").
- [ ] **Verify no stale "Stand 2026" copy remains.** Run:

      ```sh
      grep -r "Stand 2026" src/features/publicPages/
      ```

      Must return empty after the update.

- [ ] **Verify registry `dateModified` consistency.** Run:

      ```sh
      grep "dateModified" src/seo/publicRouteRegistry.ts | grep "2026"
      ```

      Must return empty after the update (no entry should still point at
      the old year).

- [ ] **`llms.txt` purpose statement.** Open `src/seo/llmsTxt.ts` and
      check the header purpose-statement string for "Stand 2026" or other
      year references. Update if present.
- [ ] **Run the production build.** `npm run build` regenerates
      `dist/sitemap.xml`, `dist/robots.txt`, `dist/llms.txt`,
      `dist/llms-full.txt`, OG cards (if applicable), and prerendered
      per-route HTML with the new `dateModified`.
- [ ] **JSON-LD spot-check.** After build, open one prerendered route
      (e.g. `dist/rentenluecke-rechner/index.html`) and confirm the
      embedded JSON-LD `dateModified` reflects the new year. Repeat for
      one additional route to catch registry-drift bugs.
- [ ] **OG cards: no action needed.** Per the issue #08 design decision,
      OG cards render the page H1 + `RentenWiki.de` brand wordmark and do
      not contain the year. They do not need yearly regeneration. (If
      that design ever changes, this checklist must be updated.)

## 4. Post-deploy validation

After the release train ships to production, complete these steps before
closing the rule-year update task.

- [ ] **AI prompt lab.** Re-run the prompt lab in
      [`docs/seo/ai-prompt-lab.md`](./ai-prompt-lab.md) against the
      deployed site. Look specifically for stale "Stand 2026" citations
      in AI answers — they indicate that one of the discovery surfaces
      (cached HTML, llms.txt, sitemap) was missed.
- [ ] **Google Search Console.** URL-inspect the homepage and at least
      one topic page. Confirm Google sees the updated `lastmod` and
      `dateModified`. Optionally request re-indexing for the most
      important routes.
- [ ] **Bing Webmaster Tools.** Submit the updated `sitemap.xml` and
      check Bing AI Performance for any flagged stale citations once the
      new crawl lands (typically a few days).
- [ ] **IndexNow.** POST the updated public URLs per the IndexNow flow
      documented in [`docs/seo/measurement.md`](./measurement.md). This
      hints Bing and other IndexNow consumers (Yandex, Seznam) to recrawl
      faster than the regular schedule.

## 5. Completion gate

The rule-year branch is ready to merge to `main` when:

- [ ] All boxes in sections 2 and 3 are ticked.
- [ ] `npm run verify` passes locally (lint + tests + build).
- [ ] The two grep verification commands in section 3 both return empty.
- [ ] At least one prerendered route's JSON-LD has been spot-checked.

Section 4 (post-deploy validation) is run after the merge ships, not
before. Capture any anomalies (stale citations, slow re-crawl) as
follow-up issues; do not block the next year's engine update on them.

## See also

- `src/rules/index.ts` — engine swap point and migration comments.
- `src/rules/de2026.ts` — template for the next year's rule file.
- `src/seo/publicRouteRegistry.ts` — single source of truth for public
  route metadata, `dateModified`, sitemap inclusion.
- `docs/seo/ai-prompt-lab.md` — manual AI citation audit (post-deploy).
- `docs/seo/measurement.md` — Search Console, Bing Webmaster Tools, and
  IndexNow operational notes.
