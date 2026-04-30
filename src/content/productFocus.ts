import type { ProductId } from '../domain'

/**
 * One-line focus copy per product, shown above each input section in the
 * Angebot eingeben view. Each entry summarises the product in plain language:
 * - `purpose`  — what the product is for (one short clause)
 * - `liquidity` — when the user can access the money
 * - `taxLine`  — how taxes are handled in plain words (no paragraph symbols)
 *
 * Style guide:
 * - lead with the user task or trade-off, not the legal classification
 * - avoid §-references, "Schicht", "Mantel", "Halbeinkünfte" etc. — keep
 *   formal terms in the glossary instead
 * - one sentence per field; aim for under 100 chars where possible
 *
 * Kept in src/content/ so that microcopy edits do not touch engine or feature code.
 */
export type ProductFocus = {
  purpose: string
  liquidity: string
  taxLine: string
}

export const PRODUCT_FOCUS: Record<ProductId, ProductFocus> = {
  etf: {
    purpose: 'Wertpapierdepot, das du selbst verwaltest — Standard-Vergleichsmaßstab.',
    liquidity: 'Jederzeit verfügbar — du kannst Geld auch vor der Rente entnehmen.',
    taxLine: 'Auf Kursgewinne fällt Abgeltungsteuer an, je nach Fondsart mit Rabatt.',
  },
  bav: {
    purpose: 'Vom Brutto sparen — Arbeitgeber und Steuer geben fast immer etwas dazu.',
    liquidity: 'Gebunden bis zum Renteneintritt; Auszahlung als Rente oder Einmalbetrag möglich.',
    taxLine: 'Beiträge sind während der Ansparphase steuer- und sozialabgabenfrei. In der Rente fallen Steuer und Krankenkasse an.',
  },
  versicherung: {
    purpose: 'Vertrag mit garantierter monatlicher Rente, vom Versicherer verwaltet.',
    liquidity: 'Während der Laufzeit nur mit Verlust kündbar (Stornoabzug).',
    taxLine: 'In der Rente niedrigere Steuer als beim ETF — dafür meist deutlich höhere laufende Kosten.',
  },
  basisrente: {
    purpose: 'Geförderte Privatrente, die wie die gesetzliche Rente strukturiert ist.',
    liquidity: 'Nur als lebenslange Rente — keine Kapitalauszahlung, nicht vererbbar, nicht beleihbar.',
    taxLine: 'Beiträge sind in der Ansparphase voll absetzbar; in der Rente wird voll versteuert.',
  },
  altersvorsorgedepot: {
    purpose: 'Wertpapierdepot mit staatlicher Förderung — neu ab 2027.',
    liquidity: 'Gebunden bis Rentenbeginn (frühestens 65); Auszahlung als Entnahmeplan oder Rente.',
    taxLine: 'Förderung über Zulagen und Steuerersparnis; in der Rente wird voll versteuert.',
  },
  riester: {
    purpose: 'Geförderte Privatrente mit Zulagen — vor allem für Familien mit Kindern attraktiv.',
    liquidity: 'Gebunden bis Alter 62; bis 30 % als Einmalbetrag zu Rentenbeginn möglich.',
    taxLine: 'Förderung über Zulagen und Steuerersparnis; in der Rente wird voll versteuert.',
  },
}
