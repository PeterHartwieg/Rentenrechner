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
  etf: 'Wertpapierdepot mit Auszahlplan — Abgeltungsteuer auf Gewinne.',
  bav: 'Entgeltumwandlung mit Arbeitgeber-Zuschuss — voll steuerpflichtig im Alter.',
  versicherung: 'Lebenslange Rente aus dem Versicherungsmantel — Halbeinkünfte oder Ertragsanteil.',
  basisrente: 'Steuerersparnis heute (§ 10 EStG) — nachgelagerte Volle Besteuerung im Alter.',
  altersvorsorgedepot: 'Geförderter ETF-Mantel — Auszahlplan ab 65, nachgelagerte Besteuerung.',
  riester: 'Zulagen plus Steuerersparnis — staatlich gefördert, voll steuerpflichtig im Alter.',
}
