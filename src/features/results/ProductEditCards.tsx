import './ProductEditCards.css'
import '../../ui/forms.css'
import type React from 'react'
import type { ProductId, ProductResult, ScenarioAssumptions } from '../../domain'
import { NumberField } from '../../ui/NumberField'
import { InfoTip } from '../../ui/InfoTip'
import {
  getProductMeta,
  STATUTORY_BAV_SUBSIDY_PCT,
  bavTotalMatchPct,
  applyBavTotalMatch,
} from '../../app/productPresentation'
import { formatCurrency, formatPercent } from '../../utils/format'
import { defaultAssumptions } from '../../data/defaultScenario'

const TIP_NETTO_RENTE =
  'Was monatlich auf deinem Konto landet — nach Steuer und (bei bAV/Rürup) Krankenkasse.'
const TIP_EFFEKTIVKOSTEN =
  'Wie viel die Vertrags- und Fondskosten deine Rendite jährlich schmälern. Unter 1 % gilt als günstig, über 1,5 % als hoch.'
const TIP_RENTENFAKTOR =
  'Wie viel Euro Rente du pro 10.000 EUR Kapital monatlich bekommst — steht in deinem Versicherungsangebot.'
const TIP_TEILFREISTELLUNG =
  'Je nach Fondstyp ist ein Teil der Gewinne von der Abgeltungsteuer befreit (z. B. 30 % bei Aktienfonds).'

interface Props {
  selectedResults: ProductResult[]
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  avdCappedAtContractMax?: boolean
  avdContractCapAnnual?: number
}

type FieldProps = {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
}

const EXEMPTION_OPTIONS: { value: number; label: string }[] = [
  { value: 0.3, label: 'Aktienfonds (30 % steuerfrei)' },
  { value: 0.15, label: 'Mischfonds (15 % steuerfrei)' },
  { value: 0.6, label: 'Inl. Immobilienfonds (60 % steuerfrei)' },
  { value: 0.8, label: 'Ausl. Immobilienfonds (80 % steuerfrei)' },
  { value: 0, label: 'Anleihe-ETF / Sonstige (0 %)' },
]

function diff(a: number, b: number): boolean {
  return Math.abs(a - b) > 1e-9
}

type ProvKind = 'user' | 'default' | 'model' | 'confirmed'

function ProvLabel({
  isModified,
  isModel = false,
  isConfirmed = false,
}: {
  isModified: boolean
  isModel?: boolean
  isConfirmed?: boolean
}) {
  const kind: ProvKind = isModified
    ? 'user'
    : isConfirmed
      ? 'confirmed'
      : isModel
        ? 'model'
        : 'default'
  const label =
    kind === 'user'
      ? 'von dir'
      : kind === 'confirmed'
        ? 'geprüft'
        : kind === 'model'
          ? 'Modellwert'
          : 'Standardwert'
  return <span className={`pec-prov pec-prov--${kind}`}>{label}</span>
}

function FieldWithProv({
  modified,
  isModel = false,
  isConfirmed = false,
  onConfirmToggle,
  children,
}: {
  modified: boolean
  isModel?: boolean
  isConfirmed?: boolean
  onConfirmToggle?: () => void
  children: React.ReactNode
}) {
  // The "Wert stimmt" / "↺ als Schätzwert" action only applies to model fields,
  // and only when the value still equals the default (when the user has typed
  // their own value, the badge is already "von dir" — confirmation is moot).
  const showConfirmAction = isModel && !modified && onConfirmToggle !== undefined
  return (
    <div className={`pec-field-row${modified ? ' pec-field-row--modified' : ''}`}>
      {children}
      <div className="pec-field-meta">
        <ProvLabel isModified={modified} isModel={isModel} isConfirmed={isConfirmed && !modified} />
        {showConfirmAction && (
          <button
            type="button"
            className="pec-confirm-btn"
            onClick={onConfirmToggle}
            title={
              isConfirmed
                ? 'Wieder als Schätzwert markieren'
                : 'Wert stimmt mit deinem Angebot — als geprüft markieren'
            }
          >
            {isConfirmed ? '↺ als Schätzwert' : '✓ Wert stimmt'}
          </button>
        )}
      </div>
    </div>
  )
}

