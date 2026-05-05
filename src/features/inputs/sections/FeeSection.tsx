import type { Dispatch, SetStateAction } from 'react'
import type { FeeModel } from '../../../domain'
import { NumberField } from '../../../ui/NumberField'
import { formatPercent } from '../../../utils/format'
import { qaTargetAttrs } from '../../qa-feedback'
import { useQaMode } from '../../qa-feedback/useQaMode'

/**
 * Reusable fee-input section for bAV and pAV. Owns the fee-mode tabs (Einzelposten
 * vs. Effektivkosten all-in), preset buttons, the seven fee fields, and the
 * fee-summary block with threshold warnings.
 *
 * Identical structure between BavInputs and InsuranceInputs — extracted here so
 * Group G's per-instance refactor only needs to plumb a different `fees` /
 * `onChangeFees` pair, and so the threshold warnings stay in one place.
 *
 * `feeInputMode` lives in the host so the toggle survives across re-renders
 * without leaking into the persisted assumption shape.
 */

export type FeeInputMode = 'aufgeschluesselt' | 'effektivkosten'

interface FeePreset {
  label: string
  fees: FeeModel
}

interface Props {
  fees: FeeModel
  onChangeFees: (fees: FeeModel) => void
  /** Pre-canned preset buttons for the host's product (BAV_FEE_PRESETS / PAV_FEE_PRESETS). */
  presets: readonly FeePreset[]
  /** Effektivkosten / RIY (decimal) for the threshold-warning thresholds and the summary line. */
  riy: number
  feeInputMode: FeeInputMode
  setFeeInputMode: Dispatch<SetStateAction<FeeInputMode>>
  /**
   * QA-feedback base id for this section instance. Inner NumberFields derive
   * their ids from this base, e.g. `inputs.bav.fees` →
   * `inputs.bav.fees.fixedMonthlyFee`, `inputs.bav.fees.contributionFee`, etc.
   * When omitted, no feedback attributes are applied.
   */
  feedbackBaseId?: string
}

/** Shared spread defaults for the Effektivkosten all-in path. */
const ALL_IN_FALLBACK: FeeModel = {
  wrapperAssetFee: 0,
  fundAssetFee: 0,
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 5,
  pensionPayoutFeePct: 0,
}

