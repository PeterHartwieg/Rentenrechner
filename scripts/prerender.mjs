#!/usr/bin/env node
// ---------------------------------------------------------------------------
// SSG prerender script (issue #02 — public route registry tracer bullet).
//
// Runs after `vite build` (chained from the build pipeline). For each route
// in `publicRouteRegistry`, this script:
//
//   1. Renders the React tree to an HTML string with React 19's
//      `renderToString` (synchronous; we don't need streaming for routes
//      this small).
//   2. Substitutes route-specific <head> content (title, meta description,
//      canonical, Open Graph, Twitter, JSON-LD) into the static index.html
//      shell at the `<!--SSG_HEAD-->` marker.
//   3. Injects the rendered React HTML into the `<div id="root">` slot and
//      adds `data-rentenwiki-prerendered="1"` so `main.tsx` calls `hydrateRoot`
//      instead of `createRoot`.
//   4. Writes the result to `dist/<canonical>/index.html` (or `dist/404.html`
//      for the `/404` route).
//
// Sitemap and robots are written from the same registry using the pure
// generators in `src/seo/`. Tests cover the generator output directly.
//
// Why a hand-rolled script and not `vite-react-ssg`:
//   - Vite 8 is brand-new; the matching SSG package versions are not all
//     stable in the React 19 ecosystem.
//   - Our route count is tiny (3 prerendered + 1 default 404 page).
//   - The custom script gives us total control over canonical/OG/JSON-LD
//     injection, which is the actual point of the issue.
// ---------------------------------------------------------------------------

import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile, cp, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const distDir = join(projectRoot, 'dist')

// Vite SSR mode lets us load `.tsx` and `.mdx` source modules directly without
// running them through the production bundler. Each module loaded via
// `ssrLoadModule` inherits the Vite plugin pipeline (React, MDX, etc).
async function loadSourceModules() {
  const server = await createServer({
    root: projectRoot,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'warn',
    ssr: {
      // Force React + react-dom to resolve via Node's native ESM loader rather
      // than Vite's SSR module runner. The CJS index files use `module.exports`
      // which the runner can't evaluate; native Node resolution handles them
      // correctly via the `react` package's `exports` map.
      external: ['react', 'react-dom', 'react-dom/server'],
    },
  })

  try {
    const seoMod = await server.ssrLoadModule('/src/seo/publicRouteRegistry.ts')
    const headMod = await server.ssrLoadModule('/src/seo/renderRouteHead.ts')
    const sitemapMod = await server.ssrLoadModule('/src/seo/sitemap.ts')
    const robotsMod = await server.ssrLoadModule('/src/seo/robots.ts')
    const llmsTxtMod = await server.ssrLoadModule('/src/seo/llmsTxt.ts')
    // React + react-dom/server load via Node's native ESM resolution. Their
    // CJS interop is handled by the package's "exports" map.
    const reactMod = await import('react')
    const reactDomServer = await import('react-dom/server')
    const rentenluecke = await server.ssrLoadModule('/src/features/publicPages/RentenluckeRechnerPage.tsx')
    const pageNotFound = await server.ssrLoadModule('/src/features/publicPages/PageNotFound.tsx')
    const bavRechner = await server.ssrLoadModule('/src/features/publicPages/BavRechnerPage.tsx')
    const etfVsBav = await server.ssrLoadModule('/src/features/publicPages/EtfVsBavPage.tsx')
    const riesterRechner = await server.ssrLoadModule('/src/features/publicPages/RiesterRechnerPage.tsx')
    const altersvorsorgedepotRechner = await server.ssrLoadModule('/src/features/publicPages/AltersvorsorgedepotRechnerPage.tsx')
    const riesterVsAvd = await server.ssrLoadModule('/src/features/publicPages/RiesterVsAltersvorsorgedepotPage.tsx')
    const basisrenteRechner = await server.ssrLoadModule('/src/features/publicPages/BasisrenteRechnerPage.tsx')
    const privateRvRechner = await server.ssrLoadModule('/src/features/publicPages/PrivateRentenversicherungRechnerPage.tsx')
    const renteNettoBerechnen = await server.ssrLoadModule('/src/features/publicPages/RenteNettoBerechnePage.tsx')
    const altersvorsorgeprodukte = await server.ssrLoadModule('/src/features/publicPages/AltersvorsorgeproduktePage.tsx')
    const articleHub = await server.ssrLoadModule('/src/features/articles/ArticleHubPage.tsx')
    const methode = await server.ssrLoadModule('/src/features/methode/MethodePage.tsx')
    const angaben = await server.ssrLoadModule('/src/features/inputs/AngabenPage.tsx')
    const vergleichDetail = await server.ssrLoadModule('/src/features/vergleich-detail/VergleichDetailPage.tsx')
    const impressum = await server.ssrLoadModule('/src/features/legal/ImpressumPage.tsx')
    const datenschutz = await server.ssrLoadModule('/src/features/legal/DatenschutzPage.tsx')
    // AppShell wraps every prerendered page so the disclaimer banner appears
    // in the static HTML the crawler fetches (P0 compliance invariant —
    // verified by publicPages.test.tsx prerender suites).
    const appShellMod = await server.ssrLoadModule('/src/ui/chrome/AppShell.tsx')
    // `pathToRoute` converts the canonical path string into the tagged-union
    // `Route` object that AppShell expects on its `route` prop. Loaded via
    // Vite SSR so the React + DOM dependencies inside `useRoute.ts` resolve
    // through the configured plugin pipeline rather than Node's bare ESM
    // loader (audit C3).
    const useRouteMod = await server.ssrLoadModule('/src/app/useRoute.ts')

    return {
      server,
      seoMod,
      headMod,
      sitemapMod,
      robotsMod,
      llmsTxtMod,
      reactMod,
      reactDomServer,
      rentenluecke,
      pageNotFound,
      bavRechner,
      etfVsBav,
      riesterRechner,
      altersvorsorgedepotRechner,
      riesterVsAvd,
      basisrenteRechner,
      privateRvRechner,
      renteNettoBerechnen,
      altersvorsorgeprodukte,
      articleHub,
      methode,
      angaben,
      vergleichDetail,
      impressum,
      datenschutz,
      appShellMod,
      useRouteMod,
    }
  } catch (err) {
    await server.close()
    throw err
  }
}