function hasUnconfirmedRentenfaktor(productId: ProductId, assumptions: ScenarioAssumptions): boolean {
  switch (productId) {
    case 'bav':
      return (
        assumptions.bav.payoutMode === 'leibrente' &&
        !diff(assumptions.bav.rentenfaktor, defaultAssumptions.bav.rentenfaktor) &&
        !assumptions.bav.rentenfaktorConfirmed
      )
    case 'versicherung':
      return (
        assumptions.insurance.payoutMode === 'leibrente' &&
        !diff(assumptions.insurance.rentenfaktor, defaultAssumptions.insurance.rentenfaktor) &&
        !assumptions.insurance.rentenfaktorConfirmed
      )
    case 'basisrente':
      return (
        !diff(assumptions.basisrente.rentenfaktor, defaultAssumptions.basisrente.rentenfaktor) &&
        !assumptions.basisrente.rentenfaktorConfirmed
      )
    case 'riester':
      return (
        assumptions.riester.payoutMode === 'leibrente' &&
        !diff(assumptions.riester.rentenfaktor, defaultAssumptions.riester.rentenfaktor) &&
        !assumptions.riester.rentenfaktorConfirmed
      )
    default:
      return false
  }
}

export function ProductEditCards({
  selectedResults,
  assumptions,
  onAssumptionsChange,
  avdCappedAtContractMax = false,
  avdContractCapAnnual,
}: Props) {
  if (selectedResults.length === 0) return null

  return (
    <section className="pec-section" aria-label="Annahmen je Produkt anpassen">
      <div className="pec-cards">
        {selectedResults.map((result) => (
          <ProductCard
            key={result.productId}
            result={result}
            assumptions={assumptions}
            onAssumptionsChange={onAssumptionsChange}
            cappedAtContractMax={result.productId === 'altersvorsorgedepot' && avdCappedAtContractMax}
            contractCapAnnual={avdContractCapAnnual}
          />
        ))}
      </div>
    </section>
  )
}

function ProductCard({
  result,
  assumptions,
  onAssumptionsChange,
  cappedAtContractMax,
  contractCapAnnual,
}: {
  result: ProductResult
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  cappedAtContractMax: boolean
  contractCapAnnual?: number
}) {
  const meta = getProductMeta(result.productId)
  const color = meta?.color ?? '#94a3b8'
  const showRentenfaktorHint = hasUnconfirmedRentenfaktor(result.productId, assumptions)

  return (
    <div className="pec-card" style={{ borderTopColor: color }}>
      <div className="pec-card-header">
        <span className="pec-product-name">
          {result.label}
          {cappedAtContractMax && (
            <span
              className="pec-cap-badge"
              title={
                contractCapAnnual
                  ? `AltZertG-Vertragsobergrenze ${formatCurrency(contractCapAnnual, 0)}/Jahr (Eigenbeitrag + Zulagen) erreicht. Andere Produkte können den Mehrbetrag investieren.`
                  : 'Beitragsobergrenze erreicht'
              }
            >
              Cap erreicht
            </span>
          )}
        </span>
        <div className="pec-metrics">
          {result.afterTaxLumpSum !== null && (
            <span className="pec-metric">
              <span className="pec-metric-label">Kapital</span>
              <span className="pec-metric-value">{formatCurrency(result.afterTaxLumpSum, 0)}</span>
            </span>
          )}
          <span className="pec-metric">
            <span className="pec-metric-label">
              Netto-Rente
              <InfoTip text={TIP_NETTO_RENTE} />
            </span>
            <span className="pec-metric-value">
              {formatCurrency(result.netMonthlyPayout, 0)} /Mon.
            </span>
          </span>
          {result.accumulationRiy > 0 && (
            <span className="pec-metric">
              <span className="pec-metric-label">
                Effektivkosten
                <InfoTip text={TIP_EFFEKTIVKOSTEN} />
              </span>
              <span className="pec-metric-value">{formatPercent(result.accumulationRiy, 2)} p.a.</span>
            </span>
          )}
        </div>
        {showRentenfaktorHint && (
          <p className="pec-model-hint">
            Rentenfaktor ist noch Schätzwert – bitte aus Angebot übernehmen.
          </p>
        )}
      </div>

      <details className="pec-details">
        <summary className="pec-summary">Annahmen anpassen</summary>
        <div className="pec-fields">
          <ProductFields
            productId={result.productId}
            assumptions={assumptions}
            onAssumptionsChange={onAssumptionsChange}
          />
        </div>
      </details>
    </div>
  )
}

