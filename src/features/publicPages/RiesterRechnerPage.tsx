import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import RiesterBody from './riester-rechner.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Public discovery page for `/riester-rechner`. See `RentenluckeRechnerPage.tsx`
 * for the PR-3 ArticleLayout pattern.
 */
export function RiesterRechnerPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/riester-rechner" navigate={navigate}>
      <RiesterBody />
    </ArticleLayout>
  )
}
