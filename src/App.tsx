import { useMemo, useState } from 'react'
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
import { Calculator, Coins, Settings, TrendingUp } from 'lucide-react'
import type { PersonalProfile, ProductResult, ScenarioAssumptions } from './domain/types'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { simulateRetirementComparison } from './engine/simulate'
import { de2026Rules } from './rules/de2026'
import { formatCurrency, formatNumber, formatPercent } from './utils/format'
import './App.css'

const productColors: Record<string, string> = {
  etf: '#2563eb',
  bav: '#0f766e',
  versicherung: '#b45309',
}

const productOrder = ['etf', 'bav', 'versicherung']

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

function bestResult(results: ProductResult[], selector: (result: ProductResult) => number) {
  return results.reduce((best, result) => (selector(result) > selector(best) ? result : best))
}

function App() {
  const [profile, setProfile] = useState<PersonalProfile>(defaultProfile)
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(defaultAssumptions)
  const [selectedScenarioId, setSelectedScenarioId] = useState('basis')
  const [showRealValues, setShowRealValues] = useState(true)

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
  const bestCapital = selectedResults.length
    ? bestResult(selectedResults, (result) => result.afterTaxLumpSum)
    : undefined
  const bestPension = selectedResults.length
    ? bestResult(selectedResults, (result) => result.netMonthlyPayout)
    : undefined

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
          </div>

          <div className="field-grid">
            <NumberField
              label="Alter"
              value={profile.age}
              min={18}
              max={66}
              suffix="Jahre"
              onChange={(value) => updateNumber(setProfile, 'age', value)}
            />
            <NumberField
              label="Rentenbeginn"
              value={profile.retirementAge}
              min={55}
              max={75}
              suffix="Jahre"
              onChange={(value) => updateNumber(setProfile, 'retirementAge', value)}
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
              <option value="normal">normal besteuert</option>
              <option value="steuerfrei">steuerfrei</option>
            </select>
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
              </dl>
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
                      <td>{formatCurrency(result.afterTaxLumpSum, 0)}</td>
                      <td>{formatCurrency(result.netMonthlyPayout, 0)}</td>
                      <td>{formatCurrency(result.totalFees, 0)}</td>
                      <td>{formatNumber(result.valueMultipleOnUserCost, 1)}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="table-note">
              *Bei bAV ist das eine grobe Einmalzahlungs-Schätzung mit voller Besteuerung sowie
              GKV/PV-Abzug. Für bAV ist die monatliche Netto-Rente derzeit die aussagekräftigere
              Vergleichsgröße.
            </p>
          </section>
        </section>
      </section>
    </main>
  )
}

export default App
