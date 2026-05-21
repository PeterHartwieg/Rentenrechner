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

/**
 * Context object consumed by registry entries that depend on per-scenario
 * inputs (currently only `versicherung`, whose minimum payout age varies
 * with `contractStartYear` per `§52 Abs. 28 Satz 7 EStG`). Static entries
 * ignore the context — the registry value resolver only invokes the
 * function form when the entry is a function.
 */
export interface AvailabilityContext {
  /**
   * Live `assumptions.insurance.contractStartYear` for the scenario.
   * Threaded by `getAvailabilityEntry` into the `versicherung` entry so the
   * footer copy honours `halbeinkuenfteMinAgeForContractStartYear`: 60 for
   * pre-2012 contracts, 62 from 2012 (`§52 Abs. 28 Satz 7 EStG`). PR 290
   * Codex P2 — without threading the live year, the label was locked to
   * "ab 62 J." regardless of the active contract era.
   */
  readonly insuranceContractStartYear: number
}

/**
 * Entry value in the registry: either a static `AvailabilityEntry` for
 * products whose copy is invariant, or a function form for products whose
 * copy depends on scenario context (currently `versicherung`).
 *
 * Keeping the registry typed as `Record<ProductId, ...>` preserves the
 * exhaustiveness invariant — adding a new product forces a matching key,
 * and the value can be either static or context-aware without changing
 * the resolver's contract.
 */
export type AvailabilityRegistryValue =
  | AvailabilityEntry
  | ((ctx: AvailabilityContext) => AvailabilityEntry)

// `legalConstants.basisrente.minPayoutAge` pins to `§10 Abs. 1 Nr. 2 b
// Doppelbuchst. aa EStG / AltZertG §2` (currently 62).
const basisrenteMinAge = legalConstants.basisrente.minPayoutAge

// For insurance-shaped contracts with statutory product-binding (bAV, AVD,
// Riester) the Halbeinkünfteverfahren raises the minimum payout age to 62
// for contracts concluded after 2011 (`§52 Abs. 28 Satz 7 EStG`). These
// products use the current rule year's contract-start treatment as their
// floor; only private insurance (`versicherung`) is dispatched on the live
// `contractStartYear` because the user can model an older Altvertrag.
const insurancePost2011MinAge = halbeinkuenfteMinAgeForContractStartYear(
  legalConstants.insurance.halbeinkuenfteRaisedMinAgeContractStartYear,
)

export const productAvailabilityCopy: Record<ProductId, AvailabilityRegistryValue> = {
  etf: {
    label: 'jederzeit',
    note: 'Frei verfügbar. Auszahlplan ab Renteneintritt; Zugriff jederzeit möglich.',
  },
  bav: {
    label: `ab ${insurancePost2011MinAge} J. (Vertragsbindung)`,
    note: 'Auszahlung an den Renteneintritt gekoppelt. Vorzeitige Verfügung in der Regel ausgeschlossen.',
  },
  // PR 290 Codex P2: dispatch on the live `assumptions.insurance.contractStartYear`
  // so pre-2012 Altverträge surface "ab 60 J." (§20 Abs. 1 Nr. 6 EStG, original
  // text) and post-2011 contracts surface "ab 62 J." (§52 Abs. 28 Satz 7 EStG).
  // The canonical resolver `halbeinkuenfteMinAgeForContractStartYear` already
  // encodes the boundary year — we just supply the live input.
  versicherung: (ctx) => {
    const minAge = halbeinkuenfteMinAgeForContractStartYear(ctx.insuranceContractStartYear)
    return {
      label: `ab ${minAge} J. (Halbeinkünfte)`,
      note: 'Auszahlung an Vertragsende oder Renteneintritt; Kündigung möglich, aber meist mit Verlust.',
    }
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
