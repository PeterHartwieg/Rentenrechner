/**
 * What changed in the plan since an alternative was saved.
 *
 * A saved alternative freezes the baseline it was forked from
 * (`derivedFromBaselineSnapshot`). When the live baseline moves on, the list
 * of saved alternatives puts figures side by side that were computed on
 * different salaries, inflation rates or contracts (audit F10). This module
 * turns the snapshot ↔ baseline difference into a few plain-German lines so
 * the user sees *why* an older alternative reads differently, before deciding
 * to recompute it or keep the saved figures.
 *
 * Pure, React-free. Reads only the fields that visibly drive the household
 * total; any other difference collapses into one "weitere Angaben" line via
 * `scenarioDiff`, so nothing is hidden and nothing is invented.
 */

import type { Scenario } from '../../domain/workspace'
import { scenarioDiff } from '../../app/scenarioDiff'
import { CONTRIBUTION_LABEL_BY_PRODUCT } from '../../app/planSummary'
import {
  CONTRIBUTION_FIELD_BY_PRODUCT,
  isCountedInstance,
  listWorkspaceInstances,
  type AnyWorkspaceInstance,
} from '../../app/resultReadiness'
import { getProductMeta } from '../../engine/productManifest'
import type { ProductId } from '../../engine/productRegistry'
import { formatCurrency, formatPercent } from '../../utils/format'

function arrow(before: string, after: string): string {
  return `${before} → ${after}`
}

function instanceLabel(productId: ProductId, instance: AnyWorkspaceInstance): string {
  const label = instance.label?.trim()
  return label && label.length > 0 ? label : (getProductMeta(productId)?.label ?? productId)
}

function contributionOf(productId: ProductId, instance: AnyWorkspaceInstance): number | null {
  const value = (instance as unknown as Record<string, unknown>)[CONTRIBUTION_FIELD_BY_PRODUCT[productId]]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Plain-German lines describing how `current` differs from `snapshot`.
 * Empty when nothing differs. Order: person, assumptions, contracts, rest.
 */
export function describeBaselineDrift(snapshot: Scenario, current: Scenario): string[] {
  const lines: string[] = []
  const a = snapshot.profile
  const b = current.profile

  if (a.age !== b.age) lines.push(`Alter: ${arrow(`${a.age}`, `${b.age}`)}`)
  if (a.grossSalaryYear !== b.grossSalaryYear) {
    lines.push(`Jahreseinkommen: ${arrow(formatCurrency(a.grossSalaryYear), formatCurrency(b.grossSalaryYear))}`)
  }
  if (a.retirementAge !== b.retirementAge) lines.push(`Renteneintritt: ${arrow(`${a.retirementAge}`, `${b.retirementAge}`)}`)
  if ((a.desiredNetMonthlyPension ?? null) !== (b.desiredNetMonthlyPension ?? null)) {
    const fmt = (v: number | undefined) => (v === undefined ? 'keine' : formatCurrency(v))
    lines.push(`Wunschrente: ${arrow(fmt(a.desiredNetMonthlyPension), fmt(b.desiredNetMonthlyPension))}`)
  }
  if (a.publicHealthInsurance !== b.publicHealthInsurance) {
    const fmt = (v: boolean) => (v ? 'gesetzlich' : 'privat')
    lines.push(`Krankenversicherung: ${arrow(fmt(a.publicHealthInsurance), fmt(b.publicHealthInsurance))}`)
  }

  const wa = snapshot.assumptions
  const wb = current.assumptions
  if (wa.inflationRate !== wb.inflationRate) {
    lines.push(`Inflation: ${arrow(formatPercent(wa.inflationRate, 1), formatPercent(wb.inflationRate, 1))}`)
  }
  if (wa.retirementEndAge !== wb.retirementEndAge) {
    lines.push(`Entnahme bis Alter: ${arrow(`${wa.retirementEndAge}`, `${wb.retirementEndAge}`)}`)
  }
  const basisA = wa.returnScenarios.find((s) => s.id === 'basis')?.annualReturn
  const basisB = wb.returnScenarios.find((s) => s.id === 'basis')?.annualReturn
  if (basisA !== undefined && basisB !== undefined && basisA !== basisB) {
    lines.push(`Rendite (Basis): ${arrow(formatPercent(basisA, 1), formatPercent(basisB, 1))}`)
  }
  const spA = wa.statutoryPension
  const spB = wb.statutoryPension
  if (
    spA.currentEntgeltpunkte !== spB.currentEntgeltpunkte
    || spA.manualMonthlyGross !== spB.manualMonthlyGross
    || spA.pensionBaselineType !== spB.pensionBaselineType
  ) {
    lines.push('Rentenangabe geändert')
  }

  // Contracts: added, removed, and changed contributions, matched by id.
  const before = new Map(
    listWorkspaceInstances(wa).filter(({ instance }) => isCountedInstance(instance))
      .map((entry) => [entry.instance.instanceId, entry] as const),
  )
  const after = new Map(
    listWorkspaceInstances(wb).filter(({ instance }) => isCountedInstance(instance))
      .map((entry) => [entry.instance.instanceId, entry] as const),
  )
  for (const [id, entry] of after) {
    const prior = before.get(id)
    if (!prior) {
      lines.push(`Neu im Plan: ${instanceLabel(entry.productId, entry.instance)}`)
      continue
    }
    const c0 = contributionOf(prior.productId, prior.instance)
    const c1 = contributionOf(entry.productId, entry.instance)
    if (c0 !== c1 && (c0 !== null || c1 !== null)) {
      const fmt = (v: number | null) => (v === null ? 'unbekannt' : `${formatCurrency(v)} / Monat`)
      lines.push(`${instanceLabel(entry.productId, entry.instance)} · ${CONTRIBUTION_LABEL_BY_PRODUCT[entry.productId]}: ${arrow(fmt(c0), fmt(c1))}`)
    }
    if (prior.instance.status !== entry.instance.status) {
      lines.push(`${instanceLabel(entry.productId, entry.instance)}: Status geändert`)
    }
  }
  for (const [id, entry] of before) {
    if (!after.has(id)) lines.push(`Nicht mehr im Plan: ${instanceLabel(entry.productId, entry.instance)}`)
  }

  if (lines.length === 0 && scenarioDiff(snapshot, current).length > 0) {
    lines.push('Weitere Angaben geändert')
  }
  return lines
}
