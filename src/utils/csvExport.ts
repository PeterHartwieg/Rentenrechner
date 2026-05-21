import type { GermanRules, InsuranceTaxMode, PersonalProfile, ProductResult } from '../domain'
import {
  buildCombineExportProjection,
  buildCompareExportProjection,
  type InstanceTaxModes,
} from '../engine/exportProjection'
import type { CombinedResult } from '../engine/portfolioCombine'
import { formatEvidenceStateForExport } from '../features/results/provenanceHelpers'

// Re-export so existing call-sites (`useDerivedViews.ts`, `combineCsvWiring.ts`)
// keep working without a sweeping import-path change. Canonical home is
// `src/engine/exportProjection.ts`.
export type { InstanceTaxModes } from '../engine/exportProjection'

interface ExportOptions {
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
  'Diese Berechnung ist eine Modellrechnung mit Stand 2026 und ersetzt keine individuelle Beratung.',
  'Steuersätze, Sozialversicherungsbeiträge und Rentenwert sind auf den Stand 2026 fixiert; tatsächliche Werte zum Renteneintritt können erheblich abweichen.',
  'Annahmen (Rendite, Inflation, Gehaltsentwicklung, Lebenserwartung, Rentenfaktor, Vertragskosten) sind Schätzungen — kleine Abweichungen können das Ergebnis und die Reihenfolge der Produkte ändern.',
] as const

function addActiveAssumptions(lines: string[], inflationRate: number | undefined): void {
  lines.push('Aktive Annahmen')
  lines.push(csvRow('Inflation p.a. (%)', n((inflationRate ?? 0) * 100)))
  lines.push('')
}

