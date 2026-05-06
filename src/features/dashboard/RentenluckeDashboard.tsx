/**
 * Rentenlücke dashboard (Group G QA issue #20).
 *
 * Top-of-page overview for combine-mode (Mein Plan): summarises the gap
 * between projected total monthly net retirement income (GRV + each portfolio
 * instance) and a user-set or salary-derived target. Surfaces a primary CTA
 * pointing at the Angebot tab where the user can adjust contributions or add
 * a Vertrag. Compare-mode (Vergleich) is product-vs-product head-to-head and
 * deliberately does not surface this dashboard — the user there is choosing
 * between candidates, not tracking against a personal target.
 *
 * The component is a pure presentation layer over a pre-derived
 * `RentenluckeOverview` — it runs no simulation. Engine code stays React-free.
 */

import './RentenluckeDashboard.css'
import type { PersonalProfile } from '../../domain'
import { GRV_COLOR } from '../../app/productPresentation'
import {
  RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO,
  type RentenluckeOverview,
} from '../../app/simulationSelectors'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency, formatPercent } from '../../utils/format'
import {
  OPTIMIERE_BUTTON_LABEL,
  OPTIMIERE_DISABLED_TOOLTIP,
} from '../../content/optimiereCopy'
import { useFeedbackTarget } from '../qa-feedback'

interface Props {
  profile: PersonalProfile
  overview: RentenluckeOverview
  /** Updates `profile.desiredNetMonthlyPension`. Pass undefined / 0 to clear. */
  onTargetChange: (next: number | undefined) => void
  /**
   * Primary CTA handler. Typically navigates to the Angebot tab so the user
   * can raise their contributions or add another Vertrag.
   */
  onAdjustContributions: () => void
  /**
   * Opens the "Optimiere deine Vorsorge" modal (B6). Only wired in combine
   * mode — compare mode never renders this dashboard.
   */
  onOpenOptimiere?: () => void
  /**
   * Whether the workspace has at least one active or paid-up instance.
   * When false the Optimiere button renders disabled with a tooltip.
   */
  hasActiveInstances?: boolean
}

