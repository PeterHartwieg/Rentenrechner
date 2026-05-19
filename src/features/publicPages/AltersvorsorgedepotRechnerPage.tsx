import type { Route } from '../../app/useRoute'
import { ArticleLayout } from '../articles/ArticleLayout'
import AvdBody from './altersvorsorgedepot-rechner.body.mdx'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * Public discovery page for `/altersvorsorgedepot-rechner`. AVD is the new
 * Schicht-2 depot product introduced by the Jahressteuergesetz 2024. See
 * `RentenluckeRechnerPage.tsx` for the PR-3 ArticleLayout pattern.
 */
export function AltersvorsorgedepotRechnerPage({ navigate }: Props = {}) {
  return (
    <ArticleLayout routeId="/altersvorsorgedepot-rechner" navigate={navigate}>
      <AvdBody />
    </ArticleLayout>
  )
}
