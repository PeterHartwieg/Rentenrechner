import type { Dispatch, SetStateAction } from 'react'
import type { ScenarioAssumptions } from '../../../domain'
import { NumberField } from '../../../ui/NumberField'
import { formatPercent } from '../../../utils/format'

/**
 * `§ 4 Annahmen` for `/eingaben`. Folds in the pre-redesign Annahmen tab.
 * Extracted from `AngabenPage.tsx` so the page shell stays a thin
 * orchestrator and so the section conventions (one file per § section,
 * slice + setter props) match the rest of `src/features/inputs/sections/`.
 * Behaviour is byte-identical with the inline implementation that shipped in
 * PR 5; only the JSX scope changes.
 *
 * The three return-scenario rows are display-only — they read from the
 * caller-supplied `resolvedRenditen` map (resolved once at page module load
 * by `find(s => s.id === 'basis')` etc. so we never index by position).
 *
 * Numeric fields bound to engine-shaped state (Monte-Carlo volatility,
 * inflation rate) route through `<NumberField>` per the CLAUDE.md
 * "UI rounding boundary" rule.
 */

interface ResolvedRenditen {
  readonly konservativ: number
  readonly basis: number
  readonly optimistisch: number
}

interface Props {
  assumptions: ScenarioAssumptions
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>
  resolvedRenditen: ResolvedRenditen
  num: string
  id: string
  title: string
}

export function AngabenAnnahmenSection({
  assumptions,
  setAssumptions,
  resolvedRenditen,
  num,
  id,
  title,
}: Props) {
  const inflationEnabled = assumptions.inflationRate > 0
  return (
    <section className="angaben-section">
      <div className="angaben-section-head">
        <span className="angaben-section-num">{num}</span>
        <h2 id={id} className="angaben-section-title">
          {title}
        </h2>
      </div>
      <p className="angaben-section-lead">
        Renditeannahmen für die kapitalmarktgebundenen Produkte und
        Inflationsmodellierung. Voreinstellungen folgen MSCI-World-Werten
        über 30-jährige Rolling-Fenster.
      </p>

      <div className="angaben-fields">
        <label className="angaben-field">
          <span className="angaben-field-label">Konservatives Szenario</span>
          <span className="angaben-field-shell">
            <span>{formatPercent(resolvedRenditen.konservativ, 1)}</span>
            <span className="angaben-field-suffix">real p.a.</span>
          </span>
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              10er-Quantil rollierend 30 J., MSCI World
            </span>
          </span>
        </label>

        <label className="angaben-field">
          <span className="angaben-field-label">Basis-Szenario</span>
          <span className="angaben-field-shell">
            <span>{formatPercent(resolvedRenditen.basis, 1)}</span>
            <span className="angaben-field-suffix">real p.a.</span>
          </span>
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Realer Median MSCI World 1900–2025 (~ 5,2 % real)
            </span>
          </span>
        </label>

        <label className="angaben-field">
          <span className="angaben-field-label">Optimistisches Szenario</span>
          <span className="angaben-field-shell">
            <span>{formatPercent(resolvedRenditen.optimistisch, 1)}</span>
            <span className="angaben-field-suffix">real p.a.</span>
          </span>
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              90er-Quantil rollierend 30 J., MSCI World
            </span>
          </span>
        </label>

        <div className="angaben-field">
          {/* Monte-Carlo volatility is bound to `assumptions.monteCarlo.annualVolatility`
              (engine-shaped state, stored as a decimal). NumberField renders the
              percent-display by scaling at the boundary: value is `vol × 100`,
              onChange divides by 100 on the way back. `decimals={0}` matches the
              integer step. */}
          <NumberField
            label="Monte-Carlo-Volatilität"
            value={Math.round(assumptions.monteCarlo.annualVolatility * 100)}
            min={0}
            max={50}
            step={1}
            decimals={0}
            suffix="% p.a."
            onChange={(value) =>
              setAssumptions((a) => ({
                ...a,
                monteCarlo: {
                  ...a.monteCarlo,
                  annualVolatility: Math.max(0, Number(value)) / 100,
                },
              }))
            }
          />
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Annualisierte Volatilität für die stochastische Bandbreite
            </span>
          </span>
        </div>

        <label className="angaben-field">
          <span className="angaben-field-label">Inflation</span>
          <span className="angaben-check">
            <input
              type="checkbox"
              checked={inflationEnabled}
              onChange={(e) =>
                setAssumptions((a) => ({
                  ...a,
                  inflationRate: e.target.checked ? 0.02 : 0,
                }))
              }
            />
            <span>Inflation modellieren</span>
          </span>
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              EZB-Mittelfrist-Ziel 2 % als Vorbelegung — beliebig anpassbar
            </span>
          </span>
        </label>

        {inflationEnabled && (
          <div className="angaben-field">
            {/* Inflation rate display is `inflationRate × 100`, rounded to 1
                decimal place via NumberField's `decimals={1}`. On change we
                divide back by 100 so the engine value stays a ratio. */}
            <NumberField
              label="Inflationsrate p.a."
              value={Number((assumptions.inflationRate * 100).toFixed(1))}
              min={0}
              max={8}
              step={0.1}
              decimals={1}
              suffix="% p.a."
              onChange={(value) =>
                setAssumptions((a) => ({
                  ...a,
                  inflationRate: Math.max(0, Number(value)) / 100,
                }))
              }
            />
            <span className="angaben-field-meta">
              <span className="angaben-field-hint">
                Reduziert reale Werte in der Auszahlphase
              </span>
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
