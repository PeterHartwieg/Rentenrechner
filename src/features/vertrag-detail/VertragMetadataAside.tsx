import { RightRailAccordion } from '../../ui/chrome/RightRailAccordion'
import { ROUTES, routeToPath } from '../../app/useRoute'
import type { Route } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import type { InstanceCommon } from '../../domain/instances'
import type { ProductId } from '../../domain/products/common'
import { formatCurrency, formatPercent } from '../../utils/format'

interface Props {
  instance: InstanceCommon
  productId: ProductId
  /** SPA navigator threaded from the page. */
  navigate: (target: Route) => void
}

interface MetadataRow {
  key: string
  label: string
  value: string
}

/**
 * VertragMetadataAside — right-rail "Vertragsdaten" on Vertrag-Detail (PR 7).
 *
 * Inside `RightRailAccordion`, so the rail folds into a phone bottom
 * accordion on narrow viewports. The body lists contract-identifying
 * fields (Anbieter, Vertragsbeginn, Sparrate, TER, Effektivkosten, …) and
 * a status pill. Per-row formatting is centralised in `buildMetadataRows`
 * so the row list stays simple and the formatter can be unit-tested
 * independently.
 *
 * Status dispatch is an exhaustive switch on `InstanceCommon['status']` so
 * a future status literal would force a compile error before shipping.
 */
export function VertragMetadataAside({ instance, productId, navigate }: Props) {
  const rows = buildMetadataRows(instance, productId)

  return (
    <RightRailAccordion label="Vertragsdaten" count={rows.length} desktopWidth={280}>
      <div className="vertrag-metadata-aside">
        <table className="vertrag-metadata-table">
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="vertrag-metadata-row">
                <td className="vertrag-metadata-key">{row.label}</td>
                <td className="vertrag-metadata-val">{row.value}</td>
              </tr>
            ))}
            <tr className="vertrag-metadata-row">
              <td className="vertrag-metadata-key">Status</td>
              <td className="vertrag-metadata-val">
                <StatusPill status={instance.status} />
              </td>
            </tr>
          </tbody>
        </table>

        <a
          className="vertrag-metadata-edit"
          href={routeToPath(ROUTES.eingaben)}
          onClick={(event) => {
            if (!shouldUseSpaNavigation(event)) return
            event.preventDefault()
            navigate(ROUTES.eingaben)
          }}
        >
          Angaben bearbeiten
        </a>
      </div>
    </RightRailAccordion>
  )
}

/**
 * Render the per-product metadata rows. Field selection mirrors the
 * Vertrag-Detail mock (M4a / TVertrag) and the related fields visible in
 * the InventoryWizard cards — Anbieter, Sparrate, TER, Effektivkosten —
 * with product-specific extras (Fonds for ETF, Garantiezins for pAV/Riester,
 * Durchführungsweg for bAV).
 *
 * Statutory-pension does NOT appear here — there is no instance-level
 * detail view for it; the GRV/VW/Beamten baseline is rendered on Mein Plan
 * § 1 only.
 */
