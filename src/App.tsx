import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Calculator, Coins, RotateCcw, Settings, TrendingUp } from 'lucide-react'
import type { BavFundingResult, PersonalProfile, ProductId, ProductResult, ScenarioAssumptions } from './domain/types'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { afterTaxInvestmentCapital } from './engine/projections'
import { simulateRetirementComparison } from './engine/simulate'
import { de2026Rules } from './rules/de2026'
import { formatCurrency, formatNumber, formatPercent } from './utils/format'
import './App.css'

const STORAGE_KEY = 'rentenrechner-state-v1'

function loadSavedState(): { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { profile?: unknown; assumptions?: unknown }
    if (!parsed.profile || !parsed.assumptions) return null
    return {
      profile: parsed.profile as PersonalProfile,
      assumptions: parsed.assumptions as ScenarioAssumptions,
    }
  } catch {
    return null
  }
}

type WarningStatus = 'implementiert' | 'vereinfacht' | 'nicht-modelliert'

const warnings: { category: string; status: WarningStatus; note: string }[] = [
  {
    category: '2026 Steuerregeln',
    status: 'implementiert',
    note: 'EStG §32a Tarif, SV-Beiträge 2026, bAV §3 Nr. 63 EStG. KV-Freibetrag §226(2) SGB V und PV-Freigrenze §57(1) SGB XI für Versorgungsbezüge. (#32)',
  },
  {
    category: 'bAV-Förderung',
    status: 'implementiert',
    note: 'Entgeltumwandlung, Steuer- und SV-Ersparnis, AG-Pflicht- und Extra-Zuschuss.',
  },
  {
    category: 'Lohnsteuer-Engine',
    status: 'implementiert',
    note: 'BMF-PAP 2026 Vorsorgepauschale (RV + GKV + PV, ohne AV) für Steuerklasse I / GKV. Kirchensteuer und PKV nicht modelliert.',
  },
  {
    category: 'ETF-Vorabpauschale',
    status: 'implementiert',
    note: 'Jährliche Vorabpauschale nach InvStG §18 (Basisertrag = Jahresanfangswert × Basiszins × 0,7; begrenzt auf tatsächliches Jahreswachstum); Sparerpauschbetrag 1.000 EUR p.a. angesetzt; vorausgezahlte VP mindert den Veräußerungsgewinn bei Entnahme (§19 InvStG). Basiszins 2026: 3,20 % (BMF-Schreiben 2026-01-13). (#7, #31)',
  },
  {
    category: 'ETF-Sparerpauschbetrag',
    status: 'implementiert',
    note: '1.000 EUR/Jahr in der Ansparphase auf Vorabpauschale; 1.000 EUR/Jahr in der Entnahmephase auf laufende Gewinne. Teilfreistellung (InvStG §20) konfigurierbar. Kein Pauschbetrag auf das Einmalkapital. (#7, #20)',
  },
  {
    category: 'Versicherungssteuer',
    status: 'vereinfacht',
    note: 'Nur steuerfrei/normal – kein Halbeinkünfteverfahren, kein detailliertes Vertragsmodell. (#8)',
  },
  {
    category: 'bAV Rentenphase',
    status: 'vereinfacht',
    note: 'Einkommensteuer auf bAV-Rente ohne weiteres Renteneinkommen; KVdR nicht konfigurierbar. (#6)',
  },
  {
    category: 'bAV Kapitalabfindung',
    status: 'nicht-modelliert',
    note: '1/120-KV/PV-Verteilung nach §229 SGB V fehlt; Wert wird bewusst nicht ausgewiesen. (#19)',
  },
  {
    category: 'Gesetzliche Rente',
    status: 'nicht-modelliert',
    note: 'Minderung der RV-Ansprüche durch Entgeltumwandlung nicht eingerechnet. (#5)',
  },
  {
    category: 'Rendite-Szenarien',
    status: 'vereinfacht',
    note: 'Feste Rendite, keine stochastische Simulation. Planrechnungen, keine Prognosen.',
  },
]

