import type { BavLumpSumTaxMode, EtfProductResult, GermanRules, InsuranceTaxMode, PersonalProfile, ProductResult, YearlyProjection } from '../domain'
import { afterTaxBavLumpSum } from '../engine/bavPayout'
import { afterTaxCertifiedPensionLumpSum } from '../engine/certifiedPensionPayout'
import { afterTaxInvestmentCapital } from '../engine/etfPayout'
import { afterTaxInsuranceLumpSum } from '../engine/insurancePayout'
import type { CombinedResult } from '../engine/portfolioCombine'
import { formatEvidenceStateForExport } from '../features/results/provenanceHelpers'
import { RULES_YEAR } from '../rules'

type ExportOptions = {
  products: ProductResult[]
  bavAnnualTaxSvSavings: number
  bavProfile: PersonalProfile
  bavKvdrMember: boolean
  bavOtherAnnualIncome: number
  insuranceTaxMode: InsuranceTaxMode
  equityPartialExemption: number
  insuranceOtherAnnualIncome: number
  /** Other annual retirement income used in the §22 Nr. 5 marginal-tax calc for
   *  AVD capital lump-sum rows. Corresponds to
   *  `altersvorsorgedepot.monthlyOtherRetirementIncome * 12`.
   *  Defaults to 0 when omitted. */
  avdOtherAnnualIncome?: number
  /** Other annual retirement income used in the §22 Nr. 5 marginal-tax calc for
   *  Riester capital lump-sum rows. Corresponds to
   *  `riester.monthlyOtherRetirementIncome * 12`.
   *  Defaults to 0 when omitted. */
  riesterOtherAnnualIncome?: number
  rules: GermanRules
  inflationRate?: number
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    // Neutralize formula injection (Excel / LibreOffice)
    if (/^[=+\-@\t\r]/.test(value)) value = "'" + value
    // Quote cells that contain commas, double-quotes, or newlines
    if (/[",\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"'
    return value
  }
  return String(value)
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

// Embedded as the first block of every CSV export per the publication
// guardrails — keeps the disclaimer attached to the data even when the file
// is forwarded without the surrounding UI. Mirrors the PDF report header.
const DISCLAIMER_LINES: readonly string[] = [
  'Modellrechnung — keine Anlage-, Steuer- oder Rechtsberatung.',
  `Diese Berechnung ist eine Modellrechnung mit Stand ${RULES_YEAR} und ersetzt keine individuelle Beratung.`,
  `Steuersätze, Sozialversicherungsbeiträge und Rentenwert sind auf den Stand ${RULES_YEAR} fixiert; tatsächliche Werte zum Renteneintritt können erheblich abweichen.`,
  'Annahmen (Rendite, Inflation, Gehaltsentwicklung, Lebenserwartung, Rentenfaktor, Vertragskosten) sind Schätzungen — kleine Abweichungen können das Ergebnis und die Reihenfolge der Produkte ändern.',
] as const

function addActiveAssumptions(lines: string[], inflationRate: number | undefined): void {
  lines.push('Aktive Annahmen')
  lines.push(csvRow('Inflation p.a. (%)', n((inflationRate ?? 0) * 100)))
  lines.push('')
}

export function buildExportCsv(opts: ExportOptions): string {
  const { products, bavAnnualTaxSvSavings, bavProfile, bavKvdrMember, bavOtherAnnualIncome, insuranceTaxMode, equityPartialExemption, insuranceOtherAnnualIncome, avdOtherAnnualIncome, riesterOtherAnnualIncome, rules } = opts
  const lines: string[] = []

  // Section 0: Disclaimer (first block of every export)
  lines.push('Hinweis')
  for (const text of DISCLAIMER_LINES) {
    lines.push(csvCell(text))
  }
  lines.push('')
  addActiveAssumptions(lines, opts.inflationRate)

  // Section 1: Summary
  lines.push('Detailvergleich')
  lines.push(csvRow('Produkt', 'Szenario', 'Nettoaufwand mtl. (EUR)', 'Beitrag mtl. (EUR)', 'Kapital (EUR)', 'Kapital nach Steuer (EUR)', 'Netto-Rente mtl. (EUR)', 'Kosten gesamt (EUR)', 'Wert-Faktor', 'Datenqualität'))
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
      formatEvidenceStateForExport(r.inputConfidence),
    ))
  }

  // Section 2: Yearly cashflows (all products)
  lines.push('')
  lines.push('Jahres-Cashflows')
  lines.push(csvRow('Produkt', 'Szenario', 'Alter', 'Nettoaufwand p.a. (EUR)', 'Beitrag p.a. (EUR)', 'AG-Anteil p.a. (EUR)', 'Steuer-/SV-Ersparnis p.a. (EUR)', 'Gebühren p.a. (EUR)', 'Kum. Gebühren (EUR)', 'Kapital (EUR)', 'Kapital n. St. (EUR)', 'Reales Kapital (EUR)', 'Real n. St. (EUR)'))
  for (const r of products) {
    const isBav = r.productId === 'bav'
    const isEtf = r.productId === 'etf'
    const isBasisrente = r.productId === 'basisrente'
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
      } else if (isBasisrente) {
        // Capital payout is legally prohibited for Basisrente — export blank.
        afterTax = null
      } else if (r.productId === 'altersvorsorgedepot') {
        // AVD: §22 Nr. 5 EStG certified-pension lump-sum path.
        afterTax = afterTaxCertifiedPensionLumpSum(
          row.balance,
          rules,
          avdOtherAnnualIncome ?? 0,
        )
      } else if (r.productId === 'riester') {
        // Riester: §22 Nr. 5 EStG certified-pension lump-sum path.
        afterTax = afterTaxCertifiedPensionLumpSum(
          row.balance,
          rules,
          riesterOtherAnnualIncome ?? 0,
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

// ---------------------------------------------------------------------------
// Combine-mode CSV builder (Group G issue 11).
//
// Drives "Mein Plan" exports off `simulatePortfolio` + `combinePortfolio`
// output rather than singleton compare-mode data. Disclaimer remains the
// first block per the publication guardrails (CLAUDE.md). Produces five
// sections — at parity with compare-mode `buildExportCsv`:
//   - Section 0: Disclaimer (verbatim shared with the compare-mode export)
//   - Section 1: Combined retirement income (per scenario) — the headline
//     monthly net the dashboard shows
//   - Section 2: Per-instance detail (per instance × scenario × line) —
//     mirror of compare-mode "Detailvergleich" but keyed by `instanceId`
//   - Section 3: Jahres-Cashflows je Instanz — per-instance yearly rows
//     from `r.rows[]`, same column set as compare-mode "Jahres-Cashflows"
//   - Section 4: Rentenphase (ETF-Entnahme) je ETF-Instanz — per ETF
//     instance yearly payout schedule, same columns as compare-mode section
// ---------------------------------------------------------------------------

/** Per-instance tax-mode bundle for combine-mode after-tax column derivation. */
export interface InstanceTaxModes {
  /** bAV lump-sum income-tax routing (derived by `deriveBavLumpSumTaxMode`). */
  bavTaxMode?: BavLumpSumTaxMode
  /** Private-insurance capital-payout tax era (derived by `deriveInsuranceTaxMode`). */
  insuranceTaxMode?: InsuranceTaxMode
  /** ETF equity partial exemption ratio (e.g. 0.3 for equity funds). */
  equityPartialExemption?: number
}

export interface CombinePortfolioCsvOptions {
  /** Per-instance ProductResults keyed by instanceId, all scenarios. */
  perInstance: Record<string, ProductResult[]>
  /** CombinedResult per scenario id. */
  combinedByScenarioId: Record<string, CombinedResult>
  /** Scenario labels keyed by id (for human-readable rows). */
  scenarioLabels: Record<string, string>
  /**
   * Per-instance tax modes for Section 3 after-tax capital columns.
   * When absent (or missing for a given instance), after-tax columns are
   * emitted as blank rather than throwing.
   */
  perInstanceTaxModes?: Record<string, InstanceTaxModes>
  /** Shared rules (default: caller must supply de2026Rules). */
  rules?: GermanRules
  /** Shared personal profile (used by bAV lump-sum KV/PV helper). */
  profile?: PersonalProfile
  /** Active modeled inflation assumption for export disclosure. */
  inflationRate?: number
}

export function buildCombinePortfolioCsv(opts: CombinePortfolioCsvOptions): string {
  const { perInstance, combinedByScenarioId, scenarioLabels, perInstanceTaxModes, rules, profile } = opts
  const lines: string[] = []

  // Section 0: Disclaimer (mirror compare-mode export so legal notice is the
  // first block, identically worded).
  lines.push('Hinweis')
  for (const text of DISCLAIMER_LINES) {
    lines.push(csvCell(text))
  }
  lines.push('')
  addActiveAssumptions(lines, opts.inflationRate)

  // Section 1: Combined retirement income per scenario.
  lines.push('Kombiniertes Renteneinkommen')
  lines.push(csvRow('Szenario', 'Netto-Einkommen mtl. (EUR)', 'Gesetzl. Rente netto mtl. (EUR)'))
  for (const [scenarioId, combined] of Object.entries(combinedByScenarioId)) {
    lines.push(csvRow(
      scenarioLabels[scenarioId] ?? scenarioId,
      n(combined.monthlyNetIncome),
      n(combined.statutoryPensionMonthlyNet),
    ))
  }

  // Section 2: Per-instance detail (one row per instance × scenario).
  lines.push('')
  lines.push('Mein Plan — Detail je Instanz')
  lines.push(csvRow('Instanz', 'Produkt', 'Szenario', 'Nettoaufwand mtl. (EUR)', 'Beitrag mtl. (EUR)', 'Kapital (EUR)', 'Brutto-Rente mtl. (EUR)', 'Netto-Rente mtl. (EUR)', 'Kosten gesamt (EUR)', 'Datenqualität'))
  // Sort by instanceId for stable output.
  const ids = Object.keys(perInstance).sort()
  for (const instanceId of ids) {
    const results = perInstance[instanceId]
    if (!results) continue
    for (const r of results) {
      // Use the back-allocated monthlyNet from the aggregate progressive
      // tax + KV/PV pipeline (byInstance) so this column matches
      // CombineDetailView for multi-product households. Falls back to the
      // per-instance simulator value only when byInstance has no entry.
      const combinedForScenario = combinedByScenarioId[r.scenarioId]
      const netMonthly = combinedForScenario?.byInstance[instanceId]?.monthlyNet ?? r.netMonthlyPayout
      lines.push(csvRow(
        instanceId,
        r.label,
        r.scenarioLabel,
        n(r.monthlyUserCost),
        n(r.monthlyProductContribution),
        n(r.capitalAtRetirement),
        n(r.grossMonthlyPayout),
        n(netMonthly),
        n(r.totalFees),
        formatEvidenceStateForExport(r.inputConfidence),
      ))
    }
  }

  // Section 3: Per-instance yearly cashflows — same columns as compare-mode
  // "Jahres-Cashflows", including per-instance after-tax capital columns when
  // `perInstanceTaxModes` is supplied (otherwise blank, never throws).
  lines.push('')
  lines.push('Jahres-Cashflows je Instanz')
  lines.push(csvRow('Instanz', 'Produkt', 'Szenario', 'Alter', 'Nettoaufwand p.a. (EUR)', 'Beitrag p.a. (EUR)', 'AG-Anteil p.a. (EUR)', 'Gebühren p.a. (EUR)', 'Kum. Gebühren (EUR)', 'Kapital (EUR)', 'Kapital n. St. (EUR)', 'Reales Kapital (EUR)', 'Real n. St. (EUR)'))
  for (const instanceId of ids) {
    const results = perInstance[instanceId]
    if (!results) continue
    const taxModes = perInstanceTaxModes?.[instanceId]
    for (const r of results) {
      const isBav = r.productId === 'bav'
      const isEtf = r.productId === 'etf'
      const isInsurance = r.productId === 'versicherung'
      for (const row of r.rows as YearlyProjection[]) {
        let afterTax: number | null = null
        if (rules && taxModes) {
          if (isBav && profile) {
            afterTax = afterTaxBavLumpSum(
              row.balance,
              profile,
              rules,
              0,
              true,
              rules.year,
              taxModes.bavTaxMode ?? 'voll_versorgungsbezug',
            )
          } else if (isEtf) {
            afterTax = afterTaxInvestmentCapital(
              row.balance,
              row.cumulativeProductContributions,
              rules,
              taxModes.equityPartialExemption ?? 0,
              row.cumulativeVorabpauschale,
            )
          } else if (isInsurance && taxModes.insuranceTaxMode) {
            afterTax = afterTaxInsuranceLumpSum(
              row.balance,
              row.cumulativeProductContributions,
              taxModes.insuranceTaxMode,
              rules,
              0,
            )
          }
        }
        const realAfterTax = afterTax !== null && row.balance > 0
          ? afterTax * (row.realBalance / row.balance)
          : null
        lines.push(csvRow(
          instanceId,
          r.label,
          r.scenarioLabel,
          row.age,
          n(row.yearlyUserCost),
          n(row.yearlyProductContribution),
          n(row.yearlyEmployerContribution),
          n(row.yearlyFees),
          n(row.cumulativeFees),
          n(row.balance),
          nn(afterTax),
          n(row.realBalance),
          nn(realAfterTax),
        ))
      }
    }
  }

  // Section 4: ETF payout schedule per ETF instance — same columns as
  // compare-mode "Rentenphase (ETF-Entnahme)".
  const etfInstanceIds = ids.filter((id) => {
    const results = perInstance[id]
    return results?.some(
      (r): r is EtfProductResult =>
        r.productId === 'etf' &&
        (r as EtfProductResult).etfPayoutRows.length > 0,
    )
  })
  if (etfInstanceIds.length > 0) {
    lines.push('')
    lines.push('Rentenphase (ETF-Entnahme) je ETF-Instanz')
    lines.push(csvRow('Instanz', 'Produkt', 'Szenario', 'Alter', 'Kapital Anfang (EUR)', 'Brutto p.a. (EUR)', 'Steuerpfl. Gewinn (EUR)', 'Sparerpauschb. (EUR)', 'Steuer (EUR)', 'Netto mtl. (EUR)', 'Kapital Ende (EUR)'))
    for (const instanceId of etfInstanceIds) {
      const results = perInstance[instanceId]
      if (!results) continue
      for (const r of results) {
        if (r.productId !== 'etf') continue
        const etfResult = r as EtfProductResult
        if (etfResult.etfPayoutRows.length === 0) continue
        for (const row of etfResult.etfPayoutRows) {
          lines.push(csvRow(
            instanceId,
            r.label,
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