// Explicit mapping from every PUBLIC_ROUTE_IDS entry to its prerender
// component (or null for routes that deliberately use LandingPage as the
// static first-paint shell). If a route ID appears in PUBLIC_ROUTE_IDS but
// is absent from this map, prerender will exit with a non-zero code so the
// build fails loudly instead of silently writing wrong page content.
//
// `/` is intentionally mapped to null: the dashboard requires a DOM
// environment unavailable during static prerender, so LandingPage is used
// as the static first-paint variant. Returning users swap to their dashboard
// on hydration.
function buildComponentMap(modules) {
  return {
    '/': null,
    '/404': modules.pageNotFound.PageNotFound,
    '/artikel': modules.articleHub.ArticleHubPage,
    '/methode': modules.methode.MethodePage,
    '/eingaben': modules.angaben.AngabenPage,
    '/rentenluecke-rechner': modules.rentenluecke.RentenluckeRechnerPage,
    '/bav-rechner': modules.bavRechner.BavRechnerPage,
    '/etf-vs-bav': modules.etfVsBav.EtfVsBavPage,
    '/riester-rechner': modules.riesterRechner.RiesterRechnerPage,
    '/altersvorsorgedepot-rechner': modules.altersvorsorgedepotRechner.AltersvorsorgedepotRechnerPage,
    '/riester-vs-altersvorsorgedepot': modules.riesterVsAvd.RiesterVsAltersvorsorgedepotPage,
    '/basisrente-rechner': modules.basisrenteRechner.BasisrenteRechnerPage,
    '/private-rentenversicherung-rechner': modules.privateRvRechner.PrivateRentenversicherungRechnerPage,
    '/rente-netto-berechnen': modules.renteNettoBerechnen.RenteNettoBerechnePage,
    '/altersvorsorgeprodukte-vergleichen': modules.altersvorsorgeprodukte.AltersvorsorgeproduktePage,
    '/vergleich/details': modules.vergleichDetail.VergleichDetailPage,
    '/impressum': modules.impressum.ImpressumPage,
    '/datenschutz': modules.datenschutz.DatenschutzPage,
  }
}

/**
 * Mirror of `isEditorialChromeRoute` from `src/features/articles/
 * articleResolver.ts`. Kept inline because the prerender script runs in a
 * plain Node ESM context and we want to avoid an extra `ssrLoadModule` call
 * just to read this set. If the article-route taxonomy changes, both this
 * list and the resolver must update in lockstep — the PR3 acceptance test
 * pins the two together.
 */
const EDITORIAL_ROUTE_IDS = new Set([
  '/',
  '/artikel',
  '/rentenluecke-rechner',
  '/bav-rechner',
  '/etf-vs-bav',
  '/riester-rechner',
  '/altersvorsorgedepot-rechner',
  '/riester-vs-altersvorsorgedepot',
  '/basisrente-rechner',
  '/private-rentenversicherung-rechner',
  '/rente-netto-berechnen',
  '/altersvorsorgeprodukte-vergleichen',
])

