import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import Body from './altersvorsorgedepot-anbieter.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Draft page for `/altersvorsorgedepot-anbieter` (AV-Depot handoff v2): provider overview with the sortable AnbieterTabelle.
 * Registered with `status: 'draft'` — prerendered for the PR preview, but
 * noindex, out of the sitemap and the article hub until publication.
 */
export function AltersvorsorgedepotAnbieterPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/altersvorsorgedepot-anbieter" navigate={navigate}>
      <Body />
    </ArticleLayout>
  )
}
