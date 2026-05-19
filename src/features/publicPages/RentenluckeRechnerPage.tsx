import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import RentenluckeBody from './rentenluecke-rechner.body.mdx'

interface Props {
  /** Threaded through to ArticleLayout so the LegalFooter Impressum /
   *  Datenschutz links use SPA navigation instead of being swallowed by
   *  the no-op fallback. SSG prerender supplies undefined; the rendered
   *  `<a href>` attributes still drive direct loads.
   */
  navigate?: (target: Route) => void
}

/**
 * Public discovery page for `/rentenluecke-rechner`.
 *
 * Renders the same DOM in two contexts:
 *   1. SSG prerender pass (server, no localStorage, no router) — produces
 *      the static HTML that crawlers fetch first. Reads no engine code.
 *   2. Hydration on the client (React 19 hydrateRoot) — preserves the
 *      session-only DisclaimerBanner behavior.
 *
 * PR 3: page wrapper is now a thin `ArticleLayout` consumer. Cream + serif
 * editorial chrome, breadcrumb, TOC left rail (desktop), related-routes
 * right rail. Page-level concerns (h1, summary, stand, CTA, internal links,
 * legal footer) all live inside `ArticleLayout` so adding a new topic page
 * is one component + one registry entry.
 */
export function RentenluckeRechnerPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/rentenluecke-rechner" navigate={navigate}>
      <RentenluckeBody />
    </ArticleLayout>
  )
}
