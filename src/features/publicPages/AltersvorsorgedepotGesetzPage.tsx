import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import Body from './altersvorsorgedepot-gesetz.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Draft page for `/altersvorsorgedepot-gesetz` (AV-Depot handoff v2): law and timeline explainer.
 * Registered with `status: 'draft'` — prerendered for the PR preview, but
 * noindex, out of the sitemap and the article hub until publication.
 */
export function AltersvorsorgedepotGesetzPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/altersvorsorgedepot-gesetz" navigate={navigate}>
      <Body />
    </ArticleLayout>
  )
}
