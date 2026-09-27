import type { Ref } from 'react'
import type { PlanSourceRow, PlanSummary } from '../../app/planSummary'
import type { WhatIfDecisionKind, WhatIfDescription } from '../../app/whatIfPreview'
import { formatCurrency } from '../../utils/format'
import { PlanDurationText } from '../mein-plan/PlanDurationSummary'
import { alternativeTotal } from './alternativePresentation'

function money(value: number | null): string {
  return value === null ? 'unbekannt' : `${formatCurrency(value)} / Monat`
}

/** What the alternative actually does, in the user's words (audit F03). */
function actionLabel(decision: WhatIfDecisionKind): string {
  switch (decision) {
    case 'activate_offer': return 'Angebot wird in den Plan aufgenommen: Status Angebot → aktiver Vertrag'
    case 'new_contract': return 'Neue Sparform wird ergänzt'
    case 'paid_up': return 'Vertrag wird beitragsfrei gestellt'
    case 'contribution': return 'Monatlicher Beitrag wird geändert'
    default: return 'Änderung konnte nicht im Einzelnen beschrieben werden'
  }
}

function contributionLabel(description: WhatIfDescription): string {
  if (description.decision === 'activate_offer' && (description.quotedContributionMonthly == null || description.quotedContributionMonthly !== description.afterContributionMonthly)) {
    return description.productId === 'bav' ? 'Monatlicher Bruttobeitrag im Modell' : 'Monatlicher Beitrag im Modell'
  }
  if (description.productId === 'bav') return 'Monatlicher Bruttobeitrag zur bAV'
  if (description.decision === 'activate_offer') return 'Monatlicher Beitrag laut Angebot'
  return 'Monatlicher Beitrag'
}

function beforeText(description: WhatIfDescription): string {
  if (description.decision === 'activate_offer') return `${formatCurrency(0)} / Monat (Angebot zählt noch nicht zum Plan)`
  if (description.decision === 'new_contract') return `${formatCurrency(0)} / Monat (noch nicht vorhanden)`
  return money(description.beforeContributionMonthly)
}

function afterText(description: WhatIfDescription): string {
  if (description.decision === 'paid_up') return 'Keine weiteren Beiträge'
  return money(description.afterContributionMonthly)
}

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
  const undescribed = description.decision === 'other'
  const subjectRow: PlanSourceRow | undefined = description.instanceId
    ? after?.rows.find((row) => row.instanceId === description.instanceId)
    : undefined
  const savingBefore = before?.monthlyNetSavingCost ?? null
  const savingAfter = after?.monthlyNetSavingCost ?? null
  const extraNetCost = savingBefore !== null && savingAfter !== null ? savingAfter - savingBefore : null
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
      <span>{actionLabel(description.decision)}</span>
      {undescribed
        ? <span className="alternativen__notice" role="note">Diese Alternative enthält Änderungen, die hier nicht einzeln aufgeführt werden können. Bitte erstelle eine neue Alternative, bevor du eine Änderung übernimmst.</span>
        : <>
          <span>{contributionLabel(description)}</span>
          {description.decision === 'activate_offer' && description.quotedContributionMonthly == null && <span role="note">
            Eine bestätigte Beitragshöhe aus dem Angebot fehlt. Prüfe den Betrag anhand deiner Unterlagen.
          </span>}
          <span>Bisher: {beforeText(description)}</span>
          <span>Danach: {afterText(description)}</span>
          {description.quotedContributionMonthly != null && description.quotedContributionMonthly !== description.afterContributionMonthly && <span role="note">
            Ursprünglicher Beitrag laut Angebot: {money(description.quotedContributionMonthly)}.
            Diese Alternative rechnet mit einem anderen Beitrag. Kosten und Leistungen müssen für diesen Beitrag neu bestätigt werden.
          </span>}
          {description.decision !== 'paid_up' && extraNetCost !== null && extraNetCost !== 0 && <span>
            {extraNetCost > 0 ? 'Zusätzliche monatliche Belastung' : 'Monatliche Entlastung'}: {formatCurrency(Math.abs(extraNetCost))} / Monat
          </span>}
          {savingBefore !== null && savingAfter !== null && <span>
            Nettoaufwand aller Sparformen zu Beginn: {formatCurrency(savingBefore)} → {formatCurrency(savingAfter)} / Monat
          </span>}
          {savingBefore !== null && savingAfter !== null && <span>Mit modellierter Förderung und Steuerwirkung; Erstattungen können zeitversetzt erfolgen.</span>}
          {subjectRow && <span>Auszahlung: <PlanDurationText duration={subjectRow.duration} /></span>}
        </>}
    </div>
    {showApplyNote && <p className="alternativen__muted">Die Änderung gilt erst, wenn du sie in deinen Plan übernimmst.</p>}
  </section>
}
