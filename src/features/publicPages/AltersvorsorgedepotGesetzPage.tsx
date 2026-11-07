import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import Body from './altersvorsorgedepot-gesetz.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Article page for `/altersvorsorgedepot-gesetz` (AV-Depot handoff v2): law and timeline explainer.
 */
export function AltersvorsorgedepotGesetzPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/altersvorsorgedepot-gesetz" navigate={navigate}>
      <Body />
    </ArticleLayout>
  )
}