function ProductFields({
  productId,
  assumptions,
  onAssumptionsChange,
}: {
  productId: ProductId
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
}) {
  switch (productId) {
    case 'etf':
      return <EtfFields assumptions={assumptions} onAssumptionsChange={onAssumptionsChange} />
    case 'bav':
      return <BavFields assumptions={assumptions} onAssumptionsChange={onAssumptionsChange} />
    case 'versicherung':
      return <InsuranceFields assumptions={assumptions} onAssumptionsChange={onAssumptionsChange} />
    case 'basisrente':
      return <BasisrenteFields assumptions={assumptions} onAssumptionsChange={onAssumptionsChange} />
    case 'altersvorsorgedepot':
      return <AvdFields assumptions={assumptions} onAssumptionsChange={onAssumptionsChange} />
    case 'riester':
      return <RiesterFields assumptions={assumptions} onAssumptionsChange={onAssumptionsChange} />
    default:
      return null
  }
}

function EtfFields({ assumptions, onAssumptionsChange }: FieldProps) {
  const { etf } = assumptions
  const def = defaultAssumptions.etf

  return (
    <>
      <FieldWithProv modified={diff(etf.annualAssetFee, def.annualAssetFee)}>
        <NumberField
          label="Fondskosten (TER)"
          value={etf.annualAssetFee * 100}
          min={0}
          max={5}
          step={0.05}
          suffix="%"
          onCommit={(v) => {
            const pct = Math.min(5, Math.max(0, Number(v))) / 100
            onAssumptionsChange((cur) => ({ ...cur, etf: { ...cur.etf, annualAssetFee: pct } }))
          }}
        />
      </FieldWithProv>
      <FieldWithProv modified={diff(etf.equityPartialExemption, def.equityPartialExemption)}>
        <label className="field">
          <span>
            Fondstyp (Teilfreistellung)
            <InfoTip text={TIP_TEILFREISTELLUNG} />
          </span>
          <select
            value={etf.equityPartialExemption}
            onChange={(e) => {
              const val = Number(e.target.value)
              onAssumptionsChange((cur) => ({
                ...cur,
                etf: { ...cur.etf, equityPartialExemption: val },
              }))
            }}
          >
            {EXEMPTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </FieldWithProv>
    </>
  )
}

function BavFields({ assumptions, onAssumptionsChange }: FieldProps) {
  const { bav } = assumptions
  const def = defaultAssumptions.bav
  const totalFee = bav.fees.wrapperAssetFee + bav.fees.fundAssetFee
  const defTotalFee = def.fees.wrapperAssetFee + def.fees.fundAssetFee

  return (
    <>
      <FieldWithProv modified={diff(bav.monthlyGrossConversion, def.monthlyGrossConversion)}>
        <NumberField
          label="Brutto-Umwandlung"
          value={bav.monthlyGrossConversion}
          min={0}
          max={2000}
          step={25}
          suffix="€"
          onCommit={(v) => {
            const val = Math.min(2000, Math.max(0, Number(v)))
            onAssumptionsChange((cur) => ({
              ...cur,
              bav: { ...cur.bav, monthlyGrossConversion: val },
            }))
          }}
        />
      </FieldWithProv>
      <FieldWithProv modified={diff(bavTotalMatchPct(bav), bavTotalMatchPct(def))}>
        <NumberField
          label="AG-Zuschuss (gesamt)"
          value={bavTotalMatchPct(bav)}
          min={STATUTORY_BAV_SUBSIDY_PCT}
          max={100}
          step={5}
          suffix="%"
          onCommit={(v) => {
            const totalPct = Math.min(100, Math.max(STATUTORY_BAV_SUBSIDY_PCT, Number(v)))
            const split = applyBavTotalMatch(totalPct)
            onAssumptionsChange((cur) => ({
              ...cur,
              bav: { ...cur.bav, ...split },
            }))
          }}
        />
      </FieldWithProv>
      {bav.payoutMode === 'leibrente' && (
        <FieldWithProv
          modified={diff(bav.rentenfaktor, def.rentenfaktor)}
          isModel
          isConfirmed={bav.rentenfaktorConfirmed}
          onConfirmToggle={() =>
            onAssumptionsChange((cur) => ({
              ...cur,
              bav: { ...cur.bav, rentenfaktorConfirmed: !cur.bav.rentenfaktorConfirmed },
            }))
          }
        >
          <NumberField
            label="Rentenfaktor"
            labelSuffix={<InfoTip text={TIP_RENTENFAKTOR} />}
            value={bav.rentenfaktor}
            min={10}
            max={50}
            step={0.5}
            suffix="€/10k"
            onCommit={(v) => {
              const val = Math.min(50, Math.max(10, Number(v)))
              onAssumptionsChange((cur) => ({
                ...cur,
                bav: { ...cur.bav, rentenfaktor: val },
              }))
            }}
          />
        </FieldWithProv>
      )}
      <FieldWithProv modified={diff(totalFee, defTotalFee)}>
        <NumberField
          label="Gesamtkosten p.a."
          value={totalFee * 100}
          min={0}
          max={5}
          step={0.05}
          suffix="%"
          onCommit={(v) => {
            const pct = Math.min(5, Math.max(0, Number(v))) / 100
            onAssumptionsChange((cur) => ({
              ...cur,
              bav: {
                ...cur.bav,
                fees: { ...cur.bav.fees, wrapperAssetFee: pct, fundAssetFee: 0 },
              },
            }))
          }}
        />
        <p className="pec-fee-hint">Detailaufschlüsselung: Eingaben → Erweitert</p>
      </FieldWithProv>
    </>
  )
}

function InsuranceFields({ assumptions, onAssumptionsChange }: FieldProps) {
  const { insurance } = assumptions
  const def = defaultAssumptions.insurance
  const totalFee = insurance.fees.wrapperAssetFee + insurance.fees.fundAssetFee
  const defTotalFee = def.fees.wrapperAssetFee + def.fees.fundAssetFee

  return (
    <>
      <FieldWithProv modified={diff(insurance.contractStartYear, def.contractStartYear)}>
        <NumberField
          label="Vertragsbeginn (Jahr)"
          value={insurance.contractStartYear}
          min={1990}
          max={2030}
          step={1}
          onCommit={(v) => {
            const val = Math.min(2030, Math.max(1990, Number(v)))
            onAssumptionsChange((cur) => ({
              ...cur,
              insurance: { ...cur.insurance, contractStartYear: val },
            }))
          }}
        />
      </FieldWithProv>
      {insurance.payoutMode === 'leibrente' && (
        <FieldWithProv
          modified={diff(insurance.rentenfaktor, def.rentenfaktor)}
          isModel
          isConfirmed={insurance.rentenfaktorConfirmed}
          onConfirmToggle={() =>
            onAssumptionsChange((cur) => ({
              ...cur,
              insurance: {
                ...cur.insurance,
                rentenfaktorConfirmed: !cur.insurance.rentenfaktorConfirmed,
              },
            }))
          }
        >
          <NumberField
            label="Rentenfaktor"
            labelSuffix={<InfoTip text={TIP_RENTENFAKTOR} />}
            value={insurance.rentenfaktor}
            min={10}
            max={50}
            step={0.5}
            suffix="€/10k"
            onCommit={(v) => {
              const val = Math.min(50, Math.max(10, Number(v)))
              onAssumptionsChange((cur) => ({
                ...cur,
                insurance: { ...cur.insurance, rentenfaktor: val },
              }))
            }}
          />
        </FieldWithProv>
      )}
      <FieldWithProv modified={diff(totalFee, defTotalFee)}>
        <NumberField
          label="Gesamtkosten p.a."
          value={totalFee * 100}
          min={0}
          max={5}
          step={0.05}
          suffix="%"
          onCommit={(v) => {
            const pct = Math.min(5, Math.max(0, Number(v))) / 100
            onAssumptionsChange((cur) => ({
              ...cur,
              insurance: {
                ...cur.insurance,
                fees: { ...cur.insurance.fees, wrapperAssetFee: pct, fundAssetFee: 0 },
              },
            }))
          }}
        />
        <p className="pec-fee-hint">Detailaufschlüsselung: Eingaben → Erweitert</p>
      </FieldWithProv>
    </>
  )
}

function BasisrenteFields({ assumptions, onAssumptionsChange }: FieldProps) {
  const { basisrente } = assumptions
  const def = defaultAssumptions.basisrente
  const totalFee = basisrente.fees.wrapperAssetFee + basisrente.fees.fundAssetFee
  const defTotalFee = def.fees.wrapperAssetFee + def.fees.fundAssetFee

  return (
    <>
      <FieldWithProv
        modified={diff(basisrente.monthlyGrossContribution, def.monthlyGrossContribution)}
      >
        <NumberField
          label="Monatsbeitrag"
          value={basisrente.monthlyGrossContribution}
          min={0}
          max={3000}
          step={25}
          suffix="€"
          onCommit={(v) => {
            const val = Math.min(3000, Math.max(0, Number(v)))
            onAssumptionsChange((cur) => ({
              ...cur,
              basisrente: { ...cur.basisrente, monthlyGrossContribution: val },
            }))
          }}
        />
      </FieldWithProv>
      <FieldWithProv
        modified={diff(basisrente.rentenfaktor, def.rentenfaktor)}
        isModel
        isConfirmed={basisrente.rentenfaktorConfirmed}
        onConfirmToggle={() =>
          onAssumptionsChange((cur) => ({
            ...cur,
            basisrente: {
              ...cur.basisrente,
              rentenfaktorConfirmed: !cur.basisrente.rentenfaktorConfirmed,
            },
          }))
        }
      >
        <NumberField
          label="Rentenfaktor"
          labelSuffix={<InfoTip text={TIP_RENTENFAKTOR} />}
          value={basisrente.rentenfaktor}
          min={10}
          max={50}
          step={0.5}
          suffix="€/10k"
          onCommit={(v) => {
            const val = Math.min(50, Math.max(10, Number(v)))
            onAssumptionsChange((cur) => ({
              ...cur,
              basisrente: { ...cur.basisrente, rentenfaktor: val },
            }))
          }}
        />
      </FieldWithProv>
      <FieldWithProv modified={diff(totalFee, defTotalFee)}>
        <NumberField
          label="Gesamtkosten p.a."
          value={totalFee * 100}
          min={0}
          max={5}
          step={0.05}
          suffix="%"
          onCommit={(v) => {
            const pct = Math.min(5, Math.max(0, Number(v))) / 100
            onAssumptionsChange((cur) => ({
              ...cur,
              basisrente: {
                ...cur.basisrente,
                fees: { ...cur.basisrente.fees, wrapperAssetFee: pct, fundAssetFee: 0 },
              },
            }))
          }}
        />
        <p className="pec-fee-hint">Detailaufschlüsselung: Eingaben → Erweitert</p>
      </FieldWithProv>
    </>
  )
}

function AvdFields({ assumptions, onAssumptionsChange }: FieldProps) {
  const { altersvorsorgedepot } = assumptions
  const def = defaultAssumptions.altersvorsorgedepot

  return (
    <FieldWithProv
      modified={diff(altersvorsorgedepot.monthlyOwnContribution, def.monthlyOwnContribution)}
    >
      <NumberField
        label="Eigenbeitrag"
        value={altersvorsorgedepot.monthlyOwnContribution}
        min={0}
        max={3000}
        step={25}
        suffix="€"
        onCommit={(v) => {
          const val = Math.min(3000, Math.max(0, Number(v)))
          onAssumptionsChange((cur) => ({
            ...cur,
            altersvorsorgedepot: { ...cur.altersvorsorgedepot, monthlyOwnContribution: val },
          }))
        }}
      />
    </FieldWithProv>
  )
}

function RiesterFields({ assumptions, onAssumptionsChange }: FieldProps) {
  const { riester } = assumptions
  const def = defaultAssumptions.riester

  return (
    <>
      <FieldWithProv modified={diff(riester.monthlyOwnContribution, def.monthlyOwnContribution)}>
        <NumberField
          label="Eigenbeitrag"
          value={riester.monthlyOwnContribution}
          min={0}
          max={3000}
          step={25}
          suffix="€"
          onCommit={(v) => {
            const val = Math.min(3000, Math.max(0, Number(v)))
            onAssumptionsChange((cur) => ({
              ...cur,
              riester: { ...cur.riester, monthlyOwnContribution: val },
            }))
          }}
        />
      </FieldWithProv>
      {riester.payoutMode === 'leibrente' && (
        <FieldWithProv
          modified={diff(riester.rentenfaktor, def.rentenfaktor)}
          isModel
          isConfirmed={riester.rentenfaktorConfirmed}
          onConfirmToggle={() =>
            onAssumptionsChange((cur) => ({
              ...cur,
              riester: {
                ...cur.riester,
                rentenfaktorConfirmed: !cur.riester.rentenfaktorConfirmed,
              },
            }))
          }
        >
          <NumberField
            label="Rentenfaktor"
            labelSuffix={<InfoTip text={TIP_RENTENFAKTOR} />}
            value={riester.rentenfaktor}
            min={10}
            max={50}
            step={0.5}
            suffix="€/10k"
            onCommit={(v) => {
              const val = Math.min(50, Math.max(10, Number(v)))
              onAssumptionsChange((cur) => ({
                ...cur,
                riester: { ...cur.riester, rentenfaktor: val },
              }))
            }}
          />
        </FieldWithProv>
      )}
    </>
  )
}