function buildMetadataRows(
  instance: InstanceCommon,
  productId: ProductId,
): ReadonlyArray<MetadataRow> {
  const rows: MetadataRow[] = []
  if (instance.anbieter && instance.anbieter.trim().length > 0) {
    rows.push({ key: 'anbieter', label: 'Anbieter', value: instance.anbieter })
  }
  if (instance.contractStartYear) {
    rows.push({
      key: 'start',
      label: 'Vertragsbeginn',
      value: String(instance.contractStartYear),
    })
  }

  switch (productId) {
    case 'etf': {
      const monthly = (instance as { monthlyContribution?: number }).monthlyContribution
      if (typeof monthly === 'number') {
        rows.push({ key: 'sparrate', label: 'Sparrate', value: `${formatCurrency(monthly, 0)} / Mon.` })
      }
      const ter = (instance as { annualAssetFee?: number }).annualAssetFee
      if (typeof ter === 'number') {
        rows.push({ key: 'ter', label: 'TER', value: `${formatPercent(ter, 2)} p. a.` })
      }
      break
    }
    case 'bav': {
      const monthly = (instance as { monthlyGrossConversion?: number }).monthlyGrossConversion
      if (typeof monthly === 'number') {
        rows.push({ key: 'umwandlung', label: 'Bruttoumwandlung', value: `${formatCurrency(monthly, 0)} / Mon.` })
      }
      const dfw = (instance as { durchfuehrungsweg?: string }).durchfuehrungsweg
      if (typeof dfw === 'string') {
        rows.push({ key: 'dfw', label: 'Durchführungsweg', value: dfw })
      }
      addFeeRows(rows, instance)
      break
    }
    case 'versicherung': {
      const monthly = (instance as { monthlyContribution?: number }).monthlyContribution
      if (typeof monthly === 'number') {
        rows.push({ key: 'beitrag', label: 'Beitrag', value: `${formatCurrency(monthly, 0)} / Mon.` })
      }
      const garantie = (instance as { guaranteedInterestRate?: number }).guaranteedInterestRate
      if (typeof garantie === 'number' && garantie > 0) {
        rows.push({ key: 'garantie', label: 'Garantiezins', value: `${formatPercent(garantie, 2)} p. a.` })
      }
      addFeeRows(rows, instance)
      break
    }
    case 'basisrente': {
      const monthly = (instance as { monthlyGrossContribution?: number }).monthlyGrossContribution
      if (typeof monthly === 'number') {
        rows.push({ key: 'beitrag', label: 'Beitrag', value: `${formatCurrency(monthly, 0)} / Mon.` })
      }
      addFeeRows(rows, instance)
      break
    }
    case 'altersvorsorgedepot': {
      const monthly = (instance as { monthlyOwnContribution?: number }).monthlyOwnContribution
      if (typeof monthly === 'number') {
        rows.push({ key: 'eigen', label: 'Eigenbeitrag', value: `${formatCurrency(monthly, 0)} / Mon.` })
      }
      const subtype = (instance as { subtype?: string }).subtype
      if (typeof subtype === 'string') {
        rows.push({ key: 'subtype', label: 'Variante', value: subtype })
      }
      addFeeRows(rows, instance)
      break
    }
    case 'riester': {
      const monthly = (instance as { monthlyOwnContribution?: number }).monthlyOwnContribution
      if (typeof monthly === 'number') {
        rows.push({ key: 'eigen', label: 'Eigenbeitrag', value: `${formatCurrency(monthly, 0)} / Mon.` })
      }
      const garantie = (instance as { guaranteedInterestRate?: number }).guaranteedInterestRate
      if (typeof garantie === 'number' && garantie > 0) {
        rows.push({ key: 'garantie', label: 'Garantiezins', value: `${formatPercent(garantie, 2)} p. a.` })
      }
      addFeeRows(rows, instance)
      break
    }
    default: {
      const _exhaustive: never = productId
      void _exhaustive
    }
  }

  if (typeof instance.currentValueEUR === 'number' && instance.currentValueEUR > 0) {
    rows.push({
      key: 'currentValue',
      label: 'Aktueller Wert',
      value: formatCurrency(instance.currentValueEUR, 0),
    })
  }

  return rows
}

/**
 * Add TER + Effektivkosten rows when the product carries the standard
 * `wrapperAssetFee` + `fundAssetFee` fee shape. Centralised so the four
 * fee-bearing slots (bAV / pAV / Basisrente / AVD / Riester) stay
 * consistent.
 */
function addFeeRows(rows: MetadataRow[], instance: InstanceCommon): void {
  const wrapper = (instance as { fees?: { wrapperAssetFee?: number; fundAssetFee?: number; pensionPayoutFeePct?: number } }).fees
  if (!wrapper) return
  if (typeof wrapper.fundAssetFee === 'number') {
    rows.push({ key: 'ter', label: 'TER', value: `${formatPercent(wrapper.fundAssetFee, 2)} p. a.` })
  }
  const wrapperFee = wrapper.wrapperAssetFee ?? 0
  const fundFee = wrapper.fundAssetFee ?? 0
  const totalAccumulation = wrapperFee + fundFee
  if (totalAccumulation > 0) {
    rows.push({
      key: 'effektivkosten',
      label: 'Eff. Kosten',
      value: `${formatPercent(totalAccumulation, 2)} p. a.`,
    })
  }
}

function StatusPill({ status }: { status: InstanceCommon['status'] }) {
  switch (status) {
    case 'active':
      return <span className="vertrag-status-pill vertrag-status-pill--active">aktiv</span>
    case 'paid_up':
      return <span className="vertrag-status-pill vertrag-status-pill--paid-up">beitragsfrei</span>
    case 'surrendered':
      return <span className="vertrag-status-pill vertrag-status-pill--surrendered">gekündigt</span>
    case 'offered':
      return <span className="vertrag-status-pill vertrag-status-pill--offered">Angebot</span>
    default: {
      const _exhaustive: never = status
      void _exhaustive
      return <span className="vertrag-status-pill">unbekannt</span>
    }
  }
}
