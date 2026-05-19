import { ArticleLayout } from '../articles/ArticleLayout'
import RiesterBody from './riester-rechner.body.mdx'

/**
 * Public discovery page for `/riester-rechner`. See `RentenluckeRechnerPage.tsx`
 * for the PR-3 ArticleLayout pattern.
 */
export function RiesterRechnerPage() {
  return (
    <ArticleLayout routeId="/riester-rechner">
      <RiesterBody />
    </ArticleLayout>
  )
}