export function buildExportCsv(opts: ExportOptions): string {
  const lines: string[] = []

  // Section 0: Disclaimer (first block of every export)
  lines.push('Hinweis')
  for (const text of DISCLAIMER_LINES) {
    lines.push(csvCell(text))
  }
  lines.push('')
  addActiveAssumptions(lines, opts.inflationRate)

  const projection = buildCompareExportProjection({
    products: opts.products,
    bavAnnualTaxSvSavings: opts.bavAnnualTaxSvSavings,
    bavProfile: opts.bavProfile,
    bavKvdrMember: opts.bavKvdrMember,
    bavOtherAnnualIncome: opts.bavOtherAnnualIncome,
    insuranceTaxMode: opts.insuranceTaxMode,
    equityPartialExemption: opts.equityPartialExemption,
    insuranceOtherAnnualIncome: opts.insuranceOtherAnnualIncome,
    avdOtherAnnualIncome: opts.avdOtherAnnualIncome,
    riesterOtherAnnualIncome: opts.riesterOtherAnnualIncome,
    rules: opts.rules,
  })

  // Section 1: Summary
  lines.push('Detailvergleich')
  lines.push(csvRow('Produkt', 'Szenario', 'Nettoaufwand mtl. (EUR)', 'Beitrag mtl. (EUR)', 'Kapital (EUR)', 'Kapital nach Steuer (EUR)', 'Netto-Rente mtl. (EUR)', 'Kosten gesamt (EUR)', 'Wert-Faktor', 'Datenqualität'))
  for (const row of projection.summary) {
    lines.push(csvRow(
      row.label,
      row.scenarioLabel,
      n(row.monthlyUserCost),
      n(row.monthlyProductContribution),
      n(row.capitalAtRetirement),
      nn(row.afterTaxLumpSum),
      n(row.netMonthlyPayout),
      n(row.totalFees),
      row.valueMultipleOnUserCost === null ? '' : row.valueMultipleOnUserCost.toFixed(2),
      formatEvidenceStateForExport(row.inputConfidence),
    ))
  }

  // Section 2: Yearly cashflows (all products)
  lines.push('')
  lines.push('Jahres-Cashflows')
  lines.push(csvRow('Produkt', 'Szenario', 'Alter', 'Nettoaufwand p.a. (EUR)', 'Beitrag p.a. (EUR)', 'AG-Anteil p.a. (EUR)', 'Steuer-/SV-Ersparnis p.a. (EUR)', 'Gebühren p.a. (EUR)', 'Kum. Gebühren (EUR)', 'Kapital (EUR)', 'Kapital n. St. (EUR)', 'Reales Kapital (EUR)', 'Real n. St. (EUR)'))
  for (const row of projection.yearly) {
    lines.push(csvRow(
      row.label,
      row.scenarioLabel,
      row.age,
      n(row.yearlyUserCost),
      n(row.yearlyProductContribution),
      n(row.yearlyEmployerContribution),
      row.annualTaxSvSavings !== null && row.annualTaxSvSavings > 0 ? n(row.annualTaxSvSavings) : '',
      n(row.yearlyFees),
      n(row.cumulativeFees),
      n(row.balance),
      nn(row.afterTaxBalance),
      n(row.realBalance),
      nn(row.realAfterTaxBalance),
    ))
  }

  // Section 3: ETF payout schedule
  if (projection.etfPayouts.length > 0) {
    lines.push('')
    lines.push('Rentenphase (ETF-Entnahme)')
    lines.push(csvRow('Szenario', 'Alter', 'Kapital Anfang (EUR)', 'Brutto p.a. (EUR)', 'Steuerpfl. Gewinn (EUR)', 'Sparerpauschb. (EUR)', 'Steuer (EUR)', 'Netto mtl. (EUR)', 'Kapital Ende (EUR)'))
    for (const row of projection.etfPayouts) {
      lines.push(csvRow(
        row.scenarioLabel,
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
  const { combinedByScenarioId, scenarioLabels } = opts
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

  const projection = buildCombineExportProjection({
    perInstance: opts.perInstance,
    combinedByScenarioId: opts.combinedByScenarioId,
    scenarioLabels: opts.scenarioLabels,
    perInstanceTaxModes: opts.perInstanceTaxModes,
    rules: opts.rules,
    profile: opts.profile,
  })

  // Section 2: Per-instance detail (one row per instance × scenario).
  lines.push('')
  lines.push('Mein Plan — Detail je Instanz')
  lines.push(csvRow('Instanz', 'Produkt', 'Szenario', 'Nettoaufwand mtl. (EUR)', 'Beitrag mtl. (EUR)', 'Kapital (EUR)', 'Brutto-Rente mtl. (EUR)', 'Netto-Rente mtl. (EUR)', 'Kosten gesamt (EUR)', 'Datenqualität'))
  for (const row of projection.summary) {
    lines.push(csvRow(
      row.instanceId,
      row.label,
      row.scenarioLabel,
      n(row.monthlyUserCost),
      n(row.monthlyProductContribution),
      n(row.capitalAtRetirement),
      n(row.grossMonthlyPayout),
      n(row.netMonthlyPayout),
      n(row.totalFees),
      formatEvidenceStateForExport(row.inputConfidence),
    ))
  }

  // Section 3: Per-instance yearly cashflows — same columns as compare-mode
  // "Jahres-Cashflows", including per-instance after-tax capital columns when
  // `perInstanceTaxModes` is supplied (otherwise blank, never throws).
  lines.push('')
  lines.push('Jahres-Cashflows je Instanz')
  lines.push(csvRow('Instanz', 'Produkt', 'Szenario', 'Alter', 'Nettoaufwand p.a. (EUR)', 'Beitrag p.a. (EUR)', 'AG-Anteil p.a. (EUR)', 'Gebühren p.a. (EUR)', 'Kum. Gebühren (EUR)', 'Kapital (EUR)', 'Kapital n. St. (EUR)', 'Reales Kapital (EUR)', 'Real n. St. (EUR)'))
  for (const row of projection.yearly) {
    lines.push(csvRow(
      row.instanceId,
      row.label,
      row.scenarioLabel,
      row.age,
      n(row.yearlyUserCost),
      n(row.yearlyProductContribution),
      n(row.yearlyEmployerContribution),
      n(row.yearlyFees),
      n(row.cumulativeFees),
      n(row.balance),
      nn(row.afterTaxBalance),
      n(row.realBalance),
      nn(row.realAfterTaxBalance),
    ))
  }

  // Section 4: ETF payout schedule per ETF instance — same columns as
  // compare-mode "Rentenphase (ETF-Entnahme)".
  if (projection.etfPayouts.length > 0) {
    lines.push('')
    lines.push('Rentenphase (ETF-Entnahme) je ETF-Instanz')
    lines.push(csvRow('Instanz', 'Produkt', 'Szenario', 'Alter', 'Kapital Anfang (EUR)', 'Brutto p.a. (EUR)', 'Steuerpfl. Gewinn (EUR)', 'Sparerpauschb. (EUR)', 'Steuer (EUR)', 'Netto mtl. (EUR)', 'Kapital Ende (EUR)'))
    for (const row of projection.etfPayouts) {
      lines.push(csvRow(
        row.instanceId,
        row.label,
        row.scenarioLabel,
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
