import { ArticleLayout } from '../articles/ArticleLayout'
import AltersvorsorgeBody from './altersvorsorgeprodukte-vergleichen.body.mdx'
import { useQaMode } from '../qa-feedback/useQaMode'
import { qaTargetAttrs } from '../qa-feedback/useFeedbackTarget'

/**
 * Public discovery page for `/altersvorsorgeprodukte-vergleichen`.
 *
 * Portfolio framing (`Article` JSON-LD): explains combine-mode, per-instance
 * contract arrays, transfer events, household totals, and the
 * "Wo geht mein nächster Euro hin?" recommender entry point.
 *
 * This page explicitly frames RentenWiki.de as a free model calculator with
 * NO broker/affiliate/product-recommendation posture (PRD lines 16–18). The
 * QA-mode wrapper around the body preserves the per-page feedback target so
 * the QA overlay can capture screenshots scoped to this article.
 */
export function AltersvorsorgeproduktePage() {
  const { enabled: qaEnabled } = useQaMode()

  return (
    <ArticleLayout routeId="/altersvorsorgeprodukte-vergleichen">
      <section
        {...qaTargetAttrs(qaEnabled, {
          id: 'publicPage.altersvorsorgeprodukte.article',
          label: 'Artikel: Altersvorsorgeprodukte vergleichen',
          precision: 'section',
        })}
      >
        <AltersvorsorgeBody />
      </section>
    </ArticleLayout>
  )
}
