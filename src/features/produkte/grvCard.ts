import type { ProduktRowField } from './DProduktRow'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format'
import { activeRules } from '../../rules'
import { besteuerungsanteilGrv } from '../../rules/legalConstants'

/**
 * Shared GRV-card copy + field builder for `/eingaben/produkte`.
 *
 * The compare-mode and combine-mode panel branches render the same § 1 DRV
 * card. Card copy, the provenance decision, and the calculation-date label
 * used to exist twice as inline literals and had already drifted once, so
 * both branches now consume this module.
 *
 * **Provenance contract** (input-followups plan 3 — honest statutory-pension
 * provenance):
 *  - The card never claims a document was imported, uploaded, or verified.
 *    There is no upload path; the baseline is either the user's own entry or
 *    a model estimate derived from Entgeltpunkte.
 *  - `manualMonthlyGross !== null` means the user typed an explicit value
 *    (including an explicit zero) — labelled "Manuell eingegeben". It is NOT
 *    "lt. Beleg" or "Bestätigt": typing a number proves nothing about a
 *    document.
 *  - Everything projected forward stays "Schätzung", even when the starting
 *    value was entered manually.
 *  - The card carries no `EvidenceState` (evidence flags live on instances;
 *    `statutoryPension` carries none), so no enum is invented and no value is
 *    reinterpreted as evidence — the labels below are static or input-mode
 *    derived only.
 *  - "Berechnungsstand" reports the statutory rule year the calculation uses
 *    (`activeRules.year`). The current browser date is deliberately NOT shown:
 *    it reads like a document date the tool never saw.
 */

/** Kicker label above the card title (both modes). */
export const GRV_CARD_KIND = 'DRV · Schicht 1 · Pflicht'

/** Card headline. Neutral product label — no "Rentenauskunft" import claim. */
export const GRV_CARD_TITLE = 'Gesetzliche Rentenversicherung'

/** § 1 section note, rendered under the section legend. */
export const GRV_SECTION_NOTE =
  'Pflicht für die meisten Angestellten. Ausgangswerte sind deine Eingaben oder eine modellbasierte Schätzung.'

/** Italic accent line below the field grid. */
export const GRV_CARD_ACCENT =
  'Manuelle Eingaben überschreiben die Schätzung. Die Prognose bleibt eine Schätzung.'

/** Status-badge label for the two supported input modes. */
export type GrvProvenanceLabel = 'Manuell eingegeben' | 'Schätzung'

/**
 * Provenance badge for the GRV card, derived only from the input mode —
 * never from the value itself. An explicit `0` counts as manual input.
 */
export function grvProvenanceLabel(
  manualMonthlyGross: number | null | undefined,
): GrvProvenanceLabel {
  return manualMonthlyGross !== null && manualMonthlyGross !== undefined
    ? 'Manuell eingegeben'
    : 'Schätzung'
}

/** Inputs for {@link buildGrvCardFields}. */
export interface GrvCardFieldsInput {
  /** Entgeltpunkte entered by the user (the current baseline). */
  currentEntgeltpunkte: number
  /** Projected EP at retirement; omit when no simulation result is available. */
  projectedEntgeltpunkte?: number
  /** Projected gross monthly pension; omit when no simulation result is available. */
  grossMonthlyPension?: number
  /** Profile retirement age (drives the projection label + Besteuerungsanteil year). */
  retirementAge: number
  /** Profile current age (drives the Besteuerungsanteil year). */
  age: number
}

/**
 * Field rows for the § 1 DRV card. Both panel branches must render exactly
 * these rows; the combine branch passes `undefined` projections when it
 * mounts without a simulation result (inputs-only view → em-dash cells).
 */
export function buildGrvCardFields(
  input: GrvCardFieldsInput,
): readonly ProduktRowField[] {
  const rentenwert = activeRules.socialSecurity.aktuellerRentenwert
  const retirementYear = activeRules.year + (input.retirementAge - input.age)
  const besteuerungsanteil = besteuerungsanteilGrv(retirementYear)

  return [
    { key: 'Berechnungsstand', value: `Wertejahr ${activeRules.year}` },
    {
      key: 'Bisherige Entgeltpunkte',
      value: `${formatNumber(input.currentEntgeltpunkte, 2)} EP`,
    },
    {
      key: `Voraussichtlich mit ${input.retirementAge}`,
      value:
        input.projectedEntgeltpunkte !== undefined
          ? `${formatNumber(input.projectedEntgeltpunkte, 2)} EP`
          : '—',
    },
    {
      key: 'Heutiger Rentenwert (West)',
      value: formatCurrency(rentenwert, 2),
    },
    {
      key: 'Brutto-Rente, geschätzt',
      value:
        input.grossMonthlyPension !== undefined
          ? `${formatCurrency(input.grossMonthlyPension, 0)}/Mon.`
          : '—',
    },
    {
      key: 'Steuerlich erfasst ab',
      value: `${retirementYear} (${formatPercent(besteuerungsanteil, 0)})`,
    },
  ]
}