function pickComponent(routeId, componentMap) {
  if (!Object.prototype.hasOwnProperty.call(componentMap, routeId)) {
    console.error(
      `[prerender] ERROR: route "${routeId}" is listed in PUBLIC_ROUTE_IDS but has no` +
      ` explicit prerender component mapping in buildComponentMap().` +
      ` Add an entry for this route before running the build.`,
    )
    process.exit(1)
  }
  return componentMap[routeId]
}

async function renderRoute(routeId, componentMap, modules, { React, renderToString }) {
  const Component = pickComponent(routeId, componentMap)
  const AppShell = modules.appShellMod.AppShell
  const { pathToRoute } = modules.useRouteMod
  const noopNavigate = () => {}
  // AppShell's `route` prop is the tagged-union `Route` object (see
  // `src/app/useRoute.ts`). Pre-PR-1.4 we passed `routeId` (the canonical
  // path string) directly, which fell through `routeToNavId`'s
  // `switch (route.kind)` to the `never`-exhaustive default and silently
  // dropped active-tab highlighting from the prerendered HTML. Convert
  // here so static (no-JS) chrome computes the active nav correctly.
  const route = pathToRoute(routeId)
  // Wrap every prerendered route in AppShell so the chrome (disclaimer,
  // status bar, header, footer) appears in the static HTML. Crawlers see
  // exactly what hydrated clients see; the disclaimer P0 compliance
  // invariant is preserved.
  //
  // Editorial mode (cream bg + serif H1). PR 3 promotes the Artikel hub
  // plus every clustered topic page (they all sit inside ArticleLayout).
  // The homepage stays editorial because the LandingPage renders in
  // editorial styling during prerender. PR 4 will add `/methode`.
  const editorial = EDITORIAL_ROUTE_IDS.has(routeId)
  function withShell(child) {
    return React.createElement(
      AppShell,
      { route, navigate: noopNavigate, editorial },
      child,
    )
  }
  if (Component) {
    // Legal pages + the ArticleHubPage take a `navigate` prop. The prerender
    // pass uses a no-op; client hydration replaces it with the real router
    // callback. Function props don't appear in HTML, so the rendered output
    // matches either way.
    if (routeId === '/impressum' || routeId === '/datenschutz' || routeId === '/artikel' || routeId === '/methode' || routeId === '/eingaben') {
      return renderToString(withShell(React.createElement(Component, { navigate: noopNavigate })))
    }
    // R3.3 — `/vergleich/details` consumes the lifted workspace UI state in
    // the live app. In prerender, no workspace state exists yet, so seed
    // `selectedScenarioId: 'basis'` (the canonical default) and supply a
    // no-op setter. The page's first-mount `?scenario=<id>` URL initialiser
    // is a no-op in the SSR pass (no `window`), so the basis seed is the
    // value the rendered cards reflect.
    if (routeId === '/vergleich/details') {
      return renderToString(
        withShell(
          React.createElement(Component, {
            navigate: noopNavigate,
            selectedScenarioId: 'basis',
            onSelectScenario: () => {},
          }),
        ),
      )
    }
    return renderToString(withShell(React.createElement(Component)))
  }
  // Component is null — this route deliberately uses LandingPage as the
  // static first-paint shell (currently only `/`). The client hydrates with
  // full state immediately after.
  const landingMod = await modules.server.ssrLoadModule('/src/features/landing/LandingPage.tsx')
  const Landing = landingMod.LandingPage
  // No-op handler — the prerendered HTML is replaced on hydration.
  return renderToString(withShell(React.createElement(Landing, { onChoice: () => {}, navigate: noopNavigate })))
}

function targetPathForRoute(routeId) {
  if (routeId === '/') return join(distDir, 'index.html')
  if (routeId === '/404') return join(distDir, '404.html')
  // Strip the leading slash and emit `<route>/index.html` so static hosts
  // (Cloudflare Workers, Netlify) serve the page on direct loads.
  return join(distDir, routeId.replace(/^\//, ''), 'index.html')
}

async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true })
}

