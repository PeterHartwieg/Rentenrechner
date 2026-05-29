import type { ProductId } from '../../domain'
import { activeRules } from '../../rules'

/**
 * One-liners for the § 3 "Sparformen, die du noch hinzufügen kannst" tiles in
 * `ProdukteEingabenPanel`. The voice mirrors the v3 design bundle's tile copy
 * (`direction-d-pages.jsx` L408-413) — short, factual, Schicht number plus
 * the headline benefit so the user can pick at a glance.
 *
 * Keys are the canonical `ProductId` literals from `PRODUCT_REGISTRY`. We do
 * NOT include entries for "Banksparplan / Immobilie / Sonstiges" — those are
 * not registered products and minting registry-shaped entries for them would
 * break the CLAUDE.md P1 "PRODUCT_REGISTRY bypassed" guardrail.
 *
 * The AVD start year is sourced from `activeRules.altersvorsorgedepot.productStartYear`
 * (= 2027) — the first contract-availability year — not the legislative reform
 * year (2026). Single source of truth; follows the rules-year swap automatically.
 */
export const sparformDescriptions: Record<ProductId, string> = {
  etf: 'Schicht 3 · breit gestreutes Aktiendepot, Abgeltungsteuer mit Teilfreistellung',
  bav: 'bAV · Entgeltumwandlung, 5 Durchführungswege',
  versicherung: 'Schicht 3 · private Rentenversicherung mit Garantie oder Fonds',
  basisrente: 'Rürup · Schicht 1 · steuerlich gefördert',
  altersvorsorgedepot: `Schicht 2 · staatlich zertifiziertes Aktiendepot ab ${activeRules.altersvorsorgedepot.productStartYear}`,
  riester: 'Schicht 2 · staatliche Zulagen & Steuer',
}