const badgeLabel: Record<WarningStatus, string> = {
  implementiert: '✓ implementiert',
  vereinfacht: '⚠ vereinfacht',
  'nicht-modelliert': '✗ nicht modelliert',
}

const productColors: Record<string, string> = {
  etf: '#2563eb',
  bav: '#0f766e',
  versicherung: '#b45309',
}

const productOrder = ['etf', 'bav', 'versicherung']

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function updateNumber<T extends object>(
  setter: React.Dispatch<React.SetStateAction<T>>,
  key: keyof T,
  value: string,
) {
  setter((current) => ({
    ...current,
    [key]: Number(value),
  }))
}

function ResultMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  onChange: (value: string) => void
}) {
  const displayValue = Number.isFinite(value) ? Number(value.toFixed(6)).toString() : '0'

  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-shell">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={displayValue}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <em>{suffix}</em> : null}
      </div>
    </label>
  )
}

function bestResult<T extends ProductResult>(results: T[], selector: (result: T) => number) {
  return results.reduce((best, result) => (selector(result) > selector(best) ? result : best))
}

function BavWaterfall({ f }: { f: BavFundingResult }) {
  const monthlyTaxSavings =
    (f.salaryWithoutBav.incomeTax + f.salaryWithoutBav.solidarityTax -
      f.salaryWithBav.incomeTax - f.salaryWithBav.solidarityTax) / 12
  const monthlySvSavings = (f.salaryWithoutBav.social.total - f.salaryWithBav.social.total) / 12

  return (
    <div className="bav-waterfall">
      <h3>bAV-Förderung im Überblick</h3>
      <dl>
        <div className="wf-row wf-base">
          <dt>Bruttoumwandlung</dt>
          <dd>{formatCurrency(f.monthlyGrossConversion, 0)}</dd>
        </div>
        <div className="wf-row wf-minus">
          <dt>− Steuerersparnis</dt>
          <dd>{formatCurrency(monthlyTaxSavings, 0)}</dd>
        </div>
        <div className="wf-row wf-minus">
          <dt>− SV-Ersparnis</dt>
          <dd>{formatCurrency(monthlySvSavings, 0)}</dd>
        </div>
        <div className="wf-row wf-result">
          <dt>= Nettoaufwand AN</dt>
          <dd>{formatCurrency(f.monthlyNetCost, 0)}</dd>
        </div>
        <div className="wf-row wf-plus">
          <dt>+ AG-Zuschuss</dt>
          <dd>{formatCurrency(f.monthlyEmployerContribution, 0)}</dd>
        </div>
        <div className="wf-row wf-total">
          <dt>= Monatl. Beitrag</dt>
          <dd>{formatCurrency(f.monthlyGrossConversion + f.monthlyEmployerContribution, 0)}</dd>
        </div>
      </dl>
    </div>
  )
}

