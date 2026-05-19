import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import RiesterVsAvdBody from './riester-vs-altersvorsorgedepot.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Public discovery page for `/riester-vs-altersvorsorgedepot`. Comparison
 * (Article-shaped) page — no winner copy per YMYL guardrail. See
 * `RentenluckeRechnerPage.tsx` for the PR-3 ArticleLayout pattern.
 */
export function RiesterVsAltersvorsorgedepotPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/riester-vs-altersvorsorgedepot" navigate={navigate}>
      <RiesterVsAvdBody />
    </ArticleLayout>
  )
}
