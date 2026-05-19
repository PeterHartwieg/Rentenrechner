import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import PrivateRvBody from './private-rentenversicherung-rechner.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Public discovery page for `/private-rentenversicherung-rechner`. See
 * `RentenluckeRechnerPage.tsx` for the PR-3 ArticleLayout pattern.
 */
export function PrivateRentenversicherungRechnerPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/private-rentenversicherung-rechner" navigate={navigate}>
      <PrivateRvBody />
    </ArticleLayout>
  )
}