export function RentenluckeDashboard({
  profile,
  overview,
  onTargetChange,
  onAdjustContributions,
  onOpenOptimiere,
  hasActiveInstances = false,
}: Props) {
  const { grvNet, productBreakdown, projectedTotal, target, targetIsUserSet, gap, goalReached } =
    overview

  const { targetProps: sectionTargetProps } = useFeedbackTarget({
    id: 'dashboard.rentenlucke.section',
    label: 'Rentenlücke-Dashboard',
    precision: 'section',
  })
  const { targetProps: projectedMetricProps } = useFeedbackTarget({
    id: 'dashboard.rentenlucke.metric.projected',
    label: 'Voraussichtliche Netto-Rente (mtl.)',
  })
  const { targetProps: targetMetricProps } = useFeedbackTarget({
    id: 'dashboard.rentenlucke.metric.target',
    label: 'Ziel-Netto-Rente (mtl.)',
  })
  const { targetProps: gapMetricProps } = useFeedbackTarget({
    id: 'dashboard.rentenlucke.metric.gap',
    label: 'Rentenlücke (mtl.)',
  })
  const { targetProps: hintProps } = useFeedbackTarget({
    id: 'dashboard.rentenlucke.hint',
    label: 'Hinweis Wunschnetto-Voreinstellung',
  })
  const { targetProps: closeCtaProps } = useFeedbackTarget({
    id: 'dashboard.rentenlucke.cta.close',
    label: 'CTA Lücke schließen / Mehr sparen',
  })
  const { targetProps: optimiereCtaProps } = useFeedbackTarget({
    id: 'dashboard.rentenlucke.cta.optimiere',
    label: 'CTA Optimiere deine Vorsorge',
  })

  // Stacked-bar segments (GRV + visible products). Width is share of the
  // larger of (projected, target) so both extremes fit on one axis.
  const axisMax = Math.max(projectedTotal, target, 1)
  const segments = [
    { id: 'grv', label: 'Gesetzl. Rente', value: grvNet, color: GRV_COLOR },
    ...productBreakdown,
  ]

  // Hide the input/CTA chrome when the user has neither a target nor a salary
  // to derive from — the dashboard still renders the projected total but the
  // gap/CTA stop being meaningful.
  const hasMeaningfulTarget = target > 0

  return (
    <section className="rentenlucke-dashboard" aria-label="Rentenlücke-Übersicht" {...sectionTargetProps}>
      <header className="rentenlucke-dashboard__header">
        <h2>Rentenlücke</h2>
        <p>Voraussichtliche Netto-Rente vs. Wunschnetto.</p>
      </header>

      <div className="rentenlucke-dashboard__headline">
        <div className="rentenlucke-dashboard__metric" {...projectedMetricProps}>
          <span>Voraussichtlich (mtl.)</span>
          <strong>{formatCurrency(projectedTotal, 0)}</strong>
          <small>
            GRV {formatCurrency(grvNet, 0)}
            {productBreakdown.length > 0
              ? ` + ${productBreakdown.length} Produkt${productBreakdown.length === 1 ? '' : 'e'}`
              : ''}
          </small>
        </div>
        <div className="rentenlucke-dashboard__metric" {...targetMetricProps}>
          <span>Ziel (mtl.)</span>
          <strong>{hasMeaningfulTarget ? formatCurrency(target, 0) : '—'}</strong>
          <small>
            {targetIsUserSet
              ? 'Eigene Vorgabe'
              : `${formatPercent(RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO, 0)} Ihres Bruttogehalts`}
          </small>
        </div>
        <div
          className={
            'rentenlucke-dashboard__metric rentenlucke-dashboard__metric--' +
            (goalReached ? 'reached' : 'gap')
          }
          {...gapMetricProps}
        >
          <span>{goalReached ? 'Status' : 'Lücke (mtl.)'}</span>
          <strong>{goalReached ? 'Ziel erreicht' : formatCurrency(gap, 0)}</strong>
          <small>
            {goalReached
              ? `${formatCurrency(projectedTotal - target, 0)} über Ziel`
              : hasMeaningfulTarget
                ? 'Differenz zum Wunschnetto'
                : 'Wunschnetto nicht gesetzt'}
          </small>
        </div>
      </div>

      {hasMeaningfulTarget && (
        <div
          className="rentenlucke-dashboard__bar"
          role="img"
          aria-label={
            goalReached
              ? `Voraussichtliche Rente ${formatCurrency(projectedTotal, 0)}, Ziel ${formatCurrency(target, 0)} erreicht.`
              : `Voraussichtliche Rente ${formatCurrency(projectedTotal, 0)}, Ziel ${formatCurrency(target, 0)}, Lücke ${formatCurrency(gap, 0)}.`
          }
        >
          <div className="rentenlucke-dashboard__bar-track">
            {segments
              .filter((s) => s.value > 0)
              .map((segment) => (
                <div
                  key={segment.id}
                  className="rentenlucke-dashboard__bar-segment"
                  style={{
                    width: `${(segment.value / axisMax) * 100}%`,
                    backgroundColor: segment.color,
                  }}
                  title={`${segment.label}: ${formatCurrency(segment.value, 0)}`}
                />
              ))}
            {!goalReached && gap > 0 && (
              <div
                className="rentenlucke-dashboard__bar-segment rentenlucke-dashboard__bar-segment--gap"
                style={{ width: `${(gap / axisMax) * 100}%` }}
                title={`Lücke: ${formatCurrency(gap, 0)}`}
              />
            )}
          </div>
          <div
            className="rentenlucke-dashboard__bar-marker"
            style={{ left: `${(target / axisMax) * 100}%` }}
            aria-hidden="true"
          >
            <span>Ziel {formatCurrency(target, 0)}</span>
          </div>
        </div>
      )}

      <div className="rentenlucke-dashboard__legend">
        {segments
          .filter((s) => s.value > 0)
          .map((segment) => (
            <span key={segment.id} className="rentenlucke-dashboard__legend-item">
              <span
                className="rentenlucke-dashboard__legend-swatch"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              {segment.label}: {formatCurrency(segment.value, 0)}
            </span>
          ))}
        {!goalReached && hasMeaningfulTarget && gap > 0 && (
          <span className="rentenlucke-dashboard__legend-item rentenlucke-dashboard__legend-item--gap">
            <span
              className="rentenlucke-dashboard__legend-swatch rentenlucke-dashboard__legend-swatch--gap"
              aria-hidden="true"
            />
            Lücke: {formatCurrency(gap, 0)}
          </span>
        )}
      </div>

      <div className="rentenlucke-dashboard__controls">
        <NumberField
          label="Wunschnetto (mtl.)"
          value={target}
          min={0}
          max={20_000}
          step={50}
          decimals={0}
          suffix="€"
          feedbackTargetId="dashboard.rentenlucke.input.target"
          onCommit={(raw) => {
            const parsed = Number(raw)
            if (!Number.isFinite(parsed) || parsed <= 0) {
              onTargetChange(undefined)
              return
            }
            onTargetChange(parsed)
          }}
        />
        {!targetIsUserSet && profile.grossSalaryYear > 0 && (
          <p className="rentenlucke-dashboard__hint" {...hintProps}>
            Voreinstellung: {formatPercent(RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO, 0)} Ihres aktuellen Bruttogehalts
            {' '}({formatCurrency((profile.grossSalaryYear / 12) * RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO, 0)} mtl.).
            Eigenen Wert eintragen, um die Lücke individuell zu prüfen.
          </p>
        )}
        <div className="rentenlucke-dashboard__cta-group">
          <button
            type="button"
            className={
              'rentenlucke-dashboard__cta' +
              (goalReached ? ' rentenlucke-dashboard__cta--secondary' : '')
            }
            onClick={onAdjustContributions}
            {...closeCtaProps}
          >
            {goalReached ? 'Mehr sparen' : 'Lücke schließen'}
          </button>
          {onOpenOptimiere && (
            <button
              type="button"
              className="rentenlucke-dashboard__cta rentenlucke-dashboard__cta--secondary"
              onClick={onOpenOptimiere}
              disabled={!hasActiveInstances}
              title={hasActiveInstances ? undefined : OPTIMIERE_DISABLED_TOOLTIP}
              {...optimiereCtaProps}
            >
              {OPTIMIERE_BUTTON_LABEL}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
