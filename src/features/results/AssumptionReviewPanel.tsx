import './AssumptionReviewPanel.css'
import { useState } from 'react'
import type { PersonalProfile, ProductId, ScenarioAssumptions } from '../../domain'
import { defaultAssumptions } from '../../data/defaultScenario'
import { formatCurrency, formatPercent } from '../../utils/format'

const PRODUCT_NAMES: Partial<Record<ProductId, string>> = {
  etf: 'ETF-Depot',
  bav: 'Betriebliche Altersvorsorge (bAV)',
  versicherung: 'Private Rentenversicherung',
  basisrente: 'Basisrente (Rürup)',
  altersvorsorgedepot: 'Altersvorsorgedepot',
  riester: 'Riester',
}

type RowKind = 'user' | 'default' | 'model' | 'confirmed'

interface ReviewRow {
  label: string
  value: string
  kind: RowKind
  hint?: string
}

function diff(a: number, b: number): boolean {
  return Math.abs(a - b) > 1e-9
}

function ProvBadge({ kind }: { kind: RowKind }) {
  const label =
    kind === 'user'
      ? 'von dir'
      : kind === 'confirmed'
        ? 'geprüft'
        : kind === 'model'
          ? 'Modellwert'
          : 'Standardwert'
  return <span className={`arp-badge arp-badge--${kind}`}>{label}</span>
}

function rentenfaktorKind(value: number, def: number, confirmed: boolean): RowKind {
  if (diff(value, def)) return 'user'
  return confirmed ? 'confirmed' : 'model'
}

function buildProductRows(productId: ProductId, assumptions: ScenarioAssumptions): ReviewRow[] {
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
      const rows: ReviewRow[] = [
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
        const kind = rentenfaktorKind(b.rentenfaktor, d.rentenfaktor, b.rentenfaktorConfirmed)
        rows.push({
          label: 'Rentenfaktor',
          value: `${b.rentenfaktor} €/10k`,
          kind,
          hint: kind === 'model' ? 'Marktdurchschnitt – aus Angebot übernehmen' : undefined,
        })
      }
      return rows
    }

    case 'versicherung': {
      const ins = assumptions.insurance
      const d = def.insurance
      const totalFee = ins.fees.wrapperAssetFee + ins.fees.fundAssetFee
      const defTotalFee = d.fees.wrapperAssetFee + d.fees.fundAssetFee
      const rows: ReviewRow[] = [
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
        const kind = rentenfaktorKind(ins.rentenfaktor, d.rentenfaktor, ins.rentenfaktorConfirmed)
        rows.push({
          label: 'Rentenfaktor',
          value: `${ins.rentenfaktor} €/10k`,
          kind,
          hint: kind === 'model' ? 'Marktdurchschnitt – aus Angebot übernehmen' : undefined,
        })
      }
      return rows
    }

    case 'basisrente': {
      const br = assumptions.basisrente
      const d = def.basisrente
      const totalFee = br.fees.wrapperAssetFee + br.fees.fundAssetFee
      const defTotalFee = d.fees.wrapperAssetFee + d.fees.fundAssetFee
      const brKind = rentenfaktorKind(br.rentenfaktor, d.rentenfaktor, br.rentenfaktorConfirmed)
      return [
        {
          label: 'Monatsbeitrag',
          value: formatCurrency(br.monthlyGrossContribution, 0) + ' /Monat',
          kind: diff(br.monthlyGrossContribution, d.monthlyGrossContribution) ? 'user' : 'default',
        },
        {
          label: 'Rentenfaktor',
          value: `${br.rentenfaktor} €/10k`,
          kind: brKind,
          hint: brKind === 'model' ? 'Marktdurchschnitt – aus Angebot übernehmen' : undefined,
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
      const rows: ReviewRow[] = [
        {
          label: 'Eigenbeitrag',
          value: formatCurrency(r.monthlyOwnContribution, 0) + ' /Monat',
          kind: diff(r.monthlyOwnContribution, d.monthlyOwnContribution) ? 'user' : 'default',
        },
      ]
      if (r.payoutMode === 'leibrente') {
        const kind = rentenfaktorKind(r.rentenfaktor, d.rentenfaktor, r.rentenfaktorConfirmed)
        rows.push({
          label: 'Rentenfaktor',
          value: `${r.rentenfaktor} €/10k`,
          kind,
          hint: kind === 'model' ? 'Marktdurchschnitt – aus Angebot übernehmen' : undefined,
        })
      }
      return rows
    }

    default:
      return []
  }
}

interface Props {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  visibleProducts: ProductId[]
}

export function AssumptionReviewPanel({ profile, assumptions, visibleProducts }: Props) {
  const [open, setOpen] = useState(false)

  const allProductRows = visibleProducts.flatMap((id) => buildProductRows(id, assumptions))
  const modelCount = allProductRows.filter((r) => r.kind === 'model').length
  const userCount = allProductRows.filter((r) => r.kind === 'user').length
  const healthLabel = profile.publicHealthInsurance ? 'Gesetzlich (GKV)' : 'Privat (PKV)'

  return (
    <section className="arp-section">
      <button
        type="button"
        className="arp-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="arp-toggle-title">Was habe ich eingegeben?</span>
        <span className="arp-toggle-counts">
          {userCount > 0 && (
            <span className="arp-count arp-count--user">{userCount} von dir</span>
          )}
          {modelCount > 0 && (
            <span className="arp-count arp-count--model">
              {modelCount} Schätzwert{modelCount > 1 ? 'e' : ''}
            </span>
          )}
        </span>
        <span className="arp-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="arp-content">
          <div className="arp-group">
            <h4 className="arp-group-title">Profil</h4>
            <table className="arp-table">
              <tbody>
                <tr>
                  <td>Alter</td>
                  <td className="arp-val">{profile.age} Jahre</td>
                  <td><span className="arp-badge arp-badge--user">von dir</span></td>
                </tr>
                <tr>
                  <td>Renteneintritt</td>
                  <td className="arp-val">{profile.retirementAge} Jahre</td>
                  <td><span className="arp-badge arp-badge--user">von dir</span></td>
                </tr>
                <tr>
                  <td>Bruttogehalt</td>
                  <td className="arp-val">{formatCurrency(profile.grossSalaryYear, 0)} /Jahr</td>
                  <td><span className="arp-badge arp-badge--user">von dir</span></td>
                </tr>
                <tr>
                  <td>Krankenversicherung</td>
                  <td className="arp-val">{healthLabel}</td>
                  <td><span className="arp-badge arp-badge--user">von dir</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          {visibleProducts.map((productId) => {
            const rows = buildProductRows(productId, assumptions)
            if (rows.length === 0) return null
            const name = PRODUCT_NAMES[productId] ?? productId
            return (
              <div key={productId} className="arp-group">
                <h4 className="arp-group-title">{name}</h4>
                <table className="arp-table">
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={`arp-row--${row.kind}`}>
                        <td>
                          {row.label}
                          {row.hint && (
                            <span className="arp-row-hint"> — {row.hint}</span>
                          )}
                        </td>
                        <td className="arp-val">{row.value}</td>
                        <td><ProvBadge kind={row.kind} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}

          {modelCount > 0 && (
            <p className="arp-model-notice">
              <strong>{modelCount} Schätzwert{modelCount > 1 ? 'e' : ''}</strong>: Diese Werte
              basieren auf Marktdurchschnitten und beeinflussen die Rentenhöhe stark. Trage die
              Werte aus deinem Angebot ein, um ein genaues Ergebnis zu erhalten.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
