import type { ProductId } from '../../domain'

/**
 * One-line tagline per product, shown in the Vergleich comparison table's
 * "Wie es funktioniert" column (desktop / tablet) and the per-product card
 * body (phone). Kept separate from `productFocus.ts` because the Vergleich
 * surface needs a one-clause "how it works" line, not the three-field focus
 * breakdown.
 *
 * Voice: neutral, no recommendation. Mirrors the Sober artboard's compact
 * tone — describe the mechanism, not its quality.
 */
export const productTaglines: Record<ProductId, string> = {
  etf: 'Dein selbst angelegtes Vermögen im Wertpapierdepot.',
  bav: 'Betriebliche Vorsorge über deinen Arbeitgeber.',
  versicherung: 'Dein privater Versicherungsvertrag mit eigener Kosten- und Auszahlungsregelung.',
  basisrente: 'Auch als Rürup-Rente bekannt.',
  altersvorsorgedepot: 'Gefördertes Depot mit hinterlegten Modellannahmen.',
  riester: 'Dein Riester-Vertrag mit Zulagen und möglicher Steuerersparnis.',
}
