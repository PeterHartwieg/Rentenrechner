import type { ProductId } from '../domain'

/**
 * One-line focus copy per product, shown above each input section in the
 * Angebot eingeben view. Each entry summarises the product in plain language:
 * - `purpose`  — what the product is for (one short clause)
 * - `liquidity` — when the user can access the money
 * - `taxLine`  — how taxes are handled in plain words (no paragraph symbols)
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
    purpose: 'Selbst gemanagtes Wertpapierdepot — Standard-Vergleichsmaßstab.',
    liquidity: 'Jederzeit verfügbar; Auszahlung als Entnahmeplan.',
    taxLine: 'Abgeltungsteuer auf Gewinne; Teilfreistellung je nach Fondsart.',
  },
  bav: {
    purpose: 'Betriebliche Altersvorsorge per Entgeltumwandlung — meist mit AG-Zuschuss.',
    liquidity: 'Gebunden bis Renteneintritt; Kapitalauszahlung möglich (steuerpflichtig).',
    taxLine: 'Beiträge steuer- und sv-frei (Grenzen 8 % / 4 % BBG); Rente voll steuerpflichtig + KV/PV.',
  },
  versicherung: {
    purpose: 'Private Rentenversicherung (Schicht 3) — Versicherungsmantel mit Garantie/Rentenfaktor.',
    liquidity: 'Kündbar mit Stornoabschlag; Auszahlung als Kapital oder Leibrente.',
    taxLine: 'Halbeinkünfte oder Abgeltungsteuer auf Kapital; Ertragsanteil auf Leibrente.',
  },
  basisrente: {
    purpose: 'Basisrente / Rürup — Schicht 1, ähnlich der gesetzlichen Rente strukturiert.',
    liquidity: 'Nur Leib- oder Zeitrente, keine Kapitalauszahlung; Pfändungsschutz.',
    taxLine: 'Beiträge bis zum Schicht-1-Höchstbetrag absetzbar; Rente nach Kohortensatz steuerpflichtig.',
  },
  altersvorsorgedepot: {
    purpose: 'Altersvorsorgedepot (ab 2027) — gefördertes Wertpapierdepot mit Zulagen.',
    liquidity: 'Gebunden bis Renteneintritt (frühestens 65); Auszahlung als Entnahmeplan oder Rente.',
    taxLine: 'Förderung über Zulagen + Sonderausgabenabzug (§10a); Auszahlung voll steuerpflichtig.',
  },
  riester: {
    purpose: 'Riester-Rente (Altvertrag) — geförderte private Vorsorge mit Zulagen.',
    liquidity: 'Gebunden bis 62; bis zu 30 % Kapitalentnahme zu Rentenbeginn möglich.',
    taxLine: 'Förderung über Zulagen + Sonderausgabenabzug; Auszahlung voll steuerpflichtig.',
  },
}
