import type { Ref } from 'react'
import type { PlanSummary } from '../../app/planSummary'
import type { WhatIfDescription } from '../../app/whatIfPreview'
import { formatCurrency } from '../../utils/format'
import { alternativeTotal } from './alternativePresentation'

export function AlternativeComparison({ before, after, delta = null, description, retirementAge, heading = 'Vorher und nachher', headingRef, showApplyNote = true }: {
  before: PlanSummary | null
  after: PlanSummary | null
  delta?: number | null
  description: WhatIfDescription
  retirementAge: number | undefined
  heading?: string
  headingRef?: Ref<HTMLHeadingElement>
  showApplyNote?: boolean
}) {
  const complete = before?.readiness.canShowHouseholdTotal && after?.readiness.canShowHouseholdTotal
  return <section className="alternativen__comparison" aria-label="Vorher und nachher">
    <h2 ref={headingRef} tabIndex={-1}>{heading}</h2>
    <div className="alternativen__columns">
      <div><h3>Bisher</h3><p className="alternativen__number">{alternativeTotal(before)}</p></div>
      <div><h3>Danach</h3><p className="alternativen__number alternativen__number--after">{alternativeTotal(after)}</p></div>
    </div>
    <p className="alternativen__muted">Gesamt · netto pro Monat ab {retirementAge ?? 'unbekannt'} · in heutigen Euro</p>
    {!complete && <p className="alternativen__notice">Für eine Gesamtrente fehlen noch Angaben in deinem Plan.</p>}
    {complete && delta !== null && <p className="alternativen__delta">Änderung: {delta >= 0 ? '+' : ''}{formatCurrency(delta).replace('-', '−')} / Monat</p>}
    <div className="alternativen__source">
      <strong>{description.instanceLabel ?? 'Geänderte Vorsorge'}</strong>
      <span>{description.productId === 'bav' ? 'Monatlicher Bruttobeitrag zur bAV' : 'Monatlicher Beitrag'}</span>
      <span>Bisher: {description.beforeContributionMonthly === null ? 'unbekannt' : `${formatCurrency(description.beforeContributionMonthly)} / Monat`}</span>
      <span>Danach: {description.decision === 'paid_up' ? 'Keine weiteren Beiträge' : description.afterContributionMonthly === null ? 'unbekannt' : `${formatCurrency(description.afterContributionMonthly)} / Monat`}</span>
    </div>
    {showApplyNote && <p className="alternativen__muted">Die Änderung gilt erst, wenn du sie in deinen Plan übernimmst.</p>}
  </section>
}
