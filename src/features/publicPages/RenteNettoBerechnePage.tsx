import { ArticleLayout } from '../articles/ArticleLayout'
import RenteNettoBody from './rente-netto-berechnen.body.mdx'

/**
 * Public discovery page for `/rente-netto-berechnen`. See
 * `RentenluckeRechnerPage.tsx` for the PR-3 ArticleLayout pattern.
 */
export function RenteNettoBerechnePage() {
  return (
    <ArticleLayout routeId="/rente-netto-berechnen">
      <RenteNettoBody />
    </ArticleLayout>
  )
}
