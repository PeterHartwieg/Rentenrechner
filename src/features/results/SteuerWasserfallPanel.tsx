import './SteuerWasserfallPanel.css'
import { useMemo, useState } from 'react'
import { Landmark } from 'lucide-react'
import type { EtfProductResult, ProductResult } from '../../domain'
import type { GermanRules, PersonalProfile } from '../../domain'
import type { TaxModeContext } from '../../utils/simulationSelectors'
import type { RetirementIncomeComponents } from '../../domain/retirementTax'
import { calculateRetirementTax } from '../../engine/retirementTax'
import { getProductMeta } from '../../engine/productRegistry'
import { formatCurrency } from '../../utils/format'

interface Props {
  selectedResults: ProductResult[]
  profile: PersonalProfile
  rules: GermanRules
  taxModes: TaxModeContext
}

interface WaterfallRow {
  id: string
  label: string
  kind: 'start' | 'deduction' | 'subtotal' | 'total'
  monthly: number
}

// Build waterfall for ETF using the year-indexed payout row.
function buildEtfWaterfall(result: EtfProductResult, rules: GermanRules, yearIndex: number): WaterfallRow[] {
  const rows = result.etfPayoutRows
  const row = rows[yearIndex] ?? rows[0]
  if (!row) return []

  const sol = rules.capitalGains.solidarityRate
  // taxDue = abg + soli = abg * (1 + sol) → abg = taxDue / (1 + sol)
  const abgMonthly = row.taxDue / (1 + sol) / 12
  const soliMonthly = row.taxDue * sol / (1 + sol) / 12
  const steuerfreiMonthly = (row.grossAnnualPayout - row.taxableGain) / 12
  const allowanceMonthly = row.saverAllowanceUsed / 12

  const out: WaterfallRow[] = [
    { id: 'brutto', label: 'Brutto-Auszahlung', kind: 'start', monthly: row.grossAnnualPayout / 12 },
  ]
  if (steuerfreiMonthly > 0.5) {
    out.push({ id: 'kostenbasis', label: '− Kostenanteil (Basis)', kind: 'deduction', monthly: steuerfreiMonthly })
  }
  if (allowanceMonthly > 0.5) {
    out.push({ id: 'sparerpauschbetrag', label: '− Sparerpauschbetrag', kind: 'deduction', monthly: allowanceMonthly })
  }
  const taxableMonthly = Math.max(0, row.taxableGain - row.saverAllowanceUsed) / 12
  out.push({ id: 'taxable', label: '= Steuerpflichtiger Anteil', kind: 'subtotal', monthly: taxableMonthly })
  if (abgMonthly > 0.5) {
    out.push({ id: 'abgeltungsteuer', label: '− Abgeltungsteuer (25 %)', kind: 'deduction', monthly: abgMonthly })
  }
  if (soliMonthly > 0.5) {
    out.push({ id: 'soli', label: '− Solidaritätszuschlag', kind: 'deduction', monthly: soliMonthly })
  }
  out.push({ id: 'netto', label: '= Netto-Auszahlung', kind: 'total', monthly: row.netMonthlyPayout })
  return out
}

// Build waterfall for products taxed via personal income tax (bAV, Basisrente, Versicherung, AVD, Riester).
function buildPersonalTaxWaterfall(
  result: ProductResult,
  rules: GermanRules,
  retirementYear: number,
  insuranceTaxMode: TaxModeContext['insuranceTaxMode'],
): WaterfallRow[] {
  const grossMonthly = result.grossMonthlyPayout
  const netMonthly = result.netMonthlyPayout
  const grossAnnual = grossMonthly * 12

  let components: RetirementIncomeComponents
  switch (result.productId) {
    case 'bav':
      components = {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: grossAnnual,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear,
      }
      break
    case 'basisrente':
      components = {
        statutoryPensionAnnual: grossAnnual,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear,
      }
      break
    case 'versicherung':
      components = {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: grossAnnual,
        privateInsuranceTaxMode: insuranceTaxMode,
        otherTaxableAnnual: 0,
        retirementYear,
      }
      break
    default:
      // altersvorsorgedepot, riester → §22 Nr. 5 EStG
      components = {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: grossAnnual,
        retirementYear,
      }
  }

  const bd = calculateRetirementTax(components, rules)

  // KV/PV is derived as the residual so the waterfall reconciles to the actual net payout.
  // The standalone tax from calculateRetirementTax may differ from the simulator's marginal tax
  // (which stacks other income), so the KV/PV residual absorbs that difference.
  const incomeTaxMonthly = bd.totalTaxAnnual / 12
  const kvPvMonthly = Math.max(0, grossMonthly - netMonthly - incomeTaxMonthly)

  const out: WaterfallRow[] = [
    { id: 'brutto', label: 'Brutto-Auszahlung', kind: 'start', monthly: grossMonthly },
  ]

  // Stage: Versorgungsfreibetrag — bAV only (§19 Abs. 2 EStG)
  if (result.productId === 'bav') {
    const vfbMonthly = (grossAnnual - bd.bavPensionTaxable) / 12
    if (vfbMonthly > 0.5) {
      out.push({ id: 'vfb', label: '− Versorgungsfreibetrag', kind: 'deduction', monthly: vfbMonthly })
    }
  }

  // Stage: Rentenfreistellung — Basisrente (§22 Nr. 1 EStG, Besteuerungsanteil)
  if (result.productId === 'basisrente') {
    const freibetragMonthly = (grossAnnual - bd.statutoryPensionTaxable) / 12
    if (freibetragMonthly > 0.5) {
      out.push({ id: 'rentenfreistellung', label: '− Rentenfreistellung (Besteuerungsanteil)', kind: 'deduction', monthly: freibetragMonthly })
    }
  }

  // Stage: Werbungskosten-Pauschbetrag (§9a EStG)
  const wkMonthly = (bd.werbungskostenVersorgung + bd.werbungskostenRenten) / 12
  if (wkMonthly > 0.5) {
    out.push({ id: 'werbungskosten', label: '− Werbungskosten-Pauschbetrag', kind: 'deduction', monthly: wkMonthly })
  }

  // Stage: Sonderausgaben-Pauschbetrag (§10c EStG)
  const saMonthly = bd.sonderausgaben / 12
  if (saMonthly > 0.5) {
    out.push({ id: 'sonderausgaben', label: '− Sonderausgaben-Pauschbetrag', kind: 'deduction', monthly: saMonthly })
  }

  // Subtotal: zu versteuerndes Einkommen
  out.push({ id: 'zve', label: '= zu versteuerndes Einkommen', kind: 'subtotal', monthly: bd.zuVersteuerndesEinkommen / 12 })

  // Stage: Einkommensteuer / Abgeltungsteuer on private insurance
  const estMonthly = bd.einkommensteuer / 12
  if (estMonthly > 0.5) {
    out.push({ id: 'est', label: '− Einkommensteuer', kind: 'deduction', monthly: estMonthly })
  }
  const soliMonthly = bd.solidaritaetszuschlag / 12
  if (soliMonthly > 0.5) {
    out.push({ id: 'soli', label: '− Solidaritätszuschlag', kind: 'deduction', monthly: soliMonthly })
  }
  const abgMonthly = bd.abgeltungsteuerOnPrivateInsurance / 12
  if (abgMonthly > 0.5) {
    out.push({ id: 'abgeltung', label: '− Abgeltungsteuer (25 %)', kind: 'deduction', monthly: abgMonthly })
  }

  // Stage: KV/PV (derived)
  if (kvPvMonthly > 0.5) {
    out.push({ id: 'kvpv', label: '− KV/PV', kind: 'deduction', monthly: kvPvMonthly })
  }

  out.push({ id: 'netto', label: '= Netto-Auszahlung', kind: 'total', monthly: netMonthly })
  return out
}

