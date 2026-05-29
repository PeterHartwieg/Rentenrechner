import { AVD_EFFECTIVE_YEAR } from '../../rules/legalConstants'
import type { ProductId } from '../../domain'

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
 */
export const sparformDescriptions: Record<ProductId, string> = {
  etf: 'Schicht 3 · breit gestreutes Aktiendepot, Abgeltungsteuer mit Teilfreistellung',
  bav: 'bAV · Entgeltumwandlung, 5 Durchführungswege',
  versicherung: 'Schicht 3 · private Rentenversicherung mit Garantie oder Fonds',
  basisrente: 'Rürup · Schicht 1 · steuerlich gefördert',
  altersvorsorgedepot: `Schicht 2 · staatlich zertifiziertes Aktiendepot ab ${AVD_EFFECTIVE_YEAR}`,
  riester: 'Schicht 2 · staatliche Zulagen & Steuer',
}
