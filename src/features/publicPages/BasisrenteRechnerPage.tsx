import { ArticleLayout } from '../articles/ArticleLayout'
import BasisrenteBody from './basisrente-rechner.body.mdx'

/**
 * Public discovery page for `/basisrente-rechner`. See `RentenluckeRechnerPage.tsx`
 * for the PR-3 ArticleLayout pattern.
 */
export function BasisrenteRechnerPage() {
  return (
    <ArticleLayout routeId="/basisrente-rechner">
      <BasisrenteBody />
    </ArticleLayout>
  )
}