export function SteuerWasserfallPanel({ selectedResults, profile, rules, taxModes }: Props) {
  const [selectedProductId, setSelectedProductId] = useState(
    () => selectedResults[0]?.productId ?? '',
  )
  const [selectedYear, setSelectedYear] = useState(1)

  const result = selectedResults.find((r) => r.productId === selectedProductId) ?? selectedResults[0]

  const retirementYear = rules.year + (profile.retirementAge - profile.age)

  const waterfallRows = useMemo(() => {
    if (!result) return []
    if (result.productId === 'etf') {
      return buildEtfWaterfall(result as EtfProductResult, rules, selectedYear - 1)
    }
    return buildPersonalTaxWaterfall(result, rules, retirementYear, taxModes.insuranceTaxMode)
  }, [result, rules, retirementYear, taxModes.insuranceTaxMode, selectedYear])

  if (!result || waterfallRows.length === 0) return null

  const meta = getProductMeta(result.productId)
  const productColor = meta?.color ?? 'var(--color-muted)'

  const maxMonthly = waterfallRows.find((r) => r.id === 'brutto')?.monthly ?? 1

  return (
    <section className="chart-panel steuer-wasserfall-panel">
      <div className="section-heading">
        <Landmark size={18} aria-hidden="true" />
        <div>
          <h2>Steuer-Wasserfall</h2>
          <p>Vom Bruttobetrag zur Netto-Auszahlung — Schritt für Schritt</p>
        </div>
      </div>

      <div className="swf-controls">
        <label className="swf-label" htmlFor="swf-product-select">
          Produkt
          <select
            id="swf-product-select"
            className="swf-select"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value as typeof selectedProductId)}
          >
            {selectedResults.map((r) => (
              <option key={r.productId} value={r.productId}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        {result.productId === 'etf' && (
          <label className="swf-label" htmlFor="swf-year-select">
            Rentenjahr
            <select
              id="swf-year-select"
              className="swf-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {Array.from(
                { length: (result as EtfProductResult).etfPayoutRows.length },
                (_, i) => i + 1,
              ).map((yr) => (
                <option key={yr} value={yr}>
                  Jahr {yr}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="swf-waterfall" style={{ '--swf-product-color': productColor } as React.CSSProperties}>
        {waterfallRows.map((row) => {
          const barWidth = maxMonthly > 0 ? Math.max(0, row.monthly / maxMonthly) : 0
          return (
            <div key={row.id} className={`swf-row swf-row--${row.kind}`}>
              <span className="swf-row-label">{row.label}</span>
              <span className="swf-row-bar-wrap">
                <span
                  className="swf-row-bar"
                  style={{ width: `${(barWidth * 100).toFixed(1)}%` }}
                  aria-hidden="true"
                />
              </span>
              <span className="swf-row-value">
                {formatCurrency(row.monthly, 0)}
                <span className="swf-row-unit">/Mo.</span>
              </span>
            </div>
          )
        })}
      </div>

      <p className="swf-note">
        Berechnung für das Produkt in Isolation (ohne GRV-Stapelung).
        Alle Angaben mtl. auf Basis des{' '}
        {result.productId === 'etf' ? `${selectedYear}. Rentenjahres` : '1. Rentenjahres'}.
        Keine Steuer-, Rechts- oder Anlageberatung.
      </p>
    </section>
  )
}
