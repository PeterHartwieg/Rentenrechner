import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import BavRechnerBody from './bav-rechner.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Public discovery page for `/bav-rechner`. See `RentenluckeRechnerPage.tsx`
 * for the PR-3 ArticleLayout pattern.
 */
export function BavRechnerPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/bav-rechner" navigate={navigate}>
      <BavRechnerBody />
    </ArticleLayout>
  )
}