function App() {
  const [profile, setProfile] = useState<PersonalProfile>(
    () => loadSavedState()?.profile ?? defaultProfile,
  )
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(
    () => loadSavedState()?.assumptions ?? defaultAssumptions,
  )
  const [selectedScenarioId, setSelectedScenarioId] = useState('basis')
  const [showRealValues, setShowRealValues] = useState(true)
  const [cashflowProductId, setCashflowProductId] = useState<ProductId>('bav')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile, assumptions }))
  }, [profile, assumptions])

  function resetToDefaults() {
    setProfile(defaultProfile)
    setAssumptions(defaultAssumptions)
  }

  const simulation = useMemo(
    () => simulateRetirementComparison(profile, assumptions, de2026Rules),
    [profile, assumptions],
  )
  const employerContributionContractPct =
    (de2026Rules.bav.statutoryEmployerSubsidyPct +
      assumptions.bav.extraEmployerContributionPct) *
    100
  const selectedScenario = assumptions.returnScenarios.find(
    (scenario) => scenario.id === selectedScenarioId,
  )
  const selectedResults = simulation.products
    .filter((product) => product.scenarioId === selectedScenarioId)
    .sort((a, b) => productOrder.indexOf(a.productId) - productOrder.indexOf(b.productId))
  const capitalChartData = selectedResults[0]?.rows.map((row) => {
    const point: Record<string, string | number> = {
      age: row.age,
      year: row.year,
    }

    selectedResults.forEach((result) => {
      const matchingRow = result.rows.find((candidate) => candidate.year === row.year)
      point[result.label] = showRealValues
        ? matchingRow?.realBalance ?? 0
        : matchingRow?.balance ?? 0
    })

    return point
  })
  const pensionBars = selectedResults.map((result) => ({
    name: result.label,
    value: result.netMonthlyPayout,
    fill: productColors[result.productId],
  }))
  const comparableCapitalResults = selectedResults.filter(
    (result): result is ProductResult & { afterTaxLumpSum: number } =>
      result.afterTaxLumpSum !== null,
  )
  const bestCapital = comparableCapitalResults.length
    ? bestResult(comparableCapitalResults, (result) => result.afterTaxLumpSum)
    : undefined
  const bestPension = selectedResults.length
    ? bestResult(selectedResults, (result) => result.netMonthlyPayout)
    : undefined
  const cashflowResult = selectedResults.find((r) => r.productId === cashflowProductId)
  const cashflowAnnualTaxSvSavings =
    cashflowProductId === 'bav' ? simulation.bavFunding.annualTaxAndSvSavings : 0

  function rowAfterTaxBalance(
    balance: number,
    cumulativeContributions: number,
    cumulativeVorabpauschale: number,
  ): number | null {
    if (cashflowProductId === 'bav') return null
    if (cashflowProductId === 'etf') {
      return afterTaxInvestmentCapital(
        balance,
        cumulativeContributions,
        de2026Rules,
        assumptions.etf.equityPartialExemption,
        cumulativeVorabpauschale,
      )
    }
    if (assumptions.insurance.taxMode === 'steuerfrei') return balance
    return afterTaxInvestmentCapital(balance, cumulativeContributions, de2026Rules, 0)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p>Rentenrechner Deutschland 2026</p>
          <h1>ETF, bAV und private Versicherung vergleichen</h1>
        </div>
        <div className="topbar-badge">
          <Calculator size={18} aria-hidden="true" />
          <span>Persönliches v1-Modell</span>
        </div>
      </header>

      <section className="dashboard">
        <aside className="input-panel" aria-label="Eingaben">
          <div className="panel-heading">
            <Settings size={18} aria-hidden="true" />
            <h2>Eingaben</h2>
            <button
              type="button"
              className="reset-btn"
              title="Auf Standardwerte zurücksetzen"
              onClick={resetToDefaults}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset
            </button>
          </div>

          <div className="field-grid">
            <NumberField
              label="Alter"
              value={profile.age}
              min={18}
              max={profile.retirementAge - 1}
              suffix="Jahre"
              onChange={(value) =>
                setProfile((current) => ({
                  ...current,
                  age: clampNumber(Number(value), 18, current.retirementAge - 1),
                }))
              }
            />
            <NumberField
              label="Rentenbeginn"
              value={profile.retirementAge}
              min={Math.max(55, profile.age + 1)}
              max={75}
              suffix="Jahre"
              onChange={(value) =>
                setProfile((current) => ({
                  ...current,
                  retirementAge: clampNumber(Number(value), current.age + 1, 75),
                }))
              }
            />
            <NumberField
              label="Jahresbrutto"
              value={profile.grossSalaryYear}
              min={0}
              step={500}
              suffix="EUR"
              onChange={(value) => updateNumber(setProfile, 'grossSalaryYear', value)}
            />
            <NumberField
              label="GKV-Zusatzbeitrag"
              value={profile.healthAdditionalContributionPct}
              min={0}
              max={5}
              step={0.1}
              suffix="%"
              onChange={(value) =>
                updateNumber(setProfile, 'healthAdditionalContributionPct', value)
              }
            />
          </div>

          <div className="divider" />

          <div className="field-grid">
            <NumberField
              label="bAV Entgeltumwandlung"
              value={assumptions.bav.monthlyGrossConversion}
              min={0}
              step={25}
              suffix="EUR mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: { ...current.bav, monthlyGrossConversion: Number(value) },
                }))
              }
            />
            <NumberField
              label="AG-Zuschuss Vertrag"
              value={employerContributionContractPct}
              min={0}
              max={100}
              step={1}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    extraEmployerContributionPct: Math.max(
                      0,
                      Number(value) / 100 - de2026Rules.bav.statutoryEmployerSubsidyPct,
                    ),
                  },
                }))
              }
            />
          </div>

          <BavWaterfall f={simulation.bavFunding} />

          <div className="divider" />

          <div className="field-grid">
            <NumberField
              label="ETF TER"
              value={assumptions.etf.annualAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  etf: { ...current.etf, annualAssetFee: Number(value) / 100 },
                }))
              }
            />
            <label className="field">
              <span>ETF-Fondsart (InvStG §20)</span>
              <select
                value={assumptions.etf.equityPartialExemption}
                onChange={(event) =>
                  setAssumptions((current) => ({
                    ...current,
                    etf: { ...current.etf, equityPartialExemption: Number(event.target.value) },
                  }))
                }
              >
                <option value={0.3}>Aktienfonds (30% steuerfrei)</option>
                <option value={0.15}>Mischfonds (15% steuerfrei)</option>
                <option value={0.6}>Inl. Immobilienfonds (60% steuerfrei)</option>
                <option value={0.8}>Ausl. Immobilienfonds (80% steuerfrei)</option>
                <option value={0}>Anleihe-ETF / Sonstige (0% steuerfrei)</option>
              </select>
            </label>
            <NumberField
              label="Inflation"
              value={assumptions.inflationRate * 100}
              min={0}
              max={8}
              step={0.1}
              suffix="% p.a."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  inflationRate: Number(value) / 100,
                }))
              }
            />
            <NumberField
              label="Kapitalverzehr bis"
              value={assumptions.retirementEndAge}
              min={profile.retirementAge + 1}
              max={110}
              step={1}
              suffix="Jahre"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  retirementEndAge: clampNumber(Number(value), profile.retirementAge + 1, 110),
                }))
              }
            />
          </div>

          <div className="subsection-heading">
            <h3>bAV-Kosten</h3>
            <p>Benchmarkwerte: beitragsbezogene Kosten plus Kapital- und Abschlusskosten.</p>
          </div>

          <div className="field-grid">
            <NumberField
              label="Fixkosten je Monat"
              value={assumptions.bav.fees.fixedMonthlyFee}
              min={0}
              max={50}
              step={0.5}
              suffix="EUR"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, fixedMonthlyFee: Number(value) },
                  },
                }))
              }
            />
            <NumberField
              label="Kosten je Beitrag"
              value={assumptions.bav.fees.contributionFee * 100}
              min={0}
              max={20}
              step={0.25}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, contributionFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Kapitalgebühr"
              value={assumptions.bav.fees.annualAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, annualAssetFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Abschlusskosten"
              value={assumptions.bav.fees.acquisitionCostPct * 100}
              min={0}
              max={8}
              step={0.25}
              suffix="% Summe"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, acquisitionCostPct: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Verteilung Abschlusskosten"
              value={assumptions.bav.fees.acquisitionCostSpreadYears}
              min={1}
              max={15}
              step={1}
              suffix="Jahre"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: {
                      ...current.bav.fees,
                      acquisitionCostSpreadYears: Number(value),
                    },
                  },
                }))
              }
            />
          </div>

          <div className="return-editor">
            <h3>Rendite-Szenarien</h3>
            {assumptions.returnScenarios.map((scenario, index) => (
              <NumberField
                key={scenario.id}
                label={scenario.label}
                value={scenario.annualReturn * 100}
                min={-5}
                max={12}
                step={0.25}
                suffix="%"
                onChange={(value) =>
                  setAssumptions((current) => {
                    const nextScenarios = [...current.returnScenarios]
                    nextScenarios[index] = {
                      ...scenario,
                      annualReturn: Number(value) / 100,
                    }
                    return { ...current, returnScenarios: nextScenarios }
                  })
                }
              />
            ))}
          </div>

          <label className="field">
            <span>Besteuerung private Versicherung</span>
            <select
              value={assumptions.insurance.taxMode}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    taxMode: event.target.value === 'steuerfrei' ? 'steuerfrei' : 'normal',
                  },
                }))
              }
            >
              <option value="normal">normal besteuert (Abgeltungsteuer 25%)</option>
              <option value="steuerfrei">steuerfrei (Halbeinkünfteverfahren)</option>
            </select>
            <small className="field-hint">
              {assumptions.insurance.taxMode === 'steuerfrei'
                ? 'Gilt für Verträge ab 2005 mit ≥ 12 Jahren Laufzeit und Auszahlung ab 62 Jahren (§20 Abs. 1 Nr. 6 EStG) – nur die Hälfte des Ertrags ist steuerpflichtig.'
                : 'Gilt für Verträge ab 2005 ohne Halbeinkünfte-Voraussetzungen. Kursgewinne unterliegen der Abgeltungsteuer (25% + Soli).'}
            </small>
          </label>

          <div className="subsection-heading">
            <h3>pAV-Kosten</h3>
            <p>Private Versicherung: gleiche Kostenlogik, separat konfigurierbar.</p>
          </div>

          <div className="field-grid">
            <NumberField
              label="Fixkosten je Monat"
              value={assumptions.insurance.fees.fixedMonthlyFee}
              min={0}
              max={50}
              step={0.5}
              suffix="EUR"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    fees: { ...current.insurance.fees, fixedMonthlyFee: Number(value) },
                  },
                }))
              }
            />
            <NumberField
              label="Kosten je Beitrag"
              value={assumptions.insurance.fees.contributionFee * 100}
              min={0}
              max={20}
              step={0.25}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    fees: { ...current.insurance.fees, contributionFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Kapitalgebühr"
              value={assumptions.insurance.fees.annualAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    fees: { ...current.insurance.fees, annualAssetFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Abschlusskosten"
              value={assumptions.insurance.fees.acquisitionCostPct * 100}
              min={0}
              max={8}
              step={0.25}
              suffix="% Summe"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    fees: { ...current.insurance.fees, acquisitionCostPct: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Verteilung Abschlusskosten"
              value={assumptions.insurance.fees.acquisitionCostSpreadYears}
              min={1}
              max={15}
              step={1}
              suffix="Jahre"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    fees: {
                      ...current.insurance.fees,
                      acquisitionCostSpreadYears: Number(value),
                    },
                  },
                }))
              }
            />
          </div>
        </aside>

        <section className="main-panel">
          <div className="toolbar">
            <div className="segmented" aria-label="Rendite-Szenario auswählen">
              {assumptions.returnScenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  className={scenario.id === selectedScenarioId ? 'active' : ''}
                  onClick={() => setSelectedScenarioId(scenario.id)}
                >
                  {scenario.label} {formatPercent(scenario.annualReturn)}
                </button>
              ))}
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showRealValues}
                onChange={(event) => setShowRealValues(event.target.checked)}
              />
              inflationsbereinigt
            </label>
          </div>

          <section className="summary-grid" aria-label="Kennzahlen">
            <ResultMetric
              label="bAV Nettoaufwand"
              value={formatCurrency(simulation.bavFunding.monthlyNetCost, 0)}
              detail={`${formatCurrency(
                simulation.bavFunding.monthlyGrossConversion +
                  simulation.bavFunding.monthlyEmployerContribution,
                0,
              )} Beitrag mtl.`}
            />
            <ResultMetric
              label="Mindest-AG-Zuschuss"
              value={formatCurrency(simulation.bavFunding.monthlyMandatoryEmployerSubsidy, 0)}
              detail="begrenzt durch SV-Ersparnis"
            />
            <ResultMetric
              label="Bestes Kapital"
              value={bestCapital ? formatCurrency(bestCapital.afterTaxLumpSum, 0) : '-'}
              detail={bestCapital?.label}
            />
            <ResultMetric
              label="Beste Netto-Rente"
              value={bestPension ? formatCurrency(bestPension.netMonthlyPayout, 0) : '-'}
              detail={bestPension?.label}
            />
          </section>

          <section className="chart-panel">
            <div className="section-heading">
              <TrendingUp size={18} aria-hidden="true" />
              <div>
                <h2>Vermögen bis Rentenbeginn</h2>
                <p>
                  {selectedScenario?.label} mit {selectedScenario
                    ? formatPercent(selectedScenario.annualReturn)
                    : ''}{' '}
                  Rendite p.a.
                </p>
              </div>
            </div>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={capitalChartData}>
                  <CartesianGrid strokeDasharray="4 4" />
                  <XAxis dataKey="age" tickLine={false} />
                  <YAxis
                    tickFormatter={(value) => `${formatNumber(Number(value) / 1_000)}k`}
                    width={64}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value), 0)}
                    labelFormatter={(age) => `Alter ${age}`}
                  />
                  <Legend />
                  {selectedResults.map((result) => (
                    <Line
                      key={result.productId}
                      type="monotone"
                      dataKey={result.label}
                      stroke={productColors[result.productId]}
                      strokeWidth={3}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="split-panels">
            <div className="chart-panel compact">
              <div className="section-heading">
                <Coins size={18} aria-hidden="true" />
                <div>
                  <h2>Monatliche Netto-Rente</h2>
                  <p>Kapitalverzehr bis Alter {assumptions.retirementEndAge}</p>
                </div>
              </div>
              <div className="chart-frame small">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pensionBars} margin={{ top: 12, right: 8, left: 0, bottom: 18 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} />
                    <YAxis
                      tickFormatter={(value) => `${formatNumber(Number(value))}`}
                      width={54}
                    />
                    <Tooltip formatter={(value) => formatCurrency(Number(value), 0)} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="assumption-panel">
              <h2>Annahmen zur Fairness</h2>
              <p>
                ETF und private Versicherung investieren standardmäßig denselben monatlichen
                Nettoaufwand wie die bAV. Dadurch wird die bAV gegen die echte Belastung aus deinem
                Nettogehalt verglichen.
              </p>
              <dl>
                <div>
                  <dt>Steuerprofil</dt>
                  <dd>Klasse I, keine Kinder, keine Kirchensteuer</dd>
                </div>
                <div>
                  <dt>GKV</dt>
                  <dd>öffentlich, Zusatzbeitrag {profile.healthAdditionalContributionPct}%</dd>
                </div>
                <div>
                  <dt>Steuervereinfachungen</dt>
                  <dd>
                    ETF-Einmalkapital ohne Sparerpauschbetrag; ETF-Entnahme mit jährlichem
                    Sparerpauschbetrag. bAV-Einmalkapital wird wegen 1/120-Regel noch nicht
                    ausgewiesen.
                  </dd>
                </div>
                <div>
                  <dt>Rechtsstand</dt>
                  <dd>DE 2026, konfigurierbare Regeldatei</dd>
                </div>
                <div>
                  <dt>bAV-Kostenbenchmark</dt>
                  <dd>
                    {formatPercent(assumptions.bav.fees.contributionFee)} je Beitrag,{' '}
                    {formatPercent(assumptions.bav.fees.annualAssetFee)} p.a. Kapitalgebühr,{' '}
                    {formatPercent(assumptions.bav.fees.acquisitionCostPct)} Abschlusskosten
                  </dd>
                </div>
                <div>
                  <dt>pAV-Kostenbenchmark</dt>
                  <dd>
                    {formatPercent(assumptions.insurance.fees.contributionFee)} je Beitrag,{' '}
                    {formatCurrency(assumptions.insurance.fees.fixedMonthlyFee, 1)} mtl.,{' '}
                    {formatPercent(assumptions.insurance.fees.annualAssetFee)} p.a. Kapitalgebühr
                  </dd>
                </div>
                <div>
                  <dt>bAV-Beitragsklassifizierung</dt>
                  <dd>
                    {(() => {
                      const f = simulation.bavFunding
                      const taxFreeMonthly = de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap / 12
                      const svFreeMonthly = de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.socialSecurityFreePctOfPensionCap / 12
                      const totalMonthly = f.totalBavContributionAnnual / 12
                      if (f.taxableOverflowAnnual === 0 && f.svLiableOverflowAnnual === 0) {
                        return (
                          <>
                            Gesamt {formatCurrency(totalMonthly, 0)} mtl. — vollständig steuer-
                            und SV-frei (Limit: {formatCurrency(svFreeMonthly, 0)} / {formatCurrency(taxFreeMonthly, 0)} mtl.)
                          </>
                        )
                      }
                      return (
                        <>
                          Gesamt {formatCurrency(totalMonthly, 0)} mtl.
                          {f.svLiableOverflowAnnual > 0 && (
                            <> · SV-pflichtig: {formatCurrency(f.svLiableOverflowAnnual / 12, 0)} mtl. (über 4%-BBG {formatCurrency(svFreeMonthly, 0)})</>
                          )}
                          {f.taxableOverflowAnnual > 0 && (
                            <> · Steuerpflichtig: {formatCurrency(f.taxableOverflowAnnual / 12, 0)} mtl. (über 8%-BBG {formatCurrency(taxFreeMonthly, 0)})</>
                          )}
                        </>
                      )
                    })()}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="warnings-panel">
            <h2>Berechnungshinweise</h2>
            <div className="warnings-grid">
              {warnings.map((w) => (
                <div key={w.category} className="warning-item">
                  <div className="warning-item-header">
                    <span className="warning-item-category">{w.category}</span>
                    <span className={`badge badge-${w.status}`}>{badgeLabel[w.status]}</span>
                  </div>
                  <p className="warning-item-note">{w.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="table-panel">
            <h2>Detailvergleich</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Produkt</th>
                    <th>Szenario</th>
                    <th>Nettoaufwand mtl.</th>
                    <th>Beitrag mtl.</th>
                    <th>Kapital</th>
                    <th>Kapital nach Steuer*</th>
                    <th>Netto-Rente</th>
                    <th>Kosten</th>
                    <th>Faktor</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.products.map((result) => (
                    <tr key={`${result.productId}-${result.scenarioId}`}>
                      <td>{result.label}</td>
                      <td>{result.scenarioLabel}</td>
                      <td>{formatCurrency(result.monthlyUserCost, 0)}</td>
                      <td>{formatCurrency(result.monthlyProductContribution, 0)}</td>
                      <td>{formatCurrency(result.capitalAtRetirement, 0)}</td>
                      <td>
                        {result.afterTaxLumpSum === null
                          ? '-'
                          : formatCurrency(result.afterTaxLumpSum, 0)}
                      </td>
                      <td>{formatCurrency(result.netMonthlyPayout, 0)}</td>
                      <td>{formatCurrency(result.totalFees, 0)}</td>
                      <td>
                        {result.valueMultipleOnUserCost === null
                          ? '-'
                          : `${formatNumber(result.valueMultipleOnUserCost, 1)}x`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="table-note">
              *bAV-Einmalkapital wird bewusst nicht ausgewiesen, bis die 1/120-Verteilung der
              KV/PV-Beiträge und die Rentensteuer sauber modelliert sind. Für bAV ist aktuell die
              monatliche Netto-Rente die belastbarere Vergleichsgröße.
            </p>
          </section>

          <section className="table-panel cashflow-panel">
            <div className="cashflow-header">
              <h2>Jahres-Cashflows</h2>
              <div className="cashflow-selector">
                <label htmlFor="cashflow-product">Produkt</label>
                <select
                  id="cashflow-product"
                  value={cashflowProductId}
                  onChange={(event) => setCashflowProductId(event.target.value as ProductId)}
                >
                  {selectedResults.map((r) => (
                    <option key={r.productId} value={r.productId}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {cashflowResult ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Alter</th>
                      <th>Nettoaufwand p.a.</th>
                      <th>Beitrag p.a.</th>
                      <th>AG-Anteil p.a.</th>
                      <th>Steuer-/SV-Ersparnis</th>
                      <th>Gebühren p.a.</th>
                      <th>Kum. Gebühren</th>
                      <th>Kapital</th>
                      <th>Kapital n. St.</th>
                      <th>Reales Kapital</th>
                      <th>Real n. St.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashflowResult.rows.map((row) => {
                      const afterTax = rowAfterTaxBalance(row.balance, row.cumulativeProductContributions, row.cumulativeVorabpauschale)
                      const realAfterTax = afterTax !== null && row.balance > 0
                        ? afterTax * (row.realBalance / row.balance)
                        : null
                      return (
                        <tr key={row.year}>
                          <td style={{ textAlign: 'left' }}>{row.age}</td>
                          <td>{formatCurrency(row.yearlyUserCost, 0)}</td>
                          <td>{formatCurrency(row.yearlyProductContribution, 0)}</td>
                          <td>{formatCurrency(row.yearlyEmployerContribution, 0)}</td>
                          <td>
                            {cashflowAnnualTaxSvSavings > 0
                              ? formatCurrency(cashflowAnnualTaxSvSavings, 0)
                              : '—'}
                          </td>
                          <td>{formatCurrency(row.yearlyFees, 0)}</td>
                          <td>{formatCurrency(row.cumulativeFees, 0)}</td>
                          <td>{formatCurrency(row.balance, 0)}</td>
                          <td>{afterTax !== null ? formatCurrency(afterTax, 0) : '—'}</td>
                          <td>{formatCurrency(row.realBalance, 0)}</td>
                          <td>{realAfterTax !== null ? formatCurrency(realAfterTax, 0) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="totals-row">
                      <td style={{ textAlign: 'left' }}>Gesamt</td>
                      <td>{formatCurrency(cashflowResult.totalUserCost, 0)}</td>
                      <td>{formatCurrency(cashflowResult.totalProductContributions, 0)}</td>
                      <td>{formatCurrency(cashflowResult.totalEmployerContributions, 0)}</td>
                      <td>
                        {cashflowResult.taxAndSvSavings > 0
                          ? formatCurrency(cashflowResult.taxAndSvSavings, 0)
                          : '—'}
                      </td>
                      <td>{formatCurrency(cashflowResult.totalFees, 0)}</td>
                      <td>{formatCurrency(cashflowResult.totalFees, 0)}</td>
                      <td>{formatCurrency(cashflowResult.capitalAtRetirement, 0)}</td>
                      <td>
                        {cashflowResult.afterTaxLumpSum !== null
                          ? formatCurrency(cashflowResult.afterTaxLumpSum, 0)
                          : '—'}
                      </td>
                      <td>{formatCurrency(cashflowResult.realCapitalAtRetirement, 0)}</td>
                      <td>
                        {cashflowResult.afterTaxLumpSum !== null && cashflowResult.capitalAtRetirement > 0
                          ? formatCurrency(
                              cashflowResult.afterTaxLumpSum *
                                (cashflowResult.realCapitalAtRetirement / cashflowResult.capitalAtRetirement),
                              0,
                            )
                          : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
          </section>
        </section>
      </section>
    </main>
  )
}

export default App
