import { ArticleLayout } from '../articles/ArticleLayout'
import PrivateRvBody from './private-rentenversicherung-rechner.body.mdx'

/**
 * Public discovery page for `/private-rentenversicherung-rechner`. See
 * `RentenluckeRechnerPage.tsx` for the PR-3 ArticleLayout pattern.
 */
export function PrivateRentenversicherungRechnerPage() {
  return (
    <ArticleLayout routeId="/private-rentenversicherung-rechner">
      <PrivateRvBody />
    </ArticleLayout>
  )
}
