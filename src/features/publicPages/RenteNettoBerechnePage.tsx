import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import RenteNettoBody from './rente-netto-berechnen.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Public discovery page for `/rente-netto-berechnen`. See
 * `RentenluckeRechnerPage.tsx` for the PR-3 ArticleLayout pattern.
 */
export function RenteNettoBerechnePage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/rente-netto-berechnen" navigate={navigate}>
      <RenteNettoBody />
    </ArticleLayout>
  )
}
