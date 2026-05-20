import type { ProductId } from '../domain'

/**
 * Pro / Contra copy per product, shown in the Vergleich page's neutral
 * comparison grid (PR 9). One short sentence per side, no winner framing.
 *
 * Voice guide — mirrors the Direction-D Sober artboard (`direction-d.jsx`):
 * - neutral; no "Empfehlung", no "stark", no "klasse"
 * - the user weighs trade-offs themselves; we only describe each side
 * - lead with the concrete trade-off (cost / flexibility / tax-treatment /
 *   inheritance), not the legal classification
 * - keep `pro` and `contra` symmetric in length and tone
 *
 * Kept in `src/content/` so microcopy edits do not touch engine or feature
 * code. Consumed by `VergleichProContraGrid`.
 */
export type ProContraEntry = {
  readonly pro: string
  readonly contra: string
}

export const proContraCopy: Record<ProductId, ProContraEntry> = {
  etf: {
    pro: 'Niedrigste Kosten. Volle Verfügung über das Kapital. Vererbbar.',
    contra: 'Keine garantierte Rente. Disziplin und Eigenverantwortung nötig.',
  },
  bav: {
    pro: 'Arbeitgeber-Zuschuss (oft 15–30 %). Sozialabgaben-Ersparnis heute.',
    contra: 'Volle KV/PV-Pflicht im Alter (~18 % der Rente). Bindung an Arbeitgeber.',
  },
  versicherung: {
    pro: 'Lebenslange Rentengarantie. Steuervorteil ab 62 (Halbeinkünfte).',
    contra: 'Höchste Kosten (~1,2 %/Jahr). Geringe Flexibilität.',
  },
  basisrente: {
    pro: 'Hohe Steuer-Absetzbarkeit in der Ansparphase (§ 10 Abs. 3 EStG Höchstbetrag).',
    contra: 'Voll steuerpflichtig im Alter. Nicht kündbar, nicht vererbbar an Nicht-Ehegatten.',
  },
  altersvorsorgedepot: {
    pro: 'Geringe Kosten in ETF-Verpackung. Förderung über Steuerstundung in der Ansparphase.',
    contra: 'Auszahlung erst ab 65. Voll steuerpflichtige Rente; Sonderbedingungen je Anbieter.',
  },
  riester: {
    pro: 'Staatliche Zulagen (Grund- und Kinderzulage) plus Steuerersparnis durch Sonderausgaben.',
    contra: 'Höhere Verwaltungskosten. Voll steuerpflichtig im Alter; eingeschränkte Vererbbarkeit.',
  },
}
