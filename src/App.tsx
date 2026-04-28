import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Calculator, Check, Coins, Download, Link, RotateCcw, Settings, TrendingUp } from 'lucide-react'
import type { AltersvorsorgedepotPayoutMode, AltersvorsorgedepotSubtype, BavDurchfuehrungsweg, BavFundingResult, FeeModel, InsuranceTaxMode, PayoutMode, PersonalProfile, ProductId, ProductResult, RiesterAssumptions, ScenarioAssumptions, StatutoryPensionAssumptions } from './domain/types'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { afterTaxBavLumpSum, afterTaxInsuranceLumpSum, afterTaxInvestmentCapital, deriveBavLumpSumTaxMode, deriveInsuranceTaxMode } from './engine/projections'
import { validateAvdPayoutAge } from './engine/altersvorsorgedepot'
import { careEmployeeRateForChildren } from './engine/salary'
import { computeBavMinimumEntitlement } from './engine/bavWarnings'
import { simulateRetirementComparison } from './engine/simulate'
import { de2026Rules } from './rules/de2026'
import { STORAGE_KEY, buildStateJson, loadSavedState } from './storage'
import { formatCurrency, formatNumber, formatPercent } from './utils/format'
import { buildExportCsv, downloadCsv } from './utils/csvExport'
import { buildShareUrl, readUrlState } from './utils/urlShare'
import './App.css'

type WarningStatus = 'implementiert' | 'vereinfacht' | 'nicht-modelliert'

// #55 / #58: Fee presets for bAV and pAV (all-in configurations for one-click loading).
// Sources: BAV_RESEARCH.md — Allianz/AXA examples, typical ETF-Nettotarif benchmarks.
const BASE_FEE: Pick<FeeModel, 'acquisitionCostSpreadYears'> = { acquisitionCostSpreadYears: 5 }

