import type { ProductId } from '../domain'
import {
  legalConstants,
  halbeinkuenfteMinAgeForContractStartYear,
} from '../rules/legalConstants'

/**
 * Per-product "Verfügbar ab" footer copy for the `/vergleich/details` card grid
 * (PR 10). Mirrors the registry-driven pattern of `proContraCopy.ts` so a new
 * product is one entry edit, not a switch-chain change.
 *
 * Numeric ages MUST trace back to `src/rules/legalConstants.ts`. For products
 * that have no statutory minimum payout age (ETF — Kapitalverzehr is freely
 * configurable, no §-pin) the `label` describes the contract mechanism rather
 * than citing an inapplicable statutory floor.
 */
export interface AvailabilityEntry {
  /** Headline label rendered after "Verfügbar ab:" in the card footer. */
  readonly label: string
  /** Optional secondary line — short paragraph below the label. */
  readonly note?: string
}

// `legalConstants.basisrente.minPayoutAge` pins to `§10 Abs. 1 Nr. 2 b
// Doppelbuchst. aa EStG / AltZertG §2` (currently 62).
const basisrenteMinAge = legalConstants.basisrente.minPayoutAge

// For private insurance & insurance-shaped contracts (bAV, AVD, Riester) the
// Halbeinkünfteverfahren raises the minimum payout age to 62 for contracts
// concluded after 2011 (`§52 Abs. 28 Satz 7 EStG`). New compare-mode
// contracts inherit the current rule year's contract-start treatment.
const insurancePost2011MinAge = halbeinkuenfteMinAgeForContractStartYear(
  legalConstants.insurance.halbeinkuenfteRaisedMinAgeContractStartYear,
)

export const productAvailabilityCopy: Record<ProductId, AvailabilityEntry> = {
  etf: {
    label: 'jederzeit',
    note: 'Frei verfügbar. Auszahlplan ab Renteneintritt; Zugriff jederzeit möglich.',
  },
  bav: {
    label: `ab ${insurancePost2011MinAge} J. (Vertragsbindung)`,
    note: 'Auszahlung an den Renteneintritt gekoppelt. Vorzeitige Verfügung in der Regel ausgeschlossen.',
  },
  versicherung: {
    label: `ab ${insurancePost2011MinAge} J. (Halbeinkünfte)`,
    note: 'Auszahlung an Vertragsende oder Renteneintritt; Kündigung möglich, aber meist mit Verlust.',
  },
  basisrente: {
    label: `ab ${basisrenteMinAge} J. (Leibrente)`,
    note: 'Auszahlung nur als monatliche Rente — kein Kapitalauszahlungsrecht (§ 10 Abs. 1 Nr. 2 EStG).',
  },
  altersvorsorgedepot: {
    label: `ab ${insurancePost2011MinAge} J. (Bindung)`,
    note: 'Auszahlplan an Renteneintritt gekoppelt. Zertifizierter Vertrag — Kündigung schädlich.',
  },
  riester: {
    label: `ab ${insurancePost2011MinAge} J. (Bindung)`,
    note: 'Auszahlung an Renteneintritt gekoppelt. Bei Kündigung Rückforderung der Zulagen + Steuervorteile.',
  },
}
