import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import Body from './altersvorsorgedepot-anbieter.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Article page for `/altersvorsorgedepot-anbieter` (AV-Depot handoff v2): provider overview with the sortable AnbieterTabelle.
 */
export function AltersvorsorgedepotAnbieterPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/altersvorsorgedepot-anbieter" navigate={navigate}>
      <Body />
    </ArticleLayout>
  )
}
