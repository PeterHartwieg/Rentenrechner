import { ArticleLayout } from '../articles/ArticleLayout'
import EtfVsBavBody from './etf-vs-bav.body.mdx'

/**
 * Public discovery page for `/etf-vs-bav`. Comparison (Article-shaped) page
 * — no winner copy, no "besser als" / "lohnt sich" / "empfohlen". See
 * `RentenluckeRechnerPage.tsx` for the PR-3 ArticleLayout pattern.
 */
export function EtfVsBavPage() {
  return (
    <ArticleLayout routeId="/etf-vs-bav">
      <EtfVsBavBody />
    </ArticleLayout>
  )
}
