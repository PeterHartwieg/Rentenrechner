import './PrintReport.css'
import type { ReactNode } from 'react'
import type { PersonalProfile, ScenarioAssumptions, SimulationResult } from '../../domain'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format'
import { getProductMeta } from '../../app/productPresentation'

interface Props {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  simulation: SimulationResult
}

const SCENARIO_ORDER = ['konservativ', 'basis', 'optimistisch']

function KvRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <td className="pr-kv-label">{label}</td>
      <td>{children}</td>
    </tr>
  )
}

export function PrintReport({ profile, assumptions, simulation }: Props) {
  const date = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const visibleSet = new Set(
    assumptions.visibleProducts.length > 0
      ? assumptions.visibleProducts
      : simulation.products.map((p) => p.productId),
  )
  const sorted = simulation.products
    .filter((p) => visibleSet.has(p.productId))
    .sort((a, b) => {
    const aOrd = getProductMeta(a.productId)?.order ?? 99
    const bOrd = getProductMeta(b.productId)?.order ?? 99
    if (aOrd !== bOrd) return aOrd - bOrd
    return SCENARIO_ORDER.indexOf(a.scenarioId) - SCENARIO_ORDER.indexOf(b.scenarioId)
  })

  const grv = simulation.statutoryPension
  const bav = simulation.bavFunding

  return (
    <div id="print-report">

      {/* Header — fixed table so widths are exact, no flex/grid issues */}
      <table className="pr-layout-fixed pr-header-table">
        <tbody>
          <tr>
            <td className="pr-header-left">
              <div className="pr-title">Rentenrechner Deutschland 2026</div>
              <div className="pr-subtitle">Persönliches Vorsorgemodell · erstellt am {date}</div>
            </td>
            <td className="pr-header-right">
              Modellrechnung ohne Gewähr · kein Ersatz für individuelle Beratung
            </td>
          </tr>
        </tbody>
      </table>

      {/* Two-column summary — fixed table, no flex/float */}
      <table className="pr-layout-fixed pr-summary-table">
        <tbody>
          <tr>
            <td className="pr-col-left">
              <div className="pr-section-title">Persönliches Profil</div>
              <table className="pr-kv">
                <tbody>
                  <KvRow label="Alter">{profile.age} Jahre</KvRow>
                  <KvRow label="Rentenbeginn">{profile.retirementAge} Jahre</KvRow>
                  <KvRow label="Jahresbrutto">{formatCurrency(profile.grossSalaryYear, 0)}</KvRow>
                  <KvRow label="Krankenversicherung">
                    {profile.publicHealthInsurance ? 'GKV' : 'PKV'}
                  </KvRow>
                  <KvRow label="Kinder">
                    {profile.childBirthYears.length === 0
                      ? 'keine'
                      : profile.childBirthYears.join(', ')}
                  </KvRow>
                </tbody>
              </table>
            </td>
            <td className="pr-col-right">
              <div className="pr-section-title">Gesetzliche Rente (GRV)</div>
              <table className="pr-kv">
                <tbody>
                  <KvRow label="Bruttorente">{formatCurrency(grv.grossMonthlyPension, 0)}/Monat</KvRow>
                  <KvRow label="Nettorente">
                    <strong>{formatCurrency(grv.netMonthlyPension, 0)}/Monat</strong>
                  </KvRow>
                  <KvRow label="Entgeltpunkte">{formatNumber(grv.projectedEntgeltpunkte, 1)} EP</KvRow>
                  <KvRow label="bAV Nettoaufwand">{formatCurrency(bav.monthlyNetCost, 0)}/Monat</KvRow>
                  <KvRow label="bAV Gesamtbeitrag">
                    {formatCurrency(bav.monthlyGrossConversion + bav.monthlyEmployerContribution, 0)}/Monat
                  </KvRow>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <section className="pr-section">
        <div className="pr-section-title">Rentenszenarien &amp; Annahmen</div>
        <table className="pr-table">
          <thead>
            <tr>
              <th>Szenario</th>
              <th>Jahresrendite</th>
              <th>Inflation</th>
              <th>Rentenbezug bis</th>
            </tr>
          </thead>
          <tbody>
            {assumptions.returnScenarios.map(s => (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>{formatPercent(s.annualReturn, 1)}</td>
                <td>{formatPercent(assumptions.inflationRate, 1)}</td>
                <td>{assumptions.retirementEndAge} Jahre</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pr-section">
        <div className="pr-section-title">Produktvergleich — alle Szenarien</div>
        <table className="pr-table pr-main-table">
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '6%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Produkt</th>
              <th>Szenario</th>
              <th className="pr-num">Nettokost. mtl.</th>
              <th className="pr-num">Kapital</th>
              <th className="pr-num">Kapital n. St.</th>
              <th className="pr-num">Netto-Rente</th>
              <th className="pr-num">Kosten ges.</th>
              <th className="pr-num">Effektivkost.</th>
              <th className="pr-num">Faktor</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr
                key={`${r.productId}-${r.scenarioId}`}
                className={r.scenarioId === 'basis' ? 'pr-basis' : ''}
              >
                <td>{r.label}</td>
                <td>{r.scenarioLabel}</td>
                <td className="pr-num">{formatCurrency(r.monthlyUserCost, 0)}</td>
                <td className="pr-num">{formatCurrency(r.capitalAtRetirement, 0)}</td>
                <td className="pr-num">
                  {r.afterTaxLumpSum === null ? '—' : formatCurrency(r.afterTaxLumpSum, 0)}
                </td>
                <td className="pr-num">
                  {formatCurrency(r.netMonthlyPayout, 0)}
                  {r.leibrenteBreakEvenAge !== undefined && (
                    <span className="pr-note">
                      {' '}(BE {Math.round(r.leibrenteBreakEvenAge)})
                    </span>
                  )}
                </td>
                <td className="pr-num">{formatCurrency(r.totalFees, 0)}</td>
                <td className="pr-num">{formatPercent(r.accumulationRiy, 2)}</td>
                <td className="pr-num">
                  {r.valueMultipleOnUserCost === null
                    ? '—'
                    : `${formatNumber(r.valueMultipleOnUserCost, 1)}x`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pr-note pr-table-note">
          Fettgedruckte Zeilen = Basisszenario.
          Kapital n. St. = Einmalauszahlung nach Steuer (Basisrente: gesetzlich verboten, daher —).
          BE = Leibrente-Break-even-Alter.
        </p>
      </section>

      <section className="pr-section pr-disclaimer">
        <div className="pr-section-title">Hinweise und Grenzen der Rechnung</div>
        <ul className="pr-disclaimer-list">
          <li>
            <strong>Keine Beratung:</strong> Diese Rechnung ist eine Modellrechnung und ersetzt
            keine individuelle Anlage-, Steuer- oder Rechtsberatung. Vor Vertragsabschluss sollten
            Sie einen unabhängigen Berater hinzuziehen.
          </li>
          <li>
            <strong>Rechtsstand 2026:</strong> Steuersätze, BBG, GKV/PV-Beiträge und Rentenwert
            sind auf den Stand 2026 fixiert (Quellen: BMF, Deutsche Rentenversicherung,
            GKV-Spitzenverband). Tatsächliche Werte zum Renteneintritt können erheblich abweichen.
          </li>
          <li>
            <strong>Annahmen sind Schätzungen:</strong> Jahresrendite, Inflation, Gehaltsentwicklung,
            Lebenserwartung sowie Rentenfaktor und Vertragskosten sind Annahmen. Bereits kleine
            Abweichungen können das Ergebnis und die Reihenfolge der Produkte ändern.
          </li>
          <li>
            <strong>Keine Garantieprodukte modelliert:</strong> Garantierente, Hinterbliebenen-
            und Berufsunfähigkeitsschutz sowie Überschussbeteiligung werden im Modell nicht
            separat ausgewiesen. Vergleichen Sie diese Bestandteile zusätzlich mit dem
            Produktinformationsblatt.
          </li>
          <li>
            <strong>Versorgungslücken:</strong> Pflege, Erwerbsminderung, Scheidungsausgleich
            und Erbschaften sind nicht Teil des Modells.
          </li>
        </ul>
      </section>

      <div className="pr-footer">
        Rentenrechner Deutschland 2026 · {date} · Persönliches Modell · Keine Anlageberatung
      </div>
    </div>
  )
}