export function FeeSection({
  fees,
  onChangeFees,
  presets,
  riy,
  feeInputMode,
  setFeeInputMode,
  feedbackBaseId,
}: Props) {
  const { enabled: qaEnabled } = useQaMode()
  const totalAsset = fees.wrapperAssetFee + fees.fundAssetFee
  const update = (patch: Partial<FeeModel>) => onChangeFees({ ...fees, ...patch })
  const fid = (suffix: string) => feedbackBaseId ? `${feedbackBaseId}.${suffix}` : undefined
  // Derive leaf QA ids for the mode-tab buttons. When no feedbackBaseId is
  // provided the buttons still carry their own stable ids so the overlay can
  // identify them during dog-fooding even in contexts that haven't plumbed
  // feedbackBaseId yet.
  const tabBaseId = feedbackBaseId ?? 'inputs.fees'

  return (
    <>
      <div className="fee-mode-tabs">
        <button
          type="button"
          className={`fee-mode-tab${feeInputMode === 'aufgeschluesselt' ? ' fee-mode-tab--active' : ''}`}
          onClick={() => setFeeInputMode('aufgeschluesselt')}
          {...qaTargetAttrs(qaEnabled, { id: `${tabBaseId}.tab.aufgeschluesselt`, label: 'Einzelposten', precision: 'exact' })}
        >
          Einzelposten
        </button>
        <button
          type="button"
          className={`fee-mode-tab${feeInputMode === 'effektivkosten' ? ' fee-mode-tab--active' : ''}`}
          onClick={() => setFeeInputMode('effektivkosten')}
          {...qaTargetAttrs(qaEnabled, { id: `${tabBaseId}.tab.effektivkosten`, label: 'Effektivkosten (all-in)', precision: 'exact' })}
        >
          Effektivkosten (all-in)
        </button>
      </div>

      {feeInputMode === 'aufgeschluesselt' && (
        <>
          <div className="fee-presets">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="preset-btn"
                onClick={() => onChangeFees(preset.fees)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="field-grid">
            <NumberField
              label="Fixkosten je Monat"
              feedbackTargetId={fid('fixedMonthlyFee')}
              value={fees.fixedMonthlyFee}
              min={0}
              max={50}
              step={0.5}
              suffix="EUR"
              onChange={(value) => update({ fixedMonthlyFee: Number(value) })}
            />
            <NumberField
              label="Kosten je Beitrag"
              feedbackTargetId={fid('contributionFee')}
              value={fees.contributionFee * 100}
              min={0}
              max={20}
              step={0.25}
              suffix="%"
              onChange={(value) => update({ contributionFee: Number(value) / 100 })}
            />
            <NumberField
              label="Mantelgebühr (Versicherer)"
              feedbackTargetId={fid('wrapperAssetFee')}
              value={fees.wrapperAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) => update({ wrapperAssetFee: Number(value) / 100 })}
            />
            <NumberField
              label="Fondskosten (TER)"
              feedbackTargetId={fid('fundAssetFee')}
              value={fees.fundAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) => update({ fundAssetFee: Number(value) / 100 })}
            />
            <NumberField
              label="Auszahlungsgebühr"
              feedbackTargetId={fid('pensionPayoutFee')}
              value={fees.pensionPayoutFeePct * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="% je Rente"
              onChange={(value) => update({ pensionPayoutFeePct: Number(value) / 100 })}
            />
            <NumberField
              label="Vertriebs-/Abschlusskosten"
              feedbackTargetId={fid('acquisitionCostPct')}
              value={fees.acquisitionCostPct * 100}
              min={0}
              max={8}
              step={0.25}
              suffix="% Summe"
              onChange={(value) => update({ acquisitionCostPct: Number(value) / 100 })}
            />
            <NumberField
              label="Verteilung Abschlusskosten"
              feedbackTargetId={fid('acquisitionCostSpreadYears')}
              value={fees.acquisitionCostSpreadYears}
              min={1}
              max={15}
              step={1}
              suffix="Jahre"
              onChange={(value) => update({ acquisitionCostSpreadYears: Number(value) })}
            />
          </div>
        </>
      )}

      {feeInputMode === 'effektivkosten' && (
        <>
          <NumberField
            label="Effektivkosten aus PIB/KID (Renditeminderung p.a.)"
            feedbackTargetId={fid('effektivkosten')}
            value={(fees.wrapperAssetFee + fees.fundAssetFee) * 100}
            min={0}
            max={5}
            step={0.05}
            suffix="% p.a."
            onChange={(value) =>
              onChangeFees({ ...ALL_IN_FALLBACK, wrapperAssetFee: Number(value) / 100 })
            }
          />
          <p className="field-hint">
            Näherung: Die Effektivkosten aus dem PIB/KID werden als gleichmäßige
            jährliche Renditeminderung eingestellt. Abschluss- und beitragsbezogene
            Kosten sind darin bereits enthalten.{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => setFeeInputMode('aufgeschluesselt')}
            >
              Auf Einzelposten wechseln
            </button>
          </p>
        </>
      )}

      <div className="fee-summary">
        {feeInputMode === 'aufgeschluesselt' && (
          <span>
            Gesamt Kapitalgebühr: <strong>{formatPercent(totalAsset)}</strong> p.a.
            (Mantel {formatPercent(fees.wrapperAssetFee)} + Fonds{' '}
            {formatPercent(fees.fundAssetFee)})
          </span>
        )}
        <span className={riy > 0.02 ? 'riy-high' : riy > 0.015 ? 'riy-warn' : ''}>
          Effektivkosten: <strong>{formatPercent(riy)}</strong>
        </span>
        {fees.contributionFee > 0.05 && (
          <p className="field-warning">
            Beitragskostenquote {formatPercent(fees.contributionFee)} liegt über
            5 % — typische Nettotarife erheben keine Kosten je Beitrag.
          </p>
        )}
        {fees.acquisitionCostPct > 0.025 && (
          <p className="field-warning">
            Abschlusskosten {formatPercent(fees.acquisitionCostPct)} übersteigen
            2,5 % der Beitragssumme.
          </p>
        )}
        {totalAsset > 0.01 && (
          <p className="field-warning">
            Laufende Kapitalgebühr {formatPercent(totalAsset)} p.a. liegt über
            1,0 % — prüfen Sie ETF-basierte Nettotarife (typisch 0,5–0,8 % all-in).
          </p>
        )}
        {riy > 0.02 && (
          <p className="field-warning">
            Effektivkosten {formatPercent(riy)} überschreiten 2,0 % — ETF-basierte
            Verträge über dieser Schwelle gelten i. d. R. als unwirtschaftlich.
          </p>
        )}
        {riy > 0.015 && riy <= 0.02 && (
          <p className="field-warning">
            Effektivkosten {formatPercent(riy)} liegen im kritischen Bereich
            (1,5–2,0 %) — Nettotarife erzielen typisch 0,6–1,0 %.
          </p>
        )}
      </div>
    </>
  )
}
