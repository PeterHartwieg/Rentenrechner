import { ArticleLayout } from '../articles/ArticleLayout'
import BavRechnerBody from './bav-rechner.body.mdx'

/**
 * Public discovery page for `/bav-rechner`. See `RentenluckeRechnerPage.tsx`
 * for the PR-3 ArticleLayout pattern.
 */
export function BavRechnerPage() {
  return (
    <ArticleLayout routeId="/bav-rechner">
      <BavRechnerBody />
    </ArticleLayout>
  )
}
