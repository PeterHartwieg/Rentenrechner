import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import BasisrenteBody from './basisrente-rechner.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Public discovery page for `/basisrente-rechner`. See `RentenluckeRechnerPage.tsx`
 * for the PR-3 ArticleLayout pattern.
 */
export function BasisrenteRechnerPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/basisrente-rechner" navigate={navigate}>
      <BasisrenteBody />
    </ArticleLayout>
  )
}
