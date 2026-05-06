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
    // React + react-dom/server load via Node's native ESM resolution. Their
    // CJS interop is handled by the package's "exports" map.
    const reactMod = await import('react')
    const reactDomServer = await import('react-dom/server')
    const rentenluecke = await server.ssrLoadModule('/src/features/publicPages/RentenluckeRechnerPage.tsx')
    const pageNotFound = await server.ssrLoadModule('/src/features/publicPages/PageNotFound.tsx')
    const basisrenteRechner = await server.ssrLoadModule('/src/features/publicPages/BasisrenteRechnerPage.tsx')
    const privateRvRechner = await server.ssrLoadModule('/src/features/publicPages/PrivateRentenversicherungRechnerPage.tsx')
    const renteNettoBerechnen = await server.ssrLoadModule('/src/features/publicPages/RenteNettoBerechnePage.tsx')
    const altersvorsorgeprodukte = await server.ssrLoadModule('/src/features/publicPages/AltersvorsorgeproduktePage.tsx')

    return {
      server,
      seoMod,
      headMod,
      sitemapMod,
      robotsMod,
      reactMod,
      reactDomServer,
      rentenluecke,
      pageNotFound,
      basisrenteRechner,
      privateRvRechner,
      renteNettoBerechnen,
      altersvorsorgeprodukte,
    }
  } catch (err) {
    await server.close()
    throw err
  }
}

function pickComponent(routeId, modules) {
  if (routeId === '/rentenluecke-rechner') return modules.rentenluecke.RentenluckeRechnerPage
  if (routeId === '/404') return modules.pageNotFound.PageNotFound
  if (routeId === '/basisrente-rechner') return modules.basisrenteRechner.BasisrenteRechnerPage
  if (routeId === '/private-rentenversicherung-rechner') return modules.privateRvRechner.PrivateRentenversicherungRechnerPage
  if (routeId === '/rente-netto-berechnen') return modules.renteNettoBerechnen.RenteNettoBerechnePage
  if (routeId === '/altersvorsorgeprodukte-vergleichen') return modules.altersvorsorgeprodukte.AltersvorsorgeproduktePage
  // For `/` we render the full App but force the route via window.location
  // before render. The dashboard requires a DOM environment that we don't
  // have during static prerender — so for `/` we render the LandingPage
  // alone (the static first-paint variant). Returning users on the client
  // immediately swap to their dashboard via hydration.
  return null
}

async function renderRoute(routeId, modules, { React, renderToString }) {
  const Component = pickComponent(routeId, modules)
  if (Component) {
    return renderToString(React.createElement(Component))
  }
  // For `/` the prerendered shell deliberately renders the landing variant
  // first-paint markup. The client hydrates with full state immediately
  // after.
  const landingMod = await modules.server.ssrLoadModule('/src/features/landing/LandingPage.tsx')
  const Landing = landingMod.LandingPage
  // No-op handler — the prerendered HTML is replaced on hydration.
  return renderToString(React.createElement(Landing, { onChoice: () => {} }))
}

function targetPathForRoute(routeId) {
  if (routeId === '/') return join(distDir, 'index.html')
  if (routeId === '/404') return join(distDir, '404.html')
  // Strip the leading slash and emit `<route>/index.html` so static hosts
  // (Cloudflare Pages, Netlify) serve the page on direct loads.
  return join(distDir, routeId.replace(/^\//, ''), 'index.html')
}

async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true })
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

    for (const routeId of PUBLIC_ROUTE_IDS) {
      const html = await renderRoute(routeId, modules, { React, renderToString })
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
      const hydrateStable = routeId === '/rentenluecke-rechner' || routeId === '/404'
        || routeId === '/basisrente-rechner' || routeId === '/private-rentenversicherung-rechner'
        || routeId === '/rente-netto-berechnen' || routeId === '/altersvorsorgeprodukte-vergleichen'
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

    await copyOgPlaceholder()

    console.log('[prerender] sitemap.xml + robots.txt written')
  } finally {
    await modules.server.close()
  }
}

main().catch((err) => {
  console.error('[prerender] failed:', err)
  process.exit(1)
})