// ---------------------------------------------------------------------------
// llms-full.txt builder — issue #10. Reads the prerendered HTML output for
// each in-sitemap, non-404 route and emits a stripped-text body per route,
// concatenated with `---` separators. Build-output dependent (must run after
// the SSG pass), so it lives in the script rather than `src/seo/`.
//
// Each route section has the format:
//
//   # <title>
//
//   URL: <absolute-canonical-url>
//   Stand: <dateModified>
//
//   <stripped-text-of-prerendered-HTML>
//
//   ---
//
// HTML stripping uses a simple regex per the locked decisions (no parser).
// Script + style content is dropped first so their JS/CSS bodies do not
// pollute the output.
// ---------------------------------------------------------------------------
function stripHtmlToText(html) {
  // Drop entire <script>...</script> and <style>...</style> blocks first so
  // their inline content (JS, CSS) does not leak through.
  let out = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  out = out.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  // Strip remaining tags.
  out = out.replace(/<[^>]+>/g, ' ')
  // Decode the most common HTML entities — the prerendered shell only emits
  // these handful via React's escaping, so a minimal table is sufficient.
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
  // Collapse whitespace runs to single spaces.
  out = out.replace(/\s+/g, ' ').trim()
  return out
}

function htmlPathForRoute(routeId) {
  if (routeId === '/') return join(distDir, 'index.html')
  return join(distDir, routeId.replace(/^\//, ''), 'index.html')
}

async function generateLlmsFullTxt({ PUBLIC_ROUTE_IDS, publicRouteRegistry, buildCanonicalUrl }) {
  const sections = []
  for (const routeId of PUBLIC_ROUTE_IDS) {
    const entry = publicRouteRegistry[routeId]
    if (!entry.inSitemap) continue
    const htmlPath = htmlPathForRoute(routeId)
    let html
    try {
      html = await readFile(htmlPath, 'utf8')
    } catch {
      // Defensive: if a route did not produce an HTML file (should not happen
      // in a clean build), skip it rather than fail the whole pipeline.
      continue
    }
    const text = stripHtmlToText(html)
    const url = buildCanonicalUrl(routeId)
    const section =
      `# ${entry.title}\n\n` +
      `URL: ${url}\n` +
      `Stand: ${entry.dateModified}\n\n` +
      `${text}\n`
    sections.push(section)
  }
  // Sections separated by `---` on its own line.
  return sections.join('\n---\n\n') + (sections.length > 0 ? '\n' : '')
}

async function copyOgPlaceholder() {
  // Public folder assets are already copied by Vite, but we ensure the
  // `og/default.png` placeholder is on disk even if a fresh checkout hasn't
  // been built yet. Skipped silently when the source file doesn't exist —
  // tests cover the registry path string and the file presence check is
  // a deploy-time guard rather than a build-blocker.
  const ogSrc = join(projectRoot, 'public', 'og', 'default.png')
  try {
    await stat(ogSrc)
  } catch {
    return
  }
  const ogDst = join(distDir, 'og', 'default.png')
  await ensureDir(ogDst)
  await cp(ogSrc, ogDst)
}

async function main() {
  const indexHtml = await readFile(join(distDir, 'index.html'), 'utf8')

  const modules = await loadSourceModules()
  try {
    const { React } = { React: modules.reactMod.default ?? modules.reactMod }
    const renderToString = modules.reactDomServer.renderToString

    const { PUBLIC_ROUTE_IDS, publicRouteRegistry } = modules.seoMod
    const { renderRouteHeadHtml } = modules.headMod
    const { generateSitemap } = modules.sitemapMod
    const { generateRobots } = modules.robotsMod
    const { generateLlmsTxt } = modules.llmsTxtMod
    const { buildCanonicalUrl } = modules.seoMod

    // Build the component map once and validate all PUBLIC_ROUTE_IDS up front
    // so missing mappings fail early (before any files are written).
    const componentMap = buildComponentMap(modules)
    for (const routeId of PUBLIC_ROUTE_IDS) {
      pickComponent(routeId, componentMap) // exits with code 1 if not mapped
    }

    // Audit C3 guard: every prerendered route id must map to a well-formed
    // `Route` variant under `pathToRoute`, otherwise AppShell + `routeToNavId`
    // silently drop active-tab highlighting from the static HTML. `/404` is
    // the one entry that legitimately resolves to `{ kind: 'not-found' }` —
    // its prerendered page intentionally has no active nav tab. Any OTHER
    // route id falling through to `not-found` means `PUBLIC_ROUTE_IDS` has
    // drifted ahead of the `pathToRoute` switch; fail the build loudly with
    // the offending route id so the gap is caught here, not at runtime.
    const { pathToRoute } = modules.useRouteMod
    for (const routeId of PUBLIC_ROUTE_IDS) {
      const route = pathToRoute(routeId)
      if (routeId !== '/404' && route.kind === 'not-found') {
        console.error(
          `[prerender] ERROR: route "${routeId}" is listed in PUBLIC_ROUTE_IDS but` +
          ` pathToRoute() resolves it to {kind:'not-found'}. Add a matching case to` +
          ` the switch in src/app/useRoute.ts or remove the route from the registry.`,
        )
        process.exit(1)
      }
    }

    for (const routeId of PUBLIC_ROUTE_IDS) {
      const html = await renderRoute(routeId, componentMap, modules, { React, renderToString })
      const headHtml = renderRouteHeadHtml(routeId)

      let pageHtml = indexHtml
      // Replace the placeholder default title/description with route-specific
      // tags. The marker (`<!--SSG_HEAD-->`) is the single source of truth for
      // injected head content; we also remove the dev-only `<title>` and
      // default `<meta description>`.
      pageHtml = pageHtml.replace(/<title>[^<]*<\/title>\s*/, '')
      pageHtml = pageHtml.replace(/<meta name="description"[^>]*\/>\s*/i, '')
      pageHtml = pageHtml.replace('<!--SSG_HEAD-->', headHtml)
      // Only routes whose rendered output does NOT depend on
      // localStorage / share-state are hydration-stable. `main.tsx` reads the
      // `data-rentenwiki-prerendered` attribute to choose between
      // `hydrateRoot` (matched output) and `createRoot` (replace and re-render).
      //
      // `/` is intentionally NOT marked: the App reads localStorage on mount
      // to decide between LandingPage / compare-mode dashboard / combine-mode
      // dashboard. Marking it would trigger React hydration mismatches for
      // returning users. The static HTML still serves as SEO content for
      // first-paint crawlers.
      //
      // `/eingaben` is likewise NOT marked: `AngabenPage` consumes
      // `useCalculatorState`, whose lazy initializer reads URL + localStorage
      // on mount. The prerendered HTML uses `defaultProfile`/`defaultAssumptions`,
      // but a returning user's first client render uses the persisted values —
      // forcing `hydrateRoot` on that tree triggers React hydration mismatches
      // and leaves stale DOM attributes / text until React re-renders. Mirror
      // the `/` non-hydrated path: the static HTML still serves first-paint
      // crawlers, and the client mounts via `createRoot`.
      const hydrateStable = routeId === '/rentenluecke-rechner' || routeId === '/404'
        || routeId === '/artikel' || routeId === '/methode'
        || routeId === '/bav-rechner' || routeId === '/etf-vs-bav'
        || routeId === '/riester-rechner' || routeId === '/altersvorsorgedepot-rechner'
        || routeId === '/riester-vs-altersvorsorgedepot'
        || routeId === '/basisrente-rechner' || routeId === '/private-rentenversicherung-rechner'
        || routeId === '/rente-netto-berechnen' || routeId === '/altersvorsorgeprodukte-vergleichen'
        || routeId === '/impressum' || routeId === '/datenschutz'
      const rootMarker = hydrateStable ? ' data-rentenwiki-prerendered="1"' : ''
      pageHtml = pageHtml.replace(
        '<div id="root"></div>',
        `<div id="root"${rootMarker}>${html}</div>`,
      )

      const target = targetPathForRoute(routeId)
      await ensureDir(target)
      await writeFile(target, pageHtml, 'utf8')
      console.log(
        `[prerender] ${routeId.padEnd(28)} -> ${target.replace(projectRoot + '\\', '').replace(projectRoot + '/', '')} (${publicRouteRegistry[routeId].title.slice(0, 60)})`,
      )
    }

    await writeFile(join(distDir, 'sitemap.xml'), generateSitemap(), 'utf8')
    await writeFile(join(distDir, 'robots.txt'), generateRobots(), 'utf8')

    // ---------------------------------------------------------------------
    // llms.txt + llms-full.txt — issue #10. Experimental discovery surfaces
    // for AI assistants. Both are generated AFTER the SSG pass so the full
    // file can read the prerendered HTML for stripped-text bodies. Neither
    // is added to the sitemap (they are not web pages). Documentation in
    // `docs/seo/llms-txt.md` marks them as experimental.
    // ---------------------------------------------------------------------
    await writeFile(join(distDir, 'llms.txt'), generateLlmsTxt(), 'utf8')
    await writeFile(
      join(distDir, 'llms-full.txt'),
      await generateLlmsFullTxt({ PUBLIC_ROUTE_IDS, publicRouteRegistry, buildCanonicalUrl }),
      'utf8',
    )

    await copyOgPlaceholder()

    console.log('[prerender] sitemap.xml + robots.txt + llms.txt + llms-full.txt written')
  } finally {
    await modules.server.close()
  }
}

main().catch((err) => {
  console.error('[prerender] failed:', err)
  process.exit(1)
})
