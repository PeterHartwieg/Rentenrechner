/**
 * Pure helpers for issue #23 — "Assumptions for unfilled products not visible".
 *
 * Determines whether all key assumptions for a product are still at their
 * out-of-the-box defaults, and produces a compact human-readable summary of
 * those defaults for display on unfilled product cards.
 *
 * Kept in a separate module (not inside AssumptionReviewPanel.tsx) so that
 * react-refresh / Fast Refresh rules are satisfied: only React components
 * may be the default export of a file that also exports components.
 */

import type { ProductId, ScenarioAssumptions } from '../../domain'
import { defaultAssumptions } from '../../data/defaultScenario'
import { formatCurrency, formatPercent } from '../../utils/format'

function diff(a: number, b: number): boolean {
  return Math.abs(a - b) > 1e-9
}

type RowKind = 'user' | 'default' | 'model'

interface SummaryRow {
  label: string
  value: string
  kind: RowKind
}

/** Build per-product rows capturing key assumptions and their provenance. */
function buildRows(productId: ProductId, assumptions: ScenarioAssumptions): SummaryRow[] {
  const def = defaultAssumptions

  switch (productId) {
    case 'etf': {
      const e = assumptions.etf
      const d = def.etf
      const exemptionLabel =
        e.equityPartialExemption === 0.3
          ? 'Aktienfonds'
          : e.equityPartialExemption === 0.15
            ? 'Mischfonds'
            : e.equityPartialExemption === 0.6
              ? 'Inl. Immobilienfonds'
              : e.equityPartialExemption === 0.8
                ? 'Ausl. Immobilienfonds'
                : 'Anleihe-ETF / Sonstige'
      return [
        {
          label: 'Fondskosten (TER)',
          value: formatPercent(e.annualAssetFee, 2) + ' p.a.',
          kind: diff(e.annualAssetFee, d.annualAssetFee) ? 'user' : 'default',
        },
        {
          label: 'Fondstyp',
          value: exemptionLabel,
          kind: diff(e.equityPartialExemption, d.equityPartialExemption) ? 'user' : 'default',
        },
      ]
    }

    case 'bav': {
      const b = assumptions.bav
      const d = def.bav
      const totalFee = b.fees.wrapperAssetFee + b.fees.fundAssetFee
      const defTotalFee = d.fees.wrapperAssetFee + d.fees.fundAssetFee
      const rows: SummaryRow[] = [
        {
          label: 'Brutto-Umwandlung',
          value: formatCurrency(b.monthlyGrossConversion, 0) + ' /Monat',
          kind: diff(b.monthlyGrossConversion, d.monthlyGrossConversion) ? 'user' : 'default',
        },
        {
          label: 'AG-Zuschuss laut Vertrag',
          value: formatPercent(b.contractualMatchPercent, 0),
          kind: diff(b.contractualMatchPercent, d.contractualMatchPercent) ? 'user' : 'default',
        },
        {
          label: 'Gesamtkosten p.a.',
          value: formatPercent(totalFee, 2) + ' p.a.',
          kind: diff(totalFee, defTotalFee) ? 'user' : 'default',
        },
      ]
      if (b.payoutMode === 'leibrente') {
        const isUserEdited = diff(b.rentenfaktor, d.rentenfaktor)
        rows.push({
          label: 'Rentenfaktor',
          value: `${b.rentenfaktor} €/10k`,
          kind: isUserEdited ? 'user' : b.rentenfaktorConfirmed ? 'default' : 'model',
        })
      }
      return rows
    }

    case 'versicherung': {
      const ins = assumptions.insurance
      const d = def.insurance
      const totalFee = ins.fees.wrapperAssetFee + ins.fees.fundAssetFee
      const defTotalFee = d.fees.wrapperAssetFee + d.fees.fundAssetFee
      const rows: SummaryRow[] = [
        {
          label: 'Vertragsbeginn',
          value: String(ins.contractStartYear),
          kind: diff(ins.contractStartYear, d.contractStartYear) ? 'user' : 'default',
        },
        {
          label: 'Gesamtkosten p.a.',
          value: formatPercent(totalFee, 2) + ' p.a.',
          kind: diff(totalFee, defTotalFee) ? 'user' : 'default',
        },
      ]
      if (ins.payoutMode === 'leibrente') {
        const isUserEdited = diff(ins.rentenfaktor, d.rentenfaktor)
        rows.push({
          label: 'Rentenfaktor',
          value: `${ins.rentenfaktor} €/10k`,
          kind: isUserEdited ? 'user' : ins.rentenfaktorConfirmed ? 'default' : 'model',
        })
      }
      return rows
    }

    case 'basisrente': {
      const br = assumptions.basisrente
      const d = def.basisrente
      const totalFee = br.fees.wrapperAssetFee + br.fees.fundAssetFee
      const defTotalFee = d.fees.wrapperAssetFee + d.fees.fundAssetFee
      const isUserEdited = diff(br.rentenfaktor, d.rentenfaktor)
      return [
        {
          label: 'Monatsbeitrag',
          value: formatCurrency(br.monthlyGrossContribution, 0) + ' /Monat',
          kind: diff(br.monthlyGrossContribution, d.monthlyGrossContribution) ? 'user' : 'default',
        },
        {
          label: 'Rentenfaktor',
          value: `${br.rentenfaktor} €/10k`,
          kind: isUserEdited ? 'user' : br.rentenfaktorConfirmed ? 'default' : 'model',
        },
        {
          label: 'Gesamtkosten p.a.',
          value: formatPercent(totalFee, 2) + ' p.a.',
          kind: diff(totalFee, defTotalFee) ? 'user' : 'default',
        },
      ]
    }

    case 'altersvorsorgedepot': {
      const avd = assumptions.altersvorsorgedepot
      const d = def.altersvorsorgedepot
      return [
        {
          label: 'Eigenbeitrag',
          value: formatCurrency(avd.monthlyOwnContribution, 0) + ' /Monat',
          kind: diff(avd.monthlyOwnContribution, d.monthlyOwnContribution) ? 'user' : 'default',
        },
      ]
    }

    case 'riester': {
      const r = assumptions.riester
      const d = def.riester
      const rows: SummaryRow[] = [
        {
          label: 'Eigenbeitrag',
          value: formatCurrency(r.monthlyOwnContribution, 0) + ' /Monat',
          kind: diff(r.monthlyOwnContribution, d.monthlyOwnContribution) ? 'user' : 'default',
        },
      ]
      if (r.payoutMode === 'leibrente') {
        const isUserEdited = diff(r.rentenfaktor, d.rentenfaktor)
        rows.push({
          label: 'Rentenfaktor',
          value: `${r.rentenfaktor} €/10k`,
          kind: isUserEdited ? 'user' : r.rentenfaktorConfirmed ? 'default' : 'model',
        })
      }
      return rows
    }

    default:
      return []
  }
}

/**
 * Returns true when every key assumption for `productId` is still at its
 * out-of-the-box default — i.e. the user has not touched any field for this
 * product yet.
 *
 * Used by `ProductEditCards` to decide whether to show the
 * "Verwendet Standardwerte" notice + "Einstellungen anpassen" affordance.
 */
export function isProductAllDefaults(
  productId: ProductId,
  assumptions: ScenarioAssumptions,
): boolean {
  const rows = buildRows(productId, assumptions)
  return rows.length > 0 && rows.every((r) => r.kind === 'default' || r.kind === 'model')
}

/**
 * Returns a compact human-readable summary of the key default assumptions for
 * a product (for display on the unfilled card).  Returns an empty string for
 * unknown products.
 */
export function buildProductDefaultsSummary(
  productId: ProductId,
  assumptions: ScenarioAssumptions,
): string {
  const rows = buildRows(productId, assumptions)
  if (rows.length === 0) return ''
  return rows.map((r) => `${r.label}: ${r.value}`).join(' · ')
}