const BAV_FEE_PRESETS: { label: string; fees: FeeModel }[] = [
  {
    label: 'Nettotarif',
    fees: { wrapperAssetFee: 0.003, fundAssetFee: 0.002, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, pensionPayoutFeePct: 0, ...BASE_FEE },
  },
  {
    label: 'Standard',
    fees: { wrapperAssetFee: 0.006, fundAssetFee: 0.002, contributionFee: 0.045, fixedMonthlyFee: 0, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Hochkosten',
    fees: { wrapperAssetFee: 0.007, fundAssetFee: 0.002, contributionFee: 0.0975, fixedMonthlyFee: 0, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Hoher AG-Match',
    fees: { wrapperAssetFee: 0.007, fundAssetFee: 0.002, contributionFee: 0.045, fixedMonthlyFee: 0, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
]

const PAV_FEE_PRESETS: { label: string; fees: FeeModel }[] = [
  {
    label: 'Nettotarif',
    fees: { wrapperAssetFee: 0.004, fundAssetFee: 0.002, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, pensionPayoutFeePct: 0, ...BASE_FEE },
  },
  {
    label: 'Standard',
    fees: { wrapperAssetFee: 0.007, fundAssetFee: 0.002, contributionFee: 0.045, fixedMonthlyFee: 5, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Hochkosten',
    fees: { wrapperAssetFee: 0.008, fundAssetFee: 0.0025, contributionFee: 0.09, fixedMonthlyFee: 5, acquisitionCostPct: 0.04, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Altvertrag',
    fees: { wrapperAssetFee: 0.012, fundAssetFee: 0.002, contributionFee: 0.03, fixedMonthlyFee: 5, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0, ...BASE_FEE },
  },
]

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
    note: 'BMF-PAP 2026 Vorsorgepauschale (RV + GKV + PV, ohne AV) für Steuerklasse I. PKV: Prämien als KV/PV-Teilbetrag der Vorsorgepauschale (§39b EStG), AG-Zuschuss §257 SGB V steuerfrei (§3 Nr. 62 EStG). Kirchensteuer nicht berechnet (immer 0 %).',
  },
  {
    category: 'ETF-Vorabpauschale',
    status: 'implementiert',
    note: 'Jährliche Vorabpauschale nach InvStG §18; Jahresanfangswert (Vollperiode) + Monatsbeiträge × (verbleibende Monate / 12) als Basisertrag-Bemessungsgrundlage; begrenzt auf tatsächliches Jahreswachstum; Sparerpauschbetrag 1.000 EUR p.a. angesetzt; vorausgezahlte VP mindert den Veräußerungsgewinn bei Entnahme (§19 InvStG). Basiszins 2026: 3,20 % (BMF-Schreiben 2026-01-13), für alle Projektionsjahre konstant angesetzt. (#7, #31, #36)',
  },
  {
    category: 'ETF-Sparerpauschbetrag',
    status: 'implementiert',
    note: '1.000 EUR/Jahr in der Ansparphase auf Vorabpauschale; 1.000 EUR/Jahr in der Entnahmephase auf laufende Gewinne. Teilfreistellung (InvStG §20) konfigurierbar. Kein Pauschbetrag auf das Einmalkapital. (#7, #20)',
  },
  {
    category: 'Versicherungssteuer',
    status: 'implementiert',
    note: 'Steuerbehandlung automatisch aus Vertragsjahr abgeleitet: vor 2005 steuerfrei (§52 Abs. 28 EStG a.F.), ab 2005 mit ≥12 Jahren Laufzeit und Auszahlung ab 62 Halbeinkünfteverfahren (§20 Abs. 1 Nr. 6 EStG – halber Ertrag mit persönlichem Steuersatz), sonst Abgeltungsteuer 25 % + Soli (§20 Abs. 2 EStG). (#38)',
  },
  {
    category: 'bAV Rentenphase',
    status: 'implementiert',
    note: 'Grenzsteuer konfigurierbar; KVdR-/freiwillig-GKV-Toggle: KVdR mit Freibetrag §226(2) SGB V, freiwillig ohne. KV/PV-Aufschlüsselung sichtbar. (#6)',
  },
  {
    category: 'bAV Kapitalabfindung',
    status: 'implementiert',
    note: 'KV/PV nach §229 SGB V 1/120-Verteilung (120 Monate); Auszahlungsbesteuerung wird aus dem Durchführungsweg abgeleitet: §3 Nr. 63 EStG (Direktversicherung, Pensionskasse, Pensionsfonds) → voller Steuersatz §22 Nr. 5 EStG ohne Fünftelregelung; §40b EStG a.F. + Voraussetzungen erfüllt → steuerfrei §52 Abs. 28 EStG a.F.; Direktzusage/U-Kasse → Fünftelregelung §34 Abs. 2 Nr. 4 EStG. PKV-Mitglieder ohne KV/PV-Abzug. (#6/#19/#48)',
  },
  {
    category: 'Gesetzliche Rente',
    status: 'vereinfacht',
    note: 'GRV-Schätzung: Entgeltpunkte × Rentenwert oder manueller Renteninformation-Wert; Steuerpipeline (§22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil) und KV/PV (§249a SGB V KVdR-Halbierung) vollständig modelliert. Vereinfachungen: konstantes Gehalt bis Rente, kein Rentenwert-Wachstum, nur KVdR-Modus. (#72)',
  },
  {
    category: 'Basisrente (Rürup)',
    status: 'vereinfacht',
    note: 'Schicht-1 Deductibility: §10 Abs. 3 EStG Höchstbetrag 30.826 EUR; GRV-Beiträge (AN+AG) reduzieren den Restbetrag; 100% Abzugsfähigkeit (§10 Abs. 3 Satz 1 EStG 2026). Steuerpipeline: §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil (identisch GRV). KV/PV: §240 SGB V (voller GKV-Beitragssatz ohne §226(2)-Freibetrag). Vereinfachungen: freiwillig-Pfad für KV unabhängig vom tatsächlichen GKV-Status im Rentenalter; kein Kapitalwahlrecht modelliert. (#61)',
  },
  {
    category: 'Altersvorsorgedepot (Schicht 2)',
    status: 'vereinfacht',
    note: 'Altersvorsorgereformgesetz (Bundestag 2026-03-27; Bundesrat-Zustimmung erwartet 2026-05-08). Modelliert: Grundzulage (Zweistufenformel, max. 540 EUR), Kinderzulage (100 %, max. 300 EUR/Kind), Berufseinsteiger-Bonus (200 EUR einmalig), indirekter Ehegatte (max. 175 EUR), §10a Günstigerprüfung. Standarddepot-Gleitpfad: 5 Jahre vor Rentenbeginn max. 50 % Risikoanlage, 2 Jahre vor Rentenbeginn max. 30 %. Effektivkosten-Warnung bei > 1,0 pp. Auszahlung: §22 Nr. 5 EStG (volle Progression, kein Besteuerungsanteil), KV/PV freiwillig-Pfad §240 SGB V. Nicht modelliert: Altvertrag-Riester-Fortführung (#62); Wohn-Riester; Kleinbetragsrenten-Kommutierung. Konstanten aus Bundesrat-Drucksache 206/26 — prüfen nach BGBl.-Veröffentlichung. (#66–#71)',
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
  grv: '#16a34a',
  basisrente: '#7c3aed',
  altersvorsorgedepot: '#0e7490',
  riester: '#be185d',
}

const productOrder = ['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester']

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
  onCommit,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  /** Fires on every keystroke. Use for live preview of unconstrained inputs. */
  onChange?: (value: string) => void
  /** Fires on blur or Enter. Use for clamped/validated inputs so partial keystrokes don't trigger range corrections. */
  onCommit?: (value: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const canonical = Number.isFinite(value) ? Number(value.toFixed(6)).toString() : '0'
  const displayValue = draft ?? canonical

  const commit = () => {
    if (draft === null) return
    const raw = draft
    setDraft(null)
    if (!Number.isFinite(Number(raw))) return
    onCommit?.(raw)
  }

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
          onChange={(event) => {
            setDraft(event.target.value)
            onChange?.(event.target.value)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit()
              event.currentTarget.blur()
            }
          }}
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
    () => (readUrlState() ?? loadSavedState())?.profile ?? defaultProfile,
  )
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(
    () => (readUrlState() ?? loadSavedState())?.assumptions ?? defaultAssumptions,
  )
  const [selectedScenarioId, setSelectedScenarioId] = useState('basis')
  const [showRealValues, setShowRealValues] = useState(true)
  const [cashflowProductId, setCashflowProductId] = useState<ProductId>('bav')
  const [tarifgebunden, setTarifgebunden] = useState(false)
  const [showAssumptions, setShowAssumptions] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, buildStateJson(profile, assumptions))
  }, [profile, assumptions])

  function resetToDefaults() {
    setProfile(defaultProfile)
    setAssumptions(defaultAssumptions)
  }

  const simulation = useMemo(
    () => simulateRetirementComparison(profile, assumptions, de2026Rules),
    [profile, assumptions],
  )
  // §1a BetrAVG minimum: 1/160 of annual Bezugsgröße West; maximum: 4% of pension BBG per month
  const { annualMin: bavMinAnnual, monthlyMin: bavMinMonthly } = computeBavMinimumEntitlement(de2026Rules)
  const bavEntitlementMax =
    (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.socialSecurityFreePctOfPensionCap) / 12
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
  const pensionBars = [
    {
      name: 'Gesetzl. Rente',
      value: simulation.statutoryPension.netMonthlyPension,
      fill: productColors.grv,
    },
    ...selectedResults.map((result) => ({
      name: result.label,
      value: result.netMonthlyPayout,
      fill: productColors[result.productId],
    })),
  ]
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

  const insurancePayoutYear = de2026Rules.year + (profile.retirementAge - profile.age)
  const insuranceContractRuntime = insurancePayoutYear - assumptions.insurance.contractStartYear
  const insuranceTaxMode: InsuranceTaxMode = deriveInsuranceTaxMode(
    assumptions.insurance.contractStartYear,
    insuranceContractRuntime,
    profile.retirementAge,
    assumptions.insurance.oldContractTaxFreeEligible,
  )
  // Treat absent kvdrMember (pre-migration state) as true — matches the netBavPayout default parameter
  const kvdrMember = assumptions.bav.kvdrMember !== false
  // #48: bAV lump-sum tax mode derived from Durchführungsweg
  const bavLumpSumTaxMode = deriveBavLumpSumTaxMode(
    assumptions.bav.durchfuehrungsweg,
    assumptions.bav.pre2005EligibleTaxFree,
  )

  function rowAfterTaxBalance(
    balance: number,
    cumulativeContributions: number,
    cumulativeVorabpauschale: number,
  ): number | null {
    if (cashflowProductId === 'bav') {
      return afterTaxBavLumpSum(
        balance,
        profile,
        de2026Rules,
        assumptions.bav.monthlyOtherRetirementIncome * 12,
        kvdrMember,
        insurancePayoutYear,
        bavLumpSumTaxMode,
      )
    }
    if (cashflowProductId === 'etf') {
      return afterTaxInvestmentCapital(
        balance,
        cumulativeContributions,
        de2026Rules,
        assumptions.etf.equityPartialExemption,
        cumulativeVorabpauschale,
      )
    }
    if (cashflowProductId === 'altersvorsorgedepot' || cashflowProductId === 'basisrente' || cashflowProductId === 'riester') {
      // Locked products: no free liquidation — show gross balance only.
      return null
    }
    const otherAnnual = assumptions.insurance.monthlyOtherRetirementIncome * 12
    return afterTaxInsuranceLumpSum(balance, cumulativeContributions, insuranceTaxMode, de2026Rules, otherAnnual, insurancePayoutYear, profile, kvdrMember)
  }

  const [linkCopied, setLinkCopied] = useState(false)

  function handleCopyLink() {
    const url = buildShareUrl(profile, assumptions)
    history.replaceState(null, '', url)
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    })
  }

  function handleExportCsv() {
    const csv = buildExportCsv({
      products: simulation.products,
      bavAnnualTaxSvSavings: simulation.bavFunding.annualTaxAndSvSavings,
      bavProfile: profile,
      bavKvdrMember: kvdrMember,
      bavOtherAnnualIncome: assumptions.bav.monthlyOtherRetirementIncome * 12,
      insuranceTaxMode,
      equityPartialExemption: assumptions.etf.equityPartialExemption,
      insuranceOtherAnnualIncome: assumptions.insurance.monthlyOtherRetirementIncome * 12,
      rules: de2026Rules,
    })
    downloadCsv('rentenrechner-export.csv', csv)
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
              onCommit={(value) =>
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
              onCommit={(value) =>
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
            <div className="field">
              <span>Kinder (Geburtsjahr)</span>
              {profile.childBirthYears.map((year, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#667085', minWidth: '52px' }}>Kind {i + 1}</span>
                  <div className="input-shell" style={{ flex: 1 }}>
                    <input
                      type="number"
                      min={1900}
                      max={de2026Rules.year}
                      step={1}
                      value={year}
                      onChange={(e) => {
                        const val = Math.round(clampNumber(Number(e.target.value), 1900, de2026Rules.year))
                        setProfile((cur) => ({
                          ...cur,
                          childBirthYears: cur.childBirthYears.map((y, j) => (j === i ? val : y)),
                        }))
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    style={{ padding: '3px 7px', cursor: 'pointer' }}
                    onClick={() =>
                      setProfile((cur) => ({
                        ...cur,
                        childBirthYears: cur.childBirthYears.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              {profile.childBirthYears.length < 10 && (
                <button
                  type="button"
                  style={{ alignSelf: 'flex-start', fontSize: '0.82rem', padding: '3px 10px', cursor: 'pointer', marginTop: '2px' }}
                  onClick={() =>
                    setProfile((cur) => ({
                      ...cur,
                      childBirthYears: [...cur.childBirthYears, de2026Rules.year - 5],
                    }))
                  }
                >
                  + Kind hinzufügen
                </button>
              )}
            </div>
          </div>

          <label className="field">
            <span>Krankenversicherung</span>
            <select
              value={profile.publicHealthInsurance ? 'gkv' : 'pkv'}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  publicHealthInsurance: event.target.value === 'gkv',
                }))
              }
            >
              <option value="gkv">GKV (gesetzlich)</option>
              <option value="pkv">PKV (privat)</option>
            </select>
          </label>
          {!profile.publicHealthInsurance && (
            <div className="field-grid">
              <NumberField
                label="PKV-Prämie (KV)"
                value={profile.pkvMonthlyPremium}
                min={0}
                step={10}
                suffix="EUR mtl."
                onCommit={(value) =>
                  setProfile((current) => ({
                    ...current,
                    pkvMonthlyPremium: Math.max(0, Number(value)),
                  }))
                }
              />
              <NumberField
                label="pPV-Prämie"
                value={profile.pPVMonthlyPremium}
                min={0}
                step={5}
                suffix="EUR mtl."
                onCommit={(value) =>
                  setProfile((current) => ({
                    ...current,
                    pPVMonthlyPremium: Math.max(0, Number(value)),
                  }))
                }
              />
            </div>
          )}
          {!profile.publicHealthInsurance && (
            <p className="field-hint">
              AG-Zuschuss §257 SGB V (steuerfrei):{' '}
              {formatCurrency(simulation.bavFunding.salaryWithoutBav.pkv257SubsidyMonthly, 0)}/Monat.
              Netto-PKV-Kosten:{' '}
              {formatCurrency(simulation.bavFunding.salaryWithoutBav.pkvNetMonthlyCost, 0)}/Monat.
            </p>
          )}

          <div className="divider" />

          <div className="subsection-heading">
            <h3>Gesetzliche Rentenversicherung (GRV)</h3>
            <p>Basisschutz aus der gesetzlichen Rente — geschätzt oder aus der Renteninformation.</p>
          </div>

          <label className="field">
            <span>Grundlage</span>
            <select
              value={assumptions.statutoryPension.manualMonthlyGross !== null ? 'manual' : 'ep'}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  statutoryPension: {
                    ...current.statutoryPension,
                    manualMonthlyGross: event.target.value === 'manual' ? 0 : null,
                  } as StatutoryPensionAssumptions,
                }))
              }
            >
              <option value="ep">Schätzen (Entgeltpunkte)</option>
              <option value="manual">Aus Renteninformation (manuell)</option>
            </select>
          </label>

          {assumptions.statutoryPension.manualMonthlyGross !== null ? (
            <NumberField
              label="Progn. Bruttorente (Renteninformation)"
              value={assumptions.statutoryPension.manualMonthlyGross}
              min={0}
              step={10}
              suffix="EUR mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  statutoryPension: {
                    ...current.statutoryPension,
                    manualMonthlyGross: Math.max(0, Number(value)),
                  },
                }))
              }
            />
          ) : (
            <>
              <NumberField
                label="Entgeltpunkte bisher (EP)"
                value={assumptions.statutoryPension.currentEntgeltpunkte}
                min={0}
                max={200}
                step={0.1}
                suffix="EP"
                onChange={(value) =>
                  setAssumptions((current) => ({
                    ...current,
                    statutoryPension: {
                      ...current.statutoryPension,
                      currentEntgeltpunkte: Math.max(0, Number(value)),
                    },
                  }))
                }
              />
              <p className="field-hint">
                EP bei Rentenbeginn: ~{formatNumber(simulation.statutoryPension.projectedEntgeltpunkte, 1)} EP
                {' '}· Bruttorente: ~{formatCurrency(simulation.statutoryPension.grossMonthlyPension, 0)}/Monat
              </p>
            </>
          )}

          <label className="field field-inline">
            <input
              type="checkbox"
              checked={assumptions.statutoryPension.includeGrvReduction}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  statutoryPension: {
                    ...current.statutoryPension,
                    includeGrvReduction: event.target.checked,
                  },
                }))
              }
            />
            <span>GRV-Minderung durch bAV-Umwandlung abziehen</span>
          </label>

          <p className="field-hint">
            GRV netto (KVdR): <strong>{formatCurrency(simulation.statutoryPension.netMonthlyPension, 0)}/Monat</strong>
            {' '}(Steuer {formatCurrency(simulation.statutoryPension.taxMonthly, 0)} +
            {' '}KV/PV {formatCurrency(simulation.statutoryPension.kvPvMonthly, 0)})
            {simulation.statutoryPension.grvReductionApplied > 0 && (
              <> · bAV-Minderung {formatCurrency(simulation.statutoryPension.grvReductionApplied, 0)}/Monat abgezogen</>
            )}
          </p>

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
              label="Vertraglicher AG-Zuschuss"
              value={assumptions.bav.contractualMatchPercent * 100}
              min={0}
              max={100}
              step={1}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    contractualMatchPercent: Math.max(0, Number(value) / 100),
                  },
                }))
              }
            />
            <NumberField
              label="Vertraglicher AG-Festbetrag"
              value={assumptions.bav.contractualFixedMonthly}
              min={0}
              step={5}
              suffix="EUR mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: { ...current.bav, contractualFixedMonthly: Math.max(0, Number(value)) },
                }))
              }
            />
          </div>
          <label className="field field-inline">
            <input
              type="checkbox"
              checked={assumptions.bav.statutoryMinimumSubsidyEnabled}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: { ...current.bav, statutoryMinimumSubsidyEnabled: event.target.checked },
                }))
              }
            />
            <span>Gesetzlicher AG-Pflichtzuschuss (§1a Abs. 1a BetrAVG)</span>
          </label>
          <p className="field-hint">
            Effektiver AG-Beitrag:{' '}
            {formatCurrency(simulation.bavFunding.monthlyEffectiveEmployerContribution, 0)}/Monat
            {' '}(gesetzlich {formatCurrency(simulation.bavFunding.monthlyStatutoryEmployerSubsidy, 0)}
            {' '}+ vertraglich {formatCurrency(simulation.bavFunding.monthlyContractualEmployerContribution, 0)}).
          </p>

          {assumptions.bav.monthlyGrossConversion > 0 &&
            assumptions.bav.monthlyGrossConversion * 12 < bavMinAnnual && (
              <p className="field-warning">
                Unterschreitet das gesetzliche Minimum von {formatCurrency(bavMinAnnual, 2)}/Jahr
                für den §1a-BetrAVG-Anspruch.
              </p>
            )}
          {assumptions.bav.monthlyGrossConversion > bavEntitlementMax && (
            <p className="field-warning">
              Überschreitet den gesetzlichen Entgeltumwandlungsanspruch (
              {formatCurrency(bavEntitlementMax, 0)}/Monat = 4 % der BBG nach §1a BetrAVG). Höhere
              Beträge erfordern Arbeitgebereinverständnis.
            </p>
          )}

          <label className="field field-inline">
            <input
              type="checkbox"
              checked={tarifgebunden}
              onChange={(event) => setTarifgebunden(event.target.checked)}
            />
            <span>Tarifgebunden</span>
          </label>
          {tarifgebunden && (
            <p className="field-warning">
              Bei tarifgebundenem Arbeitsverhältnis kann die Entgeltumwandlung im Tarifvertrag
              eingeschränkt oder ausgeschlossen sein (§17 Abs. 3 BetrAVG / §20 BetrAVG).
            </p>
          )}

          <BavWaterfall f={simulation.bavFunding} />

          <div className="subsection-heading">
            <h3>bAV-Rentenphase</h3>
            <p>Grenzsteuer- und GRV-Optionen für die Auszahlungsphase.</p>
          </div>

          <div className="field-grid">
            <NumberField
              label="Sonst. Renteneinkommen"
              value={assumptions.bav.monthlyOtherRetirementIncome}
              min={0}
              step={50}
              suffix="EUR mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: { ...current.bav, monthlyOtherRetirementIncome: Number(value) },
                }))
              }
            />
          </div>
          {assumptions.bav.monthlyOtherRetirementIncome > 0 && (
            <p className="field-hint">
              Grenzsteuer auf bAV = Steuer(bAV + {formatCurrency(assumptions.bav.monthlyOtherRetirementIncome, 0)}/Monat) −
              Steuer({formatCurrency(assumptions.bav.monthlyOtherRetirementIncome, 0)}/Monat).
            </p>
          )}

          <label className="field field-inline">
            <input
              type="checkbox"
              checked={assumptions.bav.includeGrvReduction}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: { ...current.bav, includeGrvReduction: event.target.checked },
                }))
              }
            />
            <span>GRV-Minderung einrechnen</span>
          </label>
          {assumptions.bav.monthlyGrossConversion > 0 && (
            <p className="field-hint">
              Geschätzte Minderung:{' '}
              ~{formatCurrency(simulation.bavFunding.estimatedMonthlyGrvReduction, 0)}/Monat
              ({profile.retirementAge - profile.age} Jahre ×{' '}
              {formatCurrency(assumptions.bav.monthlyGrossConversion, 0)}/Monat,
              Rentenwert {formatCurrency(de2026Rules.socialSecurity.aktuellerRentenwert, 2)}/EP).
            </p>
          )}

          {profile.publicHealthInsurance && (
            <>
              <label className="field field-inline">
                <input
                  type="checkbox"
                  checked={kvdrMember}
                  onChange={(event) =>
                    setAssumptions((current) => ({
                      ...current,
                      bav: { ...current.bav, kvdrMember: event.target.checked },
                    }))
                  }
                />
                <span>KVdR-Mitglied in Rente</span>
              </label>
              {(() => {
                const bavResult = selectedResults.find((r) => r.productId === 'bav')
                const grossPayout = bavResult?.grossMonthlyPayout ?? 0
                if (grossPayout <= 0) return null
                const healthRate = de2026Rules.socialSecurity.healthGeneralRate + profile.healthAdditionalContributionPct / 100
                const threshold = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly
                const kvBase = kvdrMember ? Math.max(0, grossPayout - threshold) : grossPayout
                const kvMonthly = kvBase * healthRate
                const retirementYearForPv = de2026Rules.year + (profile.retirementAge - profile.age)
                const pvRate = careEmployeeRateForChildren(profile.childBirthYears, retirementYearForPv, de2026Rules) + de2026Rules.socialSecurity.careEmployerRate
                const pvMonthly = grossPayout > threshold ? grossPayout * pvRate : 0
                return (
                  <p className="field-hint">
                    Brutto-bAV-Rente: ~{formatCurrency(grossPayout, 0)}/Monat ·
                    KV-Basis: {formatCurrency(kvBase, 0)} · KV: {formatCurrency(kvMonthly, 0)} ·
                    PV: {formatCurrency(pvMonthly, 0)}{' '}
                    {kvdrMember
                      ? '(KVdR: Freibetrag 197,75 EUR · §226 SGB V)'
                      : '(freiwillig: volle Rente als Grundlage · §240 SGB V)'}
                  </p>
                )
              })()}
            </>
          )}

          <label className="field">
            <span>Durchführungsweg (bAV)</span>
            <select
              value={assumptions.bav.durchfuehrungsweg}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    durchfuehrungsweg: event.target.value as BavDurchfuehrungsweg,
                  },
                }))
              }
            >
              <option value="direktversicherung_3_63">Direktversicherung (§3 Nr. 63 EStG, ab 2005)</option>
              <option value="pensionskasse_3_63">Pensionskasse (§3 Nr. 63 EStG)</option>
              <option value="pensionsfonds_3_63">Pensionsfonds (§3 Nr. 63 EStG)</option>
              <option value="direktversicherung_40b_alt">Direktversicherung (§40b EStG a.F., vor 2005)</option>
              <option value="direktzusage">Direktzusage (§19 EStG)</option>
              <option value="unterstuetzungskasse">Unterstützungskasse (§19 EStG)</option>
            </select>
            <small className="field-hint">
              {bavLumpSumTaxMode === 'voll_versorgungsbezug' && (
                <>Kapitalabfindung: voller Steuersatz nach §22 Nr. 5 EStG (keine Fünftelregelung).</>
              )}
              {bavLumpSumTaxMode === 'fuenftelregelung' && (
                <>Kapitalabfindung: Fünftelregelung §34 Abs. 2 Nr. 4 EStG anwendbar.</>
              )}
              {bavLumpSumTaxMode === 'pre2005_steuerfrei' && (
                <>Kapitalabfindung: steuerfrei nach §52 Abs. 28 EStG a.F. KV/PV gilt weiterhin (§229 SGB V).</>
              )}
            </small>
          </label>
          {assumptions.bav.durchfuehrungsweg === 'direktversicherung_40b_alt' && (
            <>
              <label className="field field-inline">
                <input
                  type="checkbox"
                  checked={assumptions.bav.pre2005EligibleTaxFree}
                  onChange={(event) =>
                    setAssumptions((current) => ({
                      ...current,
                      bav: { ...current.bav, pre2005EligibleTaxFree: event.target.checked },
                    }))
                  }
                />
                <span>Altvertrag steuerfrei nach §52 Abs. 28 EStG a.F. (mind. 12 Jahre Laufzeit, mind. 5 Beitragsjahre, Kapitalleistung)</span>
              </label>
              {!assumptions.bav.pre2005EligibleTaxFree && (
                <p className="field-hint">
                  Steuerfreiheit abgewählt — voller Steuersatz auf Kapitalabfindung.
                </p>
              )}
            </>
          )}

          <label className="field">
            <span>Auszahlungsform (bAV)</span>
            <select
              value={assumptions.bav.payoutMode}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: { ...current.bav, payoutMode: event.target.value as PayoutMode },
                }))
              }
            >
              <option value="leibrente">Leibrente (Rentenfaktor · §1 BetrAVG)</option>
              <option value="zeitrente">Zeitrente (fester Auszahlungszeitraum)</option>
              <option value="kapitalverzehr">Kapitalverzehr (selbstgesteuerte Entnahme)</option>
            </select>
            <small className="field-hint">
              {assumptions.bav.payoutMode === 'leibrente' && (
                <>Lebenslange Rente nach Vertrags-Rentenfaktor; Kapitalverzehr-Endalter wird ignoriert.</>
              )}
              {assumptions.bav.payoutMode === 'zeitrente' && (
                <>Vertraglich befristete Rente über die unten gewählte Anzahl Jahre.</>
              )}
              {assumptions.bav.payoutMode === 'kapitalverzehr' && (
                <>Eigenverwaltete Entnahme bis zum globalen Endalter (Annuitätenformel).</>
              )}
            </small>
          </label>
          {assumptions.bav.payoutMode === 'leibrente' && (
            <NumberField
              label="Rentenfaktor (bAV)"
              value={assumptions.bav.rentenfaktor}
              min={1}
              max={80}
              step={0.5}
              suffix="EUR/10k mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: { ...current.bav, rentenfaktor: Number(value) },
                }))
              }
            />
          )}
          {assumptions.bav.payoutMode === 'zeitrente' && (
            <NumberField
              label="Zeitrente-Dauer (bAV)"
              value={assumptions.bav.zeitrenteYears}
              min={1}
              max={50}
              step={1}
              suffix="Jahre"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: { ...current.bav, zeitrenteYears: Number(value) },
                }))
              }
            />
          )}

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
              onCommit={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  retirementEndAge: clampNumber(Number(value), profile.retirementAge + 1, 110),
                }))
              }
            />
          </div>
          <p className="field-hint">
            „Kapitalverzehr bis" gilt nur für ETF und für bAV/pAV im Modus „Kapitalverzehr".
            Im Modus „Leibrente" oder „Zeitrente" steuert der Vertrag (Rentenfaktor bzw.
            Vertragslaufzeit) die monatliche Auszahlung.
          </p>

          <div className="subsection-heading">
            <h3>bAV-Kosten</h3>
            <p>Benchmarkwerte: beitragsbezogene Kosten plus Kapital- und Abschlusskosten. Vorlagen setzen alle Felder.</p>
          </div>

          <div className="fee-presets">
            {BAV_FEE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="preset-btn"
                onClick={() =>
                  setAssumptions((current) => ({
                    ...current,
                    bav: { ...current.bav, fees: preset.fees },
                  }))
                }
              >
                {preset.label}
              </button>
            ))}
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
              label="Versicherungsmantel"
              value={assumptions.bav.fees.wrapperAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, wrapperAssetFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Fonds-/ETF-Kosten"
              value={assumptions.bav.fees.fundAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, fundAssetFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Rentengebühr"
              value={assumptions.bav.fees.pensionPayoutFeePct * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="% je Rente"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  bav: {
                    ...current.bav,
                    fees: { ...current.bav.fees, pensionPayoutFeePct: Number(value) / 100 },
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
          {(() => {
            const f = assumptions.bav.fees
            const totalAsset = f.wrapperAssetFee + f.fundAssetFee
            const bavProduct = simulation.products.find(
              (p) => p.productId === 'bav' && p.scenarioId === selectedScenarioId,
            )
            const riy = bavProduct?.accumulationRiy ?? 0
            return (
              <div className="fee-summary">
                <span>
                  Gesamt Kapitalgebühr: <strong>{formatPercent(totalAsset)}</strong> p.a.
                  (Mantel {formatPercent(f.wrapperAssetFee)} + Fonds {formatPercent(f.fundAssetFee)})
                </span>
                <span className={riy > 0.02 ? 'riy-high' : riy > 0.015 ? 'riy-warn' : ''}>
                  Effektivkosten: <strong>{formatPercent(riy)}</strong>
                </span>
                {f.contributionFee > 0.05 && (
                  <p className="field-warning">Beitragskostenquote {formatPercent(f.contributionFee)} liegt über 5 % — typische Nettotarife erheben keine Kosten je Beitrag.</p>
                )}
                {f.acquisitionCostPct > 0.025 && (
                  <p className="field-warning">Abschlusskosten {formatPercent(f.acquisitionCostPct)} übersteigen 2,5 % der Beitragssumme.</p>
                )}
                {totalAsset > 0.01 && (
                  <p className="field-warning">Laufende Kapitalgebühr {formatPercent(totalAsset)} p.a. liegt über 1,0 % — prüfen Sie ETF-basierte Nettotarife (typisch 0,5–0,8 % all-in).</p>
                )}
                {riy > 0.02 && (
                  <p className="field-warning">Effektivkosten {formatPercent(riy)} überschreiten 2,0 % — ETF-basierte Verträge über dieser Schwelle gelten i. d. R. als unwirtschaftlich.</p>
                )}
                {riy > 0.015 && riy <= 0.02 && (
                  <p className="field-warning">Effektivkosten {formatPercent(riy)} liegen im kritischen Bereich (1,5–2,0 %) — Nettotarife erzielen typisch 0,6–1,0 %.</p>
                )}
              </div>
            )
          })()}

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

          <NumberField
            label="Vertragsjahr (pAV)"
            value={assumptions.insurance.contractStartYear}
            min={1970}
            max={2030}
            step={1}
            onChange={(value) =>
              setAssumptions((current) => ({
                ...current,
                insurance: { ...current.insurance, contractStartYear: Number(value) },
              }))
            }
          />
          <small className="field-hint">
            {insuranceTaxMode === 'pre2005' && (
              <>Vor 2005: steuerfrei · §52 Abs. 28 EStG a.F.</>
            )}
            {insuranceTaxMode === 'halbeinkuenfte' && (
              <>Halbeinkünfteverfahren: ½ des Ertrags mit persönl. Steuersatz · §20 Abs. 1 Nr. 6 EStG · (≥ 12 Jahre Laufzeit, Auszahlung ab 62)</>
            )}
            {insuranceTaxMode === 'abgeltungsteuer' && (
              <>Abgeltungsteuer: voller Ertrag mit 25 % + Soli · §20 Abs. 2 EStG</>
            )}
          </small>
          {assumptions.insurance.contractStartYear < 2005 && (
            <>
              <label className="field field-inline">
                <input
                  type="checkbox"
                  checked={assumptions.insurance.oldContractTaxFreeEligible}
                  onChange={(event) =>
                    setAssumptions((current) => ({
                      ...current,
                      insurance: {
                        ...current.insurance,
                        oldContractTaxFreeEligible: event.target.checked,
                      },
                    }))
                  }
                />
                <span>Altvertrag steuerfrei nach §52 Abs. 28 EStG a.F. (mind. 12 Jahre Laufzeit, mind. 5 Beitragsjahre)</span>
              </label>
              {assumptions.insurance.contractStartYear < 2005 && !assumptions.insurance.oldContractTaxFreeEligible && (
                <p className="field-hint">
                  Steuerfreiheit abgewählt — es gelten die Post-2004-Regeln (Halbeinkünfteverfahren oder Abgeltungsteuer).
                </p>
              )}
            </>
          )}
          {insuranceTaxMode === 'halbeinkuenfte' && (
            <>
              <NumberField
                label="Sonst. Renteneinkommen (pAV)"
                value={assumptions.insurance.monthlyOtherRetirementIncome}
                min={0}
                step={50}
                suffix="EUR mtl."
                onChange={(value) =>
                  setAssumptions((current) => ({
                    ...current,
                    insurance: { ...current.insurance, monthlyOtherRetirementIncome: Number(value) },
                  }))
                }
              />
              {assumptions.insurance.monthlyOtherRetirementIncome > 0 && (
                <p className="field-hint">
                  Steuer(½ Ertrag + {formatCurrency(assumptions.insurance.monthlyOtherRetirementIncome, 0)}/Monat) −
                  Steuer({formatCurrency(assumptions.insurance.monthlyOtherRetirementIncome, 0)}/Monat).
                </p>
              )}
            </>
          )}

          <label className="field">
            <span>Auszahlungsform (pAV)</span>
            <select
              value={assumptions.insurance.payoutMode}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: { ...current.insurance, payoutMode: event.target.value as PayoutMode },
                }))
              }
            >
              <option value="leibrente">Leibrente (Rentenfaktor)</option>
              <option value="zeitrente">Zeitrente (fester Auszahlungszeitraum)</option>
              <option value="kapitalverzehr">Kapitalverzehr (selbstgesteuerte Entnahme)</option>
            </select>
            <small className="field-hint">
              {assumptions.insurance.payoutMode === 'leibrente' && (
                <>Lebenslange Rente nach Vertrags-Rentenfaktor; Kapitalverzehr-Endalter wird ignoriert.</>
              )}
              {assumptions.insurance.payoutMode === 'zeitrente' && (
                <>Vertraglich befristete Rente über die unten gewählte Anzahl Jahre.</>
              )}
              {assumptions.insurance.payoutMode === 'kapitalverzehr' && (
                <>Eigenverwaltete Entnahme bis zum globalen Endalter (Annuitätenformel).</>
              )}
            </small>
          </label>
          {assumptions.insurance.payoutMode === 'leibrente' && (
            <NumberField
              label="Rentenfaktor (pAV)"
              value={assumptions.insurance.rentenfaktor}
              min={1}
              max={80}
              step={0.5}
              suffix="EUR/10k mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: { ...current.insurance, rentenfaktor: Number(value) },
                }))
              }
            />
          )}
          {assumptions.insurance.payoutMode === 'zeitrente' && (
            <NumberField
              label="Zeitrente-Dauer (pAV)"
              value={assumptions.insurance.zeitrenteYears}
              min={1}
              max={50}
              step={1}
              suffix="Jahre"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: { ...current.insurance, zeitrenteYears: Number(value) },
                }))
              }
            />
          )}

          <div className="subsection-heading">
            <h3>pAV-Kosten (Schicht 3)</h3>
            <p>Private Rentenversicherung (Schicht 3) — gleiche Kostenlogik wie bAV, separat konfigurierbar. Vorlagen setzen alle Felder. Basisrente (Schicht 1) und Riester (Schicht 2) sind in diesem Produkt nicht abgebildet.</p>
          </div>

          <div className="fee-presets">
            {PAV_FEE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="preset-btn"
                onClick={() =>
                  setAssumptions((current) => ({
                    ...current,
                    insurance: { ...current.insurance, fees: preset.fees },
                  }))
                }
              >
                {preset.label}
              </button>
            ))}
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
              label="Versicherungsmantel"
              value={assumptions.insurance.fees.wrapperAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    fees: { ...current.insurance.fees, wrapperAssetFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Fonds-/ETF-Kosten"
              value={assumptions.insurance.fees.fundAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    fees: { ...current.insurance.fees, fundAssetFee: Number(value) / 100 },
                  },
                }))
              }
            />
            <NumberField
              label="Rentengebühr"
              value={assumptions.insurance.fees.pensionPayoutFeePct * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="% je Rente"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    fees: { ...current.insurance.fees, pensionPayoutFeePct: Number(value) / 100 },
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
          {(() => {
            const f = assumptions.insurance.fees
            const totalAsset = f.wrapperAssetFee + f.fundAssetFee
            const pavProduct = simulation.products.find(
              (p) => p.productId === 'versicherung' && p.scenarioId === selectedScenarioId,
            )
            const riy = pavProduct?.accumulationRiy ?? 0
            return (
              <div className="fee-summary">
                <span>
                  Gesamt Kapitalgebühr: <strong>{formatPercent(totalAsset)}</strong> p.a.
                  (Mantel {formatPercent(f.wrapperAssetFee)} + Fonds {formatPercent(f.fundAssetFee)})
                </span>
                <span className={riy > 0.02 ? 'riy-high' : riy > 0.015 ? 'riy-warn' : ''}>
                  Effektivkosten: <strong>{formatPercent(riy)}</strong>
                </span>
                {f.contributionFee > 0.05 && (
                  <p className="field-warning">Beitragskostenquote {formatPercent(f.contributionFee)} liegt über 5 % — typische Nettotarife erheben keine Kosten je Beitrag.</p>
                )}
                {f.acquisitionCostPct > 0.025 && (
                  <p className="field-warning">Abschlusskosten {formatPercent(f.acquisitionCostPct)} übersteigen 2,5 % der Beitragssumme.</p>
                )}
                {totalAsset > 0.01 && (
                  <p className="field-warning">Laufende Kapitalgebühr {formatPercent(totalAsset)} p.a. liegt über 1,0 % — prüfen Sie ETF-basierte Nettotarife (typisch 0,5–0,8 % all-in).</p>
                )}
                {riy > 0.02 && (
                  <p className="field-warning">Effektivkosten {formatPercent(riy)} überschreiten 2,0 % — ETF-basierte Verträge über dieser Schwelle gelten i. d. R. als unwirtschaftlich.</p>
                )}
                {riy > 0.015 && riy <= 0.02 && (
                  <p className="field-warning">Effektivkosten {formatPercent(riy)} liegen im kritischen Bereich (1,5–2,0 %) — Nettotarife erzielen typisch 0,6–1,0 %.</p>
                )}
              </div>
            )
          })()}

          <div className="divider" />

          <div className="subsection-heading">
            <h3>Basisrente / Rürup (Schicht 1)</h3>
            <p>
              Steuergeförderte Altersvorsorge nach §10 Abs. 1 Nr. 2 EStG. Beiträge bis zum
              Schicht-1-Höchstbetrag steuerlich absetzbar. Kein Kapitalwahlrecht —
              nur lebenslange Rente oder Zeitrente.
            </p>
            <p className="field-hint" style={{ marginTop: 4 }}>
              ⚠ Nicht beleihbar, nicht veräußerlich, keine vorzeitige Auszahlung möglich.
              Kapital steht frühestens ab Alter 62 zur Verrentung zur Verfügung.
            </p>
          </div>

          <div className="field-grid">
            <NumberField
              label="Monatlicher Beitrag (brutto)"
              value={assumptions.basisrente.monthlyGrossContribution}
              min={0}
              step={25}
              suffix="EUR mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  basisrente: { ...current.basisrente, monthlyGrossContribution: Math.max(0, Number(value)) },
                }))
              }
            />
            <NumberField
              label="Rentenfaktor (Leibrente)"
              value={assumptions.basisrente.rentenfaktor}
              min={0}
              max={100}
              step={0.5}
              suffix="EUR/10k"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  basisrente: { ...current.basisrente, rentenfaktor: Math.max(0, Number(value)) },
                }))
              }
            />
            <NumberField
              label="Sonstige Renteneinnahmen"
              value={assumptions.basisrente.monthlyOtherRetirementIncome}
              min={0}
              step={50}
              suffix="EUR mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    monthlyOtherRetirementIncome: Math.max(0, Number(value)),
                  },
                }))
              }
            />
          </div>

          {(() => {
            const br = simulation.products.find(
              (p) => p.productId === 'basisrente' && p.scenarioId === selectedScenarioId,
            )
            const brFunding = simulation.basisrenteFunding
            return brFunding && brFunding.monthlyGrossContribution > 0 ? (
              <p className="field-hint">
                Steuerersparnis: <strong>{formatCurrency(brFunding.monthlyTaxSaving, 0)}/Monat</strong>
                {' '}· Nettoaufwand: <strong>{formatCurrency(brFunding.monthlyNetCost, 0)}/Monat</strong>
                {' '}· Schicht-1-Rest: {formatCurrency(brFunding.remainingSchicht1Cap, 0)} EUR/Jahr
                {brFunding.annualDeductible < brFunding.annualGrossContribution && (
                  <> · <span className="riy-warn">GRV füllt Teile des Caps — nur {formatCurrency(brFunding.annualDeductible, 0)} absetzbar</span></>
                )}
                {br && <> · Nettorente: <strong>{formatCurrency(br.netMonthlyPayout, 0)}/Monat</strong></>}
              </p>
            ) : null
          })()}

          <div className="subsection-heading" style={{ marginTop: 12 }}>
            <h3>Basisrente-Kosten</h3>
          </div>

          <div className="field-grid">
            <NumberField
              label="Mantelgebühr p.a."
              value={assumptions.basisrente.fees.wrapperAssetFee * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    fees: { ...current.basisrente.fees, wrapperAssetFee: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
            <NumberField
              label="Fondsgebühr p.a."
              value={assumptions.basisrente.fees.fundAssetFee * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    fees: { ...current.basisrente.fees, fundAssetFee: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
            <NumberField
              label="Beitragskostenquote"
              value={assumptions.basisrente.fees.contributionFee * 100}
              min={0}
              max={20}
              step={0.5}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    fees: { ...current.basisrente.fees, contributionFee: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
            <NumberField
              label="Monatliche Grundgebühr"
              value={assumptions.basisrente.fees.fixedMonthlyFee}
              min={0}
              step={1}
              suffix="EUR"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    fees: { ...current.basisrente.fees, fixedMonthlyFee: Math.max(0, Number(value)) },
                  },
                }))
              }
            />
            <NumberField
              label="Abschlusskosten"
              value={assumptions.basisrente.fees.acquisitionCostPct * 100}
              min={0}
              max={10}
              step={0.1}
              suffix="% Beitragssumme"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  basisrente: {
                    ...current.basisrente,
                    fees: { ...current.basisrente.fees, acquisitionCostPct: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
          </div>
          {(() => {
            const f = assumptions.basisrente.fees
            const totalAsset = f.wrapperAssetFee + f.fundAssetFee
            const brProduct = simulation.products.find(
              (p) => p.productId === 'basisrente' && p.scenarioId === selectedScenarioId,
            )
            const riy = brProduct?.accumulationRiy ?? 0
            return (
              <div className="fee-summary">
                <span>
                  Gesamt Kapitalgebühr: <strong>{formatPercent(totalAsset)}</strong> p.a.
                  (Mantel {formatPercent(f.wrapperAssetFee)} + Fonds {formatPercent(f.fundAssetFee)})
                </span>
                <span className={riy > 0.02 ? 'riy-high' : riy > 0.015 ? 'riy-warn' : ''}>
                  Effektivkosten: <strong>{formatPercent(riy)}</strong>
                </span>
                {totalAsset > 0.01 && (
                  <p className="field-warning">Laufende Kapitalgebühr {formatPercent(totalAsset)} p.a. liegt über 1,0 %.</p>
                )}
                {riy > 0.02 && (
                  <p className="field-warning">Effektivkosten {formatPercent(riy)} überschreiten 2,0 % — prüfen Sie ETF-Nettotarife.</p>
                )}
              </div>
            )
          })()}

          <div className="divider" />

          <div className="subsection-heading">
            <h3>Altersvorsorgedepot (Schicht 2, 2027)</h3>
            <p>
              Neues zertifiziertes Altersvorsorgeprodukt nach dem Altersvorsorgereformgesetz
              (Bundestag 2026-03-27). Staatliche Zulage + §10a Günstigerprüfung. Kapital
              gesperrt bis Rentenbeginn (Alter 65–70).
            </p>
            {validateAvdPayoutAge(profile.retirementAge, de2026Rules) && (
              <p className="field-warning">
                {validateAvdPayoutAge(profile.retirementAge, de2026Rules)}
              </p>
            )}
          </div>

          <label className="field">
            <span>Produktvariante</span>
            <select
              value={assumptions.altersvorsorgedepot.subtype}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    subtype: event.target.value as AltersvorsorgedepotSubtype,
                  },
                }))
              }
            >
              <option value="standarddepot">Standarddepot (Gleitpfad, max. 1,0 % Effektivkosten)</option>
              <option value="depot_no_guarantee">Freies Depot ohne Garantie</option>
              <option value="guarantee_80">80%-Garantieprodukt</option>
              <option value="guarantee_100">100%-Garantieprodukt</option>
            </select>
          </label>

          <div className="field-grid">
            <NumberField
              label="Eigenbeitrag (monatlich)"
              value={assumptions.altersvorsorgedepot.monthlyOwnContribution}
              min={0}
              step={10}
              suffix="EUR mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    monthlyOwnContribution: Math.max(0, Number(value)),
                  },
                }))
              }
            />
            <NumberField
              label="Förderberechtigte Kinder"
              value={assumptions.altersvorsorgedepot.eligibility.eligibleChildren}
              min={0}
              max={10}
              step={1}
              suffix="Kinder"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    eligibility: {
                      ...current.altersvorsorgedepot.eligibility,
                      eligibleChildren: Math.max(0, Math.round(Number(value))),
                    },
                  },
                }))
              }
            />
            <NumberField
              label="Risikoanteil (vor Gleitpfad)"
              value={assumptions.altersvorsorgedepot.riskAllocationPct * 100}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    riskAllocationPct: Math.min(1, Math.max(0, Number(value) / 100)),
                  },
                }))
              }
            />
            <NumberField
              label="Rendite Sicherheitsanlage p.a."
              value={assumptions.altersvorsorgedepot.lowRiskAnnualReturn * 100}
              min={-10}
              max={20}
              step={0.1}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    lowRiskAnnualReturn: Number(value) / 100,
                  },
                }))
              }
            />
          </div>

          <div className="field-grid">
            <label className="field field-inline">
              <input
                type="checkbox"
                checked={assumptions.altersvorsorgedepot.eligibility.directlyEligible}
                onChange={(event) =>
                  setAssumptions((current) => ({
                    ...current,
                    altersvorsorgedepot: {
                      ...current.altersvorsorgedepot,
                      eligibility: {
                        ...current.altersvorsorgedepot.eligibility,
                        directlyEligible: event.target.checked,
                      },
                    },
                  }))
                }
              />
              <span>Unmittelbar förderberechtigt</span>
            </label>
            <label className="field field-inline">
              <input
                type="checkbox"
                checked={assumptions.altersvorsorgedepot.eligibility.indirectSpouseEligible}
                onChange={(event) =>
                  setAssumptions((current) => ({
                    ...current,
                    altersvorsorgedepot: {
                      ...current.altersvorsorgedepot,
                      eligibility: {
                        ...current.altersvorsorgedepot.eligibility,
                        indirectSpouseEligible: event.target.checked,
                      },
                    },
                  }))
                }
              />
              <span>Mittelbar (Ehegatte)</span>
            </label>
          </div>

          {(() => {
            const avdFunding = simulation.altersvorsorgedepotFunding
            const avdProduct = simulation.products.find(
              (p) => p.productId === 'altersvorsorgedepot' && p.scenarioId === selectedScenarioId,
            )
            return avdFunding.annualOwnContribution > 0 ? (
              <p className="field-hint">
                Grundzulage: <strong>{formatCurrency(avdFunding.basicAllowanceAnnual, 0)}/Jahr</strong>
                {avdFunding.childAllowanceAnnual > 0 && (
                  <> · Kinderzulage: <strong>{formatCurrency(avdFunding.childAllowanceAnnual, 0)}/Jahr</strong></>
                )}
                {avdFunding.careerStarterBonusAnnual > 0 && (
                  <> · Berufseinsteiger: <strong>+{formatCurrency(avdFunding.careerStarterBonusAnnual, 0)}</strong></>
                )}
                {avdFunding.guenstigerpruefungBenefitAnnual > 0 && (
                  <> · Günstigerprüfung: <strong>+{formatCurrency(avdFunding.guenstigerpruefungBenefitAnnual, 0)}/Jahr</strong></>
                )}
                {' '}· Nettoaufwand: <strong>{formatCurrency(avdFunding.monthlyNetCost, 0)}/Monat</strong>
                {avdProduct && (
                  <> · Nettorente: <strong>{formatCurrency(avdProduct.netMonthlyPayout, 0)}/Monat</strong></>
                )}
              </p>
            ) : null
          })()}

          <label className="field">
            <span>Auszahlungsform</span>
            <select
              value={assumptions.altersvorsorgedepot.payoutMode}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    payoutMode: event.target.value as AltersvorsorgedepotPayoutMode,
                  },
                }))
              }
            >
              <option value="certified_payout_plan">Entnahmeplan bis mind. Alter 85</option>
              <option value="lifelong_annuity">Lebenslange Leibrente</option>
              <option value="hybrid_80_annuity">80 % Leibrente + 20 % variabler Anteil</option>
            </select>
          </label>

          {assumptions.altersvorsorgedepot.payoutMode === 'lifelong_annuity' && (
            <NumberField
              label="Rentenfaktor"
              value={assumptions.altersvorsorgedepot.rentenfaktor}
              min={0}
              max={100}
              step={0.5}
              suffix="EUR/10k"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    rentenfaktor: Math.max(0, Number(value)),
                  },
                }))
              }
            />
          )}

          {assumptions.altersvorsorgedepot.payoutMode !== 'lifelong_annuity' && (
            <NumberField
              label="Entnahmeplan bis Alter"
              value={assumptions.altersvorsorgedepot.payoutPlanEndAge}
              min={85}
              max={110}
              step={1}
              suffix="Jahre"
              onCommit={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    payoutPlanEndAge: Math.max(85, Math.round(Number(value))),
                  },
                }))
              }
            />
          )}

          <div className="field-grid">
            <NumberField
              label="Teilkapital bei Rentenbeginn"
              value={assumptions.altersvorsorgedepot.partialCapitalPct * 100}
              min={0}
              max={30}
              step={5}
              suffix="% (max. 30 %)"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    partialCapitalPct: Math.min(0.30, Math.max(0, Number(value) / 100)),
                  },
                }))
              }
            />
            <NumberField
              label="Übertragungs­kosten"
              value={assumptions.altersvorsorgedepot.transferCostEUR}
              min={0}
              max={300}
              step={50}
              suffix="EUR einmalig"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    transferCostEUR: Math.max(0, Number(value)),
                  },
                }))
              }
            />
            <NumberField
              label="Sonstige Renteneinnahmen"
              value={assumptions.altersvorsorgedepot.monthlyOtherRetirementIncome}
              min={0}
              step={50}
              suffix="EUR mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    monthlyOtherRetirementIncome: Math.max(0, Number(value)),
                  },
                }))
              }
            />
          </div>

          <div className="subsection-heading" style={{ marginTop: 12 }}>
            <h3>Altersvorsorgedepot-Kosten</h3>
          </div>

          <div className="field-grid">
            <NumberField
              label="Verwaltungsgebühr p.a."
              value={assumptions.altersvorsorgedepot.fees.wrapperAssetFee * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    fees: { ...current.altersvorsorgedepot.fees, wrapperAssetFee: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
            <NumberField
              label="Fondsgebühr p.a."
              value={assumptions.altersvorsorgedepot.fees.fundAssetFee * 100}
              min={0}
              max={5}
              step={0.05}
              suffix="%"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  altersvorsorgedepot: {
                    ...current.altersvorsorgedepot,
                    fees: { ...current.altersvorsorgedepot.fees, fundAssetFee: Math.max(0, Number(value) / 100) },
                  },
                }))
              }
            />
          </div>
          {(() => {
            const f = assumptions.altersvorsorgedepot.fees
            const totalAsset = f.wrapperAssetFee + f.fundAssetFee
            const avdProduct = simulation.products.find(
              (p) => p.productId === 'altersvorsorgedepot' && p.scenarioId === selectedScenarioId,
            )
            const riy = avdProduct?.accumulationRiy ?? 0
            const isStandarddepot = assumptions.altersvorsorgedepot.subtype === 'standarddepot'
            const overCap = isStandarddepot && riy > de2026Rules.altersvorsorgedepot.standarddepotEffektivkostenCap
            return (
              <div className="fee-summary">
                <span>
                  Gesamt Kapitalgebühr: <strong>{formatPercent(totalAsset)}</strong> p.a.
                </span>
                <span className={riy > 0.02 ? 'riy-high' : overCap ? 'riy-warn' : ''}>
                  Effektivkosten: <strong>{formatPercent(riy)}</strong>
                  {isStandarddepot && <> (Standarddepot-Cap: 1,0 %)</>}
                </span>
                {overCap && (
                  <p className="field-warning">
                    Effektivkosten {formatPercent(riy)} überschreiten die Standarddepot-Obergrenze von 1,0 % — das Produkt wäre nicht zertifizierungsfähig.
                  </p>
                )}
              </div>
            )
          })()}
          <div className="divider" />

          <div className="subsection-heading">
            <h3>Riester (Schicht 2, Altvertrag)</h3>
            <p>
              Bestehender Riester-Altersvorsorgevertrag nach altem Recht (§82–§93, §10a EStG).
              Keine Neuverträge ab 2027. Auszahlung vollständig steuerpflichtig (§22 Nr. 5 EStG).
              Bis zu 30% des Kapitals als Einmalbetrag zu Rentenbeginn möglich (§93 Abs. 2 EStG).
            </p>
          </div>

          <div className="field-grid">
            <NumberField
              label="Eigenbeitrag (monatlich)"
              value={assumptions.riester.monthlyOwnContribution}
              min={0}
              step={10}
              suffix="EUR mtl."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  riester: {
                    ...current.riester,
                    monthlyOwnContribution: Math.max(0, Number(value)),
                  },
                }))
              }
            />
            <NumberField
              label="Vorhandenes Kapital"
              value={assumptions.riester.existingCapital}
              min={0}
              step={1000}
              suffix="EUR"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  riester: {
                    ...current.riester,
                    existingCapital: Math.max(0, Number(value)),
                  },
                }))
              }
            />
          </div>

          <div className="field-grid">
            <label className="field field-inline">
              <input
                type="checkbox"
                checked={assumptions.riester.eligibility.directlyEligible}
                onChange={(event) =>
                  setAssumptions((current) => ({
                    ...current,
                    riester: {
                      ...current.riester,
                      eligibility: {
                        ...current.riester.eligibility,
                        directlyEligible: event.target.checked,
                      },
                    },
                  }))
                }
              />
              <span>Unmittelbar förderberechtigt</span>
            </label>
            <label className="field field-inline">
              <input
                type="checkbox"
                checked={assumptions.riester.eligibility.careerStarterBonusUsed}
                onChange={(event) =>
                  setAssumptions((current) => ({
                    ...current,
                    riester: {
                      ...current.riester,
                      eligibility: {
                        ...current.riester.eligibility,
                        careerStarterBonusUsed: event.target.checked,
                      },
                    },
                  }))
                }
              />
              <span>Berufseinsteiger-Bonus bereits erhalten</span>
            </label>
          </div>

          {(() => {
            const rf = simulation.riesterFunding
            const riesterProduct = simulation.products.find(
              (p) => p.productId === 'riester' && p.scenarioId === selectedScenarioId,
            )
            if (rf.annualOwnContribution <= 0) return null
            return (
              <p className="field-hint">
                Grundzulage: <strong>{formatCurrency(rf.grundzulageAnnual, 0)}/Jahr</strong>
                {rf.childAllowanceAnnual > 0 && (
                  <> · Kinderzulage: <strong>{formatCurrency(rf.childAllowanceAnnual, 0)}/Jahr</strong></>
                )}
                {rf.careerStarterBonusAnnual > 0 && (
                  <> · Berufseinsteiger: <strong>+{formatCurrency(rf.careerStarterBonusAnnual, 0)}</strong></>
                )}
                {rf.guenstigerpruefungBenefitAnnual > 0 && (
                  <> · Günstigerprüfung: <strong>+{formatCurrency(rf.guenstigerpruefungBenefitAnnual, 0)}/Jahr</strong></>
                )}
                {!rf.meetsMinContribution && (
                  <> · <span className="field-warning">
                    Eigenbeitrag unter Mindesteigenbeitrag ({formatCurrency(rf.minEigenbeitragAnnual, 0)}/Jahr) — Zulagen werden anteilig ({formatPercent(rf.prorationFactor, 0)}) gewährt.
                  </span></>
                )}
                {' '}· Nettoaufwand: <strong>{formatCurrency(rf.monthlyNetCost, 0)}/Monat</strong>
                {riesterProduct && (
                  <> · Nettorente: <strong>{formatCurrency(riesterProduct.netMonthlyPayout, 0)}/Monat</strong></>
                )}
              </p>
            )
          })()}

          <label className="field">
            <span>Auszahlungsform</span>
            <select
              value={assumptions.riester.payoutMode}
              onChange={(event) =>
                setAssumptions((current) => ({
                  ...current,
                  riester: {
                    ...current.riester,
                    payoutMode: event.target.value as RiesterAssumptions['payoutMode'],
                  },
                }))
              }
            >
              <option value="leibrente">Lebenslange Leibrente</option>
              <option value="zeitrente">Zeitrente (Festlaufzeit)</option>
            </select>
          </label>

          {assumptions.riester.payoutMode === 'leibrente' && (
            <NumberField
              label="Rentenfaktor"
              value={assumptions.riester.rentenfaktor}
              min={1}
              max={60}
              step={0.5}
              suffix="EUR/10 000 EUR/Monat"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  riester: {
                    ...current.riester,
                    rentenfaktor: Math.max(1, Number(value)),
                  },
                }))
              }
            />
          )}
          {assumptions.riester.payoutMode === 'zeitrente' && (
            <NumberField
              label="Laufzeit Zeitrente"
              value={assumptions.riester.zeitrenteYears}
              min={1}
              max={50}
              step={1}
              suffix="Jahre"
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  riester: {
                    ...current.riester,
                    zeitrenteYears: Math.max(1, Math.round(Number(value))),
                  },
                }))
              }
            />
          )}

          <NumberField
            label="Einmalbetrag bei Rentenbeginn"
            value={assumptions.riester.partialCapitalPct * 100}
            min={0}
            max={30}
            step={5}
            suffix="% des Kapitals"
            onChange={(value) =>
              setAssumptions((current) => ({
                ...current,
                riester: {
                  ...current.riester,
                  partialCapitalPct: Math.min(0.3, Math.max(0, Number(value) / 100)),
                },
              }))
            }
          />

          <NumberField
            label="Sonstiges Renteneinkommen"
            value={assumptions.riester.monthlyOtherRetirementIncome}
            min={0}
            step={100}
            suffix="EUR mtl."
            onChange={(value) =>
              setAssumptions((current) => ({
                ...current,
                riester: {
                  ...current.riester,
                  monthlyOtherRetirementIncome: Math.max(0, Number(value)),
                },
              }))
            }
          />

          <div className="subsection-heading" style={{ marginTop: '0.5rem' }}>
            <h4>Riester → AVD Übertrag (#71)</h4>
            <p>
              Vorhandenes Riester-Kapital in ein neues Altersvorsorgedepot übertragen (kein steuerpflichtiger
              Verkauf). Das AVD-Produkt startet mit diesem Kapital minus Übertragungskosten als Startguthaben.
              Übertragungskosten beim AVD separat eintragen.
            </p>
          </div>

          <NumberField
            label="Riester-Kapital für AVD-Übertrag"
            value={assumptions.altersvorsorgedepot.riesterTransferCapital}
            min={0}
            step={1000}
            suffix="EUR"
            onChange={(value) =>
              setAssumptions((current) => ({
                ...current,
                altersvorsorgedepot: {
                  ...current.altersvorsorgedepot,
                  riesterTransferCapital: Math.max(0, Number(value)),
                },
              }))
            }
          />

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
              label="GRV Nettorente"
              value={formatCurrency(simulation.statutoryPension.netMonthlyPension, 0)}
              detail={`${formatNumber(simulation.statutoryPension.projectedEntgeltpunkte, 1)} EP · brutto ${formatCurrency(simulation.statutoryPension.grossMonthlyPension, 0)}`}
            />
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
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {pensionBars.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
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
                  <dd>
                    Klasse I,{' '}
                    {profile.childBirthYears.length === 0
                      ? 'keine Kinder'
                      : profile.childBirthYears.length === 1
                        ? '1 Kind'
                        : `${profile.childBirthYears.length} Kinder`}
                    , Kirchensteuer nicht berechnet
                  </dd>
                </div>
                <div>
                  <dt>Krankenversicherung</dt>
                  <dd>
                    {profile.publicHealthInsurance
                      ? `GKV, Zusatzbeitrag ${profile.healthAdditionalContributionPct} %`
                      : `PKV, ${formatCurrency(profile.pkvMonthlyPremium, 0)} KV + ${formatCurrency(profile.pPVMonthlyPremium, 0)} pPV/Monat, AG-Zuschuss §257: ${formatCurrency(simulation.bavFunding.salaryWithoutBav.pkv257SubsidyMonthly, 0)}/Monat`}
                  </dd>
                </div>
                <div>
                  <dt>Steuervereinfachungen</dt>
                  <dd>
                    ETF-Einmalkapital ohne Sparerpauschbetrag; ETF-Entnahme mit jährlichem
                    Sparerpauschbetrag. bAV-Einmalkapital: §22 Nr. 5 EStG mit Fünftelregelung
                    §34 Abs. 2 Nr. 4 EStG; KV/PV nach §229 SGB V 1/120-Methode.
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
                    {formatPercent(assumptions.bav.fees.wrapperAssetFee + assumptions.bav.fees.fundAssetFee)} p.a. Kapitalgebühr (Mantel {formatPercent(assumptions.bav.fees.wrapperAssetFee)} + Fonds {formatPercent(assumptions.bav.fees.fundAssetFee)}),{' '}
                    {formatPercent(assumptions.bav.fees.acquisitionCostPct)} Abschlusskosten
                  </dd>
                </div>
                <div>
                  <dt>pAV-Kostenbenchmark</dt>
                  <dd>
                    {formatPercent(assumptions.insurance.fees.contributionFee)} je Beitrag,{' '}
                    {formatCurrency(assumptions.insurance.fees.fixedMonthlyFee, 1)} mtl.,{' '}
                    {formatPercent(assumptions.insurance.fees.wrapperAssetFee + assumptions.insurance.fees.fundAssetFee)} p.a. Kapitalgebühr (Mantel {formatPercent(assumptions.insurance.fees.wrapperAssetFee)} + Fonds {formatPercent(assumptions.insurance.fees.fundAssetFee)})
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

          <section className="chart-panel fee-drag-panel">
            <div className="section-heading">
              <Coins size={18} aria-hidden="true" />
              <div>
                <h2>Gebühren-Vergleich</h2>
                <p>Gebühren (rot) vs. verbleibendes Kapital nach Steuer – im gewählten Szenario.</p>
              </div>
            </div>
            <div className="chart-frame small">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={selectedResults.map((r) => ({
                    name: r.label,
                    'Kapital n. St.': r.afterTaxLumpSum ?? r.capitalAtRetirement,
                    'Gebühren gesamt': r.totalFees,
                    productId: r.productId,
                  }))}
                  margin={{ top: 12, right: 8, left: 0, bottom: 18 }}
                >
                  <CartesianGrid strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} />
                  <YAxis
                    tickFormatter={(value) => `${formatNumber(Number(value) / 1_000)}k`}
                    width={64}
                  />
                  <Tooltip formatter={(value) => formatCurrency(Number(value), 0)} />
                  <Legend />
                  <Bar dataKey="Kapital n. St." stackId="a">
                    {selectedResults.map((r) => (
                      <Cell key={r.productId} fill={productColors[r.productId]} />
                    ))}
                  </Bar>
                  <Bar dataKey="Gebühren gesamt" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
            <div className="section-header">
              <h2>Detailvergleich</h2>
              <div className="section-actions">
                <button type="button" className="export-btn" onClick={handleCopyLink}>
                  {linkCopied
                    ? <Check size={14} aria-hidden="true" />
                    : <Link size={14} aria-hidden="true" />}
                  {linkCopied ? 'Kopiert!' : 'Link kopieren'}
                </button>
                <button type="button" className="export-btn" onClick={handleExportCsv}>
                  <Download size={14} aria-hidden="true" />
                  CSV exportieren
                </button>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Produkt</th>
                    <th>Szenario</th>
                    <th>Nettoaufwand mtl.</th>
                    <th>Beitrag mtl.</th>
                    <th>Kapital</th>
                    <th>Kapital nach Steuer</th>
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
                      <td>
                        {formatCurrency(result.netMonthlyPayout, 0)}
                        {result.leibrenteBreakEvenAge !== undefined && (
                          <span className="break-even-note">
                            {' '}(Break-even Alter {Math.round(result.leibrenteBreakEvenAge)})
                          </span>
                        )}
                      </td>
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
            {cashflowResult?.etfPayoutRows && cashflowResult.etfPayoutRows.length > 0 && (
              <div className="payout-phase">
                <h3 className="payout-phase-heading">Rentenphase (ETF-Entnahme)</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Alter</th>
                        <th>Kapital</th>
                        <th>Brutto mtl.</th>
                        <th>Steuerpfl. Gewinn</th>
                        <th>Sparerpauschb.</th>
                        <th>Steuer</th>
                        <th>Netto mtl.</th>
                        <th>Kapital Ende</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashflowResult.etfPayoutRows.map((row) => (
                        <tr key={row.year}>
                          <td style={{ textAlign: 'left' }}>{row.age}</td>
                          <td>{formatCurrency(row.capitalAtStart, 0)}</td>
                          <td>{formatCurrency(row.grossAnnualPayout / 12, 0)}</td>
                          <td>{formatCurrency(row.taxableGain, 0)}</td>
                          <td>{formatCurrency(row.saverAllowanceUsed, 0)}</td>
                          <td>{formatCurrency(row.taxDue, 0)}</td>
                          <td>{formatCurrency(row.netMonthlyPayout, 0)}</td>
                          <td>{formatCurrency(row.capitalAtEnd, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="assumptions-section">
            <button
              type="button"
              className="assumptions-toggle"
              onClick={() => setShowAssumptions((v) => !v)}
              aria-expanded={showAssumptions}
            >
              Regelwerte & Quellen 2026 {showAssumptions ? '▲' : '▼'}
            </button>
            {showAssumptions && (
              <div className="assumptions-content">
                <div className="assumptions-group">
                  <h3>Einkommensteuer 2026</h3>
                  <dl>
                    <div><dt>Grundfreibetrag</dt><dd>{formatCurrency(de2026Rules.incomeTax.basicAllowance, 0)} EUR · <a href="https://www.gesetze-im-internet.de/estg/__32a.html" target="_blank" rel="noreferrer">EStG §32a</a></dd></div>
                    <div><dt>Progressionszone 1 bis</dt><dd>{formatCurrency(de2026Rules.incomeTax.firstProgressionEnd, 0)} EUR</dd></div>
                    <div><dt>Progressionszone 2 bis</dt><dd>{formatCurrency(de2026Rules.incomeTax.secondProgressionEnd, 0)} EUR</dd></div>
                    <div><dt>Spitzensteuersatz ab</dt><dd>{formatCurrency(de2026Rules.incomeTax.topTaxStart, 0)} EUR</dd></div>
                    <div><dt>Soli-Freigrenze (Einkommensteuer)</dt><dd>{formatCurrency(de2026Rules.incomeTax.solidarityFreeTax, 0)} EUR</dd></div>
                    <div><dt>Arbeitnehmer-Pauschbetrag</dt><dd>{formatCurrency(de2026Rules.employeeAllowance, 0)} EUR · <a href="https://www.gesetze-im-internet.de/estg/__9a.html" target="_blank" rel="noreferrer">EStG §9a</a></dd></div>
                    <div><dt>Sonderausgaben-Pauschbetrag</dt><dd>{formatCurrency(de2026Rules.specialExpensesAllowance, 0)} EUR · <a href="https://www.gesetze-im-internet.de/estg/__10c.html" target="_blank" rel="noreferrer">EStG §10c</a></dd></div>
                  </dl>
                </div>

                <div className="assumptions-group">
                  <h3>Sozialversicherung 2026</h3>
                  <dl>
                    <div><dt>BBG Rente/AV</dt><dd>{formatCurrency(de2026Rules.socialSecurity.pensionCapYear, 0)} EUR/Jahr · <a href="https://www.bundesregierung.de/breg-de/aktuelles/beitragsgemessungsgrenzen-2386514" target="_blank" rel="noreferrer">Bundesregierung</a></dd></div>
                    <div><dt>BBG KV/PV</dt><dd>{formatCurrency(de2026Rules.socialSecurity.healthCareCapYear, 0)} EUR/Jahr</dd></div>
                    <div><dt>RV Arbeitnehmer/Arbeitgeber</dt><dd>{formatPercent(de2026Rules.socialSecurity.pensionEmployeeRate)} / {formatPercent(de2026Rules.socialSecurity.pensionEmployerRate)} · <a href="https://www.gesetze-im-internet.de/sgb_6/__158.html" target="_blank" rel="noreferrer">SGB VI §158</a></dd></div>
                    <div><dt>AV Arbeitnehmer/Arbeitgeber</dt><dd>{formatPercent(de2026Rules.socialSecurity.unemploymentEmployeeRate)} / {formatPercent(de2026Rules.socialSecurity.unemploymentEmployerRate)}</dd></div>
                    <div><dt>GKV allgemeiner Beitragssatz</dt><dd>{formatPercent(de2026Rules.socialSecurity.healthGeneralRate)} · <a href="https://www.gesetze-im-internet.de/sgb_5/__241.html" target="_blank" rel="noreferrer">SGB V §241</a></dd></div>
                    <div><dt>GKV ermäßigter Satz (VPS-Grundlage)</dt><dd>{formatPercent(de2026Rules.socialSecurity.healthReducedRate)} · <a href="https://www.gesetze-im-internet.de/sgb_5/__243.html" target="_blank" rel="noreferrer">SGB V §243</a></dd></div>
                    <div><dt>PV AN (kinderlos)</dt><dd>{formatPercent(de2026Rules.socialSecurity.careEmployeeChildlessRate)} · <a href="https://www.gesetze-im-internet.de/sgb_11/__55.html" target="_blank" rel="noreferrer">SGB XI §55</a></dd></div>
                    <div><dt>PV AN (Grundsatz)</dt><dd>{formatPercent(de2026Rules.socialSecurity.careEmployeeBaseRate)}</dd></div>
                    <div><dt>PV Arbeitgeber</dt><dd>{formatPercent(de2026Rules.socialSecurity.careEmployerRate)}</dd></div>
                    <div><dt>PV Altersrentner (kinderlos)</dt><dd>{formatPercent(de2026Rules.socialSecurity.careRetirementChildlessRate)} · <a href="https://www.gesetze-im-internet.de/sgb_11/__57.html" target="_blank" rel="noreferrer">SGB XI §57</a></dd></div>
                    <div><dt>KV-Freibetrag Versorgungsbezüge</dt><dd>{formatCurrency(de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly, 2)} EUR/Monat · <a href="https://www.gesetze-im-internet.de/sgb_5/__226.html" target="_blank" rel="noreferrer">SGB V §226(2)</a></dd></div>
                    <div><dt>Bezugsgröße West</dt><dd>{formatCurrency(de2026Rules.socialSecurity.bezugsgroesseMonthly, 0)} EUR/Monat · <a href="https://www.gesetze-im-internet.de/sgb_4/__18.html" target="_blank" rel="noreferrer">SGB IV §18</a></dd></div>
                  </dl>
                </div>

                <div className="assumptions-group">
                  <h3>bAV-Grenzen 2026</h3>
                  <dl>
                    <div><dt>Steuerfreie Grenze (8 % BBG)</dt><dd>{formatCurrency(de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap, 0)} EUR/Jahr · <a href="https://www.gesetze-im-internet.de/estg/__3.html" target="_blank" rel="noreferrer">EStG §3 Nr. 63</a></dd></div>
                    <div><dt>SV-freie Grenze (4 % BBG)</dt><dd>{formatCurrency(de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.socialSecurityFreePctOfPensionCap, 0)} EUR/Jahr · SvEV §1</dd></div>
                    <div><dt>Pflicht-AG-Zuschuss</dt><dd>{formatPercent(de2026Rules.bav.statutoryEmployerSubsidyPct)} (begrenzt auf AG-SV-Ersparnis) · <a href="https://www.gesetze-im-internet.de/betravg/__1a.html" target="_blank" rel="noreferrer">BetrAVG §1a</a></dd></div>
                    <div><dt>Mindest-Entgeltumwandlung (§1a-Anspruch)</dt><dd>{formatCurrency(bavMinAnnual, 2)} EUR/Jahr · {formatCurrency(bavMinMonthly, 2)} EUR/Monat</dd></div>
                  </dl>
                </div>

                <div className="assumptions-group">
                  <h3>Kapitalertragsteuer 2026</h3>
                  <dl>
                    <div><dt>Abgeltungsteuer</dt><dd>{formatPercent(de2026Rules.capitalGains.taxRate)} · <a href="https://www.gesetze-im-internet.de/estg/__32d.html" target="_blank" rel="noreferrer">EStG §32d</a></dd></div>
                    <div><dt>Solidaritätszuschlag</dt><dd>{formatPercent(de2026Rules.capitalGains.solidarityRate)}</dd></div>
                    <div><dt>Sparerpauschbetrag</dt><dd>{formatCurrency(de2026Rules.capitalGains.saverAllowance, 0)} EUR/Jahr · <a href="https://www.gesetze-im-internet.de/estg/__20.html" target="_blank" rel="noreferrer">EStG §20 Abs. 9</a></dd></div>
                    <div><dt>Basiszins 2026 (Vorabpauschale)</dt><dd>{formatPercent(de2026Rules.capitalGains.basiszins)} · <a href="https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.html" target="_blank" rel="noreferrer">BMF 2026-01-13</a> · <a href="https://www.gesetze-im-internet.de/invstg_2018/__18.html" target="_blank" rel="noreferrer">InvStG §18</a></dd></div>
                  </dl>
                </div>

                <div className="assumptions-group">
                  <h3>Gesetzliche Rente (Schätzwerte für #5)</h3>
                  <dl>
                    <div><dt>Vorläufiges Durchschnittsentgelt 2026</dt><dd>{formatCurrency(de2026Rules.socialSecurity.durchschnittsentgelt, 0)} EUR · SGB VI Anlage 1</dd></div>
                    <div><dt>Aktueller Rentenwert West</dt><dd>{formatCurrency(de2026Rules.socialSecurity.aktuellerRentenwert, 2)} EUR/EP (ab 1.7.2025, 2026-Anpassung ausstehend)</dd></div>
                    <div><dt>Zugangsfaktor / Rentenartfaktor</dt><dd>1,0 / 1,0 (vereinfacht: Regelaltersrente ohne Abschläge)</dd></div>
                  </dl>
                  <p className="assumptions-note">
                    Diese Schätzwerte dienen nur zur Abschätzung der GRV-Minderung durch Entgeltumwandlung.
                    Die tatsächliche Rente hängt von der vollständigen Erwerbsbiografie ab.
                  </p>
                </div>
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  )
}

export default App
