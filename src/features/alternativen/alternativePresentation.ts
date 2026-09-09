import type { PlanSummary } from '../../app/planSummary'
import { formatCurrency } from '../../utils/format'

export function alternativeTotal(summary: PlanSummary | null): string {
  return summary?.readiness.canShowHouseholdTotal
    ? formatCurrency(summary.netMonthlyTotalReal) : 'Noch offen'
}

export function alternativeDate(stamp: string): string {
  const date = new Date(stamp)
  return Number.isNaN(date.getTime()) ? 'Datum unbekannt'
    : new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date)
}

export const STORAGE_NOTE = 'Dein Plan und gespeicherte Alternativen bleiben in diesem Browser auch nach dem Neuladen erhalten. Sie werden nicht zwischen Geräten synchronisiert. Wenn du die Browserdaten löschst, werden auch diese Angaben entfernt.'

