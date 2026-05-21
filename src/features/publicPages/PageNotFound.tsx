import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'

const ROUTE = publicRouteRegistry['/404']

interface Props {
  navigate?: (target: Route) => void
}

/**
 * `/404` page — editorial Sober D chrome (R3.4, audit C8).
 *
 * Wrapped in `<ArticleLayout>` so the 404 inherits the same cream +
 * Newsreader serif treatment as the 10 SEO topic pages. The legacy
 * `LegalLayout` + `public-shell` wrapper is gone.
 *
 * Cloudflare Workers serves `dist/404.html` for any unmatched path. The SSG
 * pipeline writes this rendered component there so the user sees a real
 * Page-Not-Found, the canonical for `/404` is set, and the page is marked
 * `noindex,follow` (registry default for this route).
 *
 * Compliance:
 *   - DisclaimerBanner is rendered by AppShell — not duplicated here.
 *   - Provides explicit links back to the calculator + topic-page siblings.
 *   - No engine imports, no localStorage reads.
 *
 * `navigate` is optional so SSG prerender and unit tests can render without
 * a live router. ArticleLayout falls back to plain `<a href>` navigation when
 * `navigate` is a no-op.
 */
export function PageNotFound({ navigate }: Props) {
  return (
    <ArticleLayout routeId="/404" navigate={navigate}>
      <section>
        <h2>Stattdessen verfügbar</h2>
        <ul className="pnf-links">
          <li>
            <a href="/">RentenWiki.de — Modellrechner Startseite</a>
          </li>
          {ROUTE.relatedRoutes.map((slug) => {
            if (slug === '/') return null
            const sibling = publicRouteRegistry[slug as keyof typeof publicRouteRegistry]
            if (!sibling) return null
            return (
              <li key={slug}>
                <a href={`${slug}/`}>{sibling.h1}</a>
              </li>
            )
          })}
          <li>
            <a href="/impressum/">Impressum</a>
          </li>
          <li>
            <a href="/datenschutz/">Datenschutzerklärung</a>
          </li>
        </ul>
      </section>
    </ArticleLayout>
  )
}
