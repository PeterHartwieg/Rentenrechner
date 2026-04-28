import type { EtfProductResult, GermanRules, InsuranceTaxMode, PersonalProfile, ProductResult } from '../domain'
import { afterTaxBavLumpSum, afterTaxInsuranceLumpSum, afterTaxInvestmentCapital } from '../engine/projections'

type ExportOptions = {
  products: ProductResult[]
  bavAnnualTaxSvSavings: number
  bavProfile: PersonalProfile
  bavKvdrMember: boolean
  bavOtherAnnualIncome: number
  insuranceTaxMode: InsuranceTaxMode
  equityPartialExemption: number
  insuranceOtherAnnualIncome: number
  rules: GermanRules
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function csvRow(...cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}

function n(v: number): string {
  return v.toFixed(2)
}

function nn(v: number | null): string {
  return v === null ? '' : v.toFixed(2)
}

export function buildExportCsv(opts: ExportOptions): string {
  const { products, bavAnnualTaxSvSavings, bavProfile, bavKvdrMember, bavOtherAnnualIncome, insuranceTaxMode, equityPartialExemption, insuranceOtherAnnualIncome, rules } = opts
  const lines: string[] = []

  // Section 1: Summary
  lines.push('Detailvergleich')
  lines.push(csvRow('Produkt', 'Szenario', 'Nettoaufwand mtl. (EUR)', 'Beitrag mtl. (EUR)', 'Kapital (EUR)', 'Kapital nach Steuer (EUR)', 'Netto-Rente mtl. (EUR)', 'Kosten gesamt (EUR)', 'Wert-Faktor'))
  for (const r of products) {
    lines.push(csvRow(
      r.label,
      r.scenarioLabel,
      n(r.monthlyUserCost),
      n(r.monthlyProductContribution),
      n(r.capitalAtRetirement),
      nn(r.afterTaxLumpSum),
      n(r.netMonthlyPayout),
      n(r.totalFees),
      r.valueMultipleOnUserCost === null ? '' : r.valueMultipleOnUserCost.toFixed(2),
    ))
  }

  // Section 2: Yearly cashflows (all products)
  lines.push('')
  lines.push('Jahres-Cashflows')
  lines.push(csvRow('Produkt', 'Szenario', 'Alter', 'Nettoaufwand p.a. (EUR)', 'Beitrag p.a. (EUR)', 'AG-Anteil p.a. (EUR)', 'Steuer-/SV-Ersparnis p.a. (EUR)', 'Gebühren p.a. (EUR)', 'Kum. Gebühren (EUR)', 'Kapital (EUR)', 'Kapital n. St. (EUR)', 'Reales Kapital (EUR)', 'Real n. St. (EUR)'))
  for (const r of products) {
    const isBav = r.productId === 'bav'
    const isEtf = r.productId === 'etf'
    const annualSavings = isBav ? bavAnnualTaxSvSavings : 0
    for (const row of r.rows) {
      let afterTax: number | null
      if (isBav) {
        afterTax = afterTaxBavLumpSum(
          row.balance,
          bavProfile,
          rules,
          bavOtherAnnualIncome,
          bavKvdrMember,
        )
      } else if (isEtf) {
        afterTax = afterTaxInvestmentCapital(
          row.balance,
          row.cumulativeProductContributions,
          rules,
          equityPartialExemption,
          row.cumulativeVorabpauschale,
        )
      } else {
        afterTax = afterTaxInsuranceLumpSum(
          row.balance,
          row.cumulativeProductContributions,
          insuranceTaxMode,
          rules,
          insuranceOtherAnnualIncome,
        )
      }
      const realAfterTax = afterTax !== null && row.balance > 0
        ? afterTax * (row.realBalance / row.balance)
        : null
      lines.push(csvRow(
        r.label,
        r.scenarioLabel,
        row.age,
        n(row.yearlyUserCost),
        n(row.yearlyProductContribution),
        n(row.yearlyEmployerContribution),
        annualSavings > 0 ? n(annualSavings) : '',
        n(row.yearlyFees),
        n(row.cumulativeFees),
        n(row.balance),
        nn(afterTax),
        n(row.realBalance),
        nn(realAfterTax),
      ))
    }
  }

  // Section 3: ETF payout schedule
  const etfWithPayouts = products.filter((r): r is EtfProductResult => r.productId === 'etf' && r.etfPayoutRows.length > 0)
  if (etfWithPayouts.length > 0) {
    lines.push('')
    lines.push('Rentenphase (ETF-Entnahme)')
    lines.push(csvRow('Szenario', 'Alter', 'Kapital Anfang (EUR)', 'Brutto p.a. (EUR)', 'Steuerpfl. Gewinn (EUR)', 'Sparerpauschb. (EUR)', 'Steuer (EUR)', 'Netto mtl. (EUR)', 'Kapital Ende (EUR)'))
    for (const r of etfWithPayouts) {
      for (const row of r.etfPayoutRows) {
        lines.push(csvRow(
          r.scenarioLabel,
          row.age,
          n(row.capitalAtStart),
          n(row.grossAnnualPayout),
          n(row.taxableGain),
          n(row.saverAllowanceUsed),
          n(row.taxDue),
          n(row.netMonthlyPayout),
          n(row.capitalAtEnd),
        ))
      }
    }
  }

  return lines.join('\n')
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
