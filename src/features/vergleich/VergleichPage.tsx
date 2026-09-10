import { useMemo } from 'react'
import './VergleichPage.css'
import type { ProductId, ScenarioAssumptions, PersonalProfile } from '../../domain'
import type { SimulationResultBundle } from '../../app/useSimulationResult'
import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { resolveEffectiveScenarioId } from '../../app/simulationSelectors'
import { simulateRetirementComparison } from '../../engine/simulate'
import { buildAllProductsSimulation } from '../../app/buildAllProductsSimulation'
import { formatCurrency } from '../../utils/format'
import { VergleichResultCard } from './VergleichResultCard'
import { VergleichRenditeStrip } from './VergleichRenditeStrip'
import { VergleichComparisonTable } from './VergleichComparisonTable'
import { rowFromResult, type VergleichTableRow } from './vergleichRows'
import { VergleichProContraGrid } from './VergleichProContraGrid'

interface Props {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  result: SimulationResultBundle
  /** Container-owned simulation; selected products are also filtered at the view boundary. */
  allProductsSimulation?: ReturnType<typeof simulateRetirementComparison>
  onAssumptionsChange: (updater: (current: ScenarioAssumptions) => ScenarioAssumptions) => void
  selectedScenarioId: string
  onSelectScenario: (id: string) => void
  onEditSetup?: () => void
  navigate?: (target: Route, search?: string) => void
  onExportCsv?: () => void
  onCopyLink?: () => void
  onPrint?: () => void
  linkCopied?: boolean
}

/** Selected-product results, with nominal amounts from the shared comparison simulation. */
export function VergleichPage({
  profile,
  assumptions,
  allProductsSimulation,
  selectedScenarioId,
  onSelectScenario,
  onEditSetup,
  navigate,
  onExportCsv,
  onCopyLink,
  onPrint,
  linkCopied,
}: Props) {
  const localAllProductsResult = useMemo(
    () => (allProductsSimulation ?? buildAllProductsSimulation(profile, assumptions)),
    [allProductsSimulation, profile, assumptions],
  )
  const allProductsResult = localAllProductsResult

  const effectiveScenarioId = resolveEffectiveScenarioId(assumptions, selectedScenarioId)

  const rows = useMemo<VergleichTableRow[]>(() => {
    const products = allProductsResult.products.filter(
      (p) => p.scenarioId === effectiveScenarioId && assumptions.visibleProducts.includes(p.productId),
    )

    // R1: sort by `netMonthlyPayout` desc; ties broken by PRODUCT_REGISTRY
    // order so the table is stable when payouts coincide. NOT a "winner"
    // ranking — the bar in the Netto cell is the only visualization; no row
    // highlight, no badge. The top row's bar reaches the right edge as a
    // natural consequence of bar scaling, not a special case.
    const orderById = new Map(PRODUCT_REGISTRY.map((entry) => [entry.metadata.id, entry.metadata.order]))
    const built = products
      .map(rowFromResult)
      .filter((row): row is VergleichTableRow => row !== null)
    return built.sort((a, b) => {
      const delta = b.netMonthlyPayout - a.netMonthlyPayout
      if (delta !== 0) return delta
      return (orderById.get(a.productId) ?? 99) - (orderById.get(b.productId) ?? 99)
    })
  }, [allProductsResult.products, effectiveScenarioId, assumptions.visibleProducts])

  const productsForProContra = useMemo<ProductId[]>(
    () => rows.map((row) => row.productId),
    [rows],
  )

  const monthlyContribution = assumptions.equalInputAmountEUR ?? allProductsResult.bavFunding.monthlyNetCost
  const retirementAge = profile.retirementAge

  const scenarioQuery = `?scenario=${encodeURIComponent(effectiveScenarioId)}`
  const drillInHref = `${routeToPath(ROUTES.vergleichDetail)}${scenarioQuery}`
  // `/kapital` is dual-source (compare vs. plan) and picks its source from the
  // saved workspace mode by default. A user arriving from the comparison must
  // see the comparison, so the link names its origin explicitly.
  const kapitalQuery = `?quelle=vergleich&scenario=${encodeURIComponent(effectiveScenarioId)}`
  const kapitalHref = `${routeToPath(ROUTES.kapital)}${kapitalQuery}`

  return (
    <section className="vergleich-shell" aria-label="Vergleich">
      <div className="vergleich-main">
        <article className="vergleich-body">
          <div className="vergleich-kicker">Sparformen vergleichen</div>
          <h1 className="vergleich-headline" tabIndex={-1}>Sparformen im Vergleich</h1>
          {rows.length === 0 ? (
            <div className="vergleich-empty">
              <h2>Noch keine Sparform ausgewählt</h2>
              <p>Wähle eine oder mehrere Sparformen für deinen Vergleich.</p>
              {onEditSetup && <button type="button" className="vergleich-primary" onClick={onEditSetup}>Sparformen auswählen</button>}
            </div>
          ) : <>
            <p className="vergleich-lead">Je {formatCurrency(monthlyContribution)} aus deinem eigenen Geld im Monat.</p>
            <p className="vergleich-muted vergleich-result-note">
              Gezeigt wird die Auszahlung je Sparform ab {retirementAge}, keine Gesamtrente. Beträge zum Rentenbeginn (nominal).
            </p>
            <div className="vergleich-result-grid">
              {rows.map((row) => <VergleichResultCard key={row.productId} row={row}
                profile={profile} assumptions={assumptions} ownMoneyMonthly={monthlyContribution}
                effectiveNetCost={allProductsResult.bavFunding.monthlyNetCost} scenarioId={effectiveScenarioId} />)}
            </div>
            {onEditSetup && <button type="button" className="vergleich-primary" onClick={onEditSetup}>Auswahl oder Betrag ändern</button>}
            <details className="vergleich-disclosure vergleich-secondary">
              <summary>Rendite-Annahme ändern</summary>
              <VergleichRenditeStrip scenarios={assumptions.returnScenarios}
                selectedId={effectiveScenarioId} onSelect={onSelectScenario} />
            </details>
            <details className="vergleich-disclosure vergleich-secondary">
              <summary>Kapital, Kosten und Abzüge vergleichen</summary>
              <VergleichComparisonTable rows={rows} retirementAge={retirementAge} />
            </details>
            <details className="vergleich-disclosure vergleich-secondary">
              <summary>Wofür welche Sparform spricht — und wogegen</summary>
              <VergleichProContraGrid products={productsForProContra} />
            </details>
          </>}

          <div className="vergleich-drilldown">
            <a
              href={drillInHref}
              className="vergleich-drilldown__link"
              onClick={(event) => {
                if (!navigate) return
                if (!shouldUseSpaNavigation(event)) return
                event.preventDefault()
                navigate(ROUTES.vergleichDetail, scenarioQuery)
              }}
            >
              Wohin geht das Geld? Aufschlüsselung pro Produkt →
            </a>
            <a
              className="vergleich-drilldown__link"
              href={kapitalHref}
              onClick={(event) => {
                if (!navigate) return
                if (!shouldUseSpaNavigation(event)) return
                event.preventDefault()
                navigate(ROUTES.kapital, kapitalQuery)
              }}
            >
              Kapital im Verlauf →
            </a>
          </div>

          {(onPrint || onExportCsv || onCopyLink) && (
            <div className="vergleich-actions" role="toolbar" aria-label="Ergebnisse exportieren">
              {onPrint && (
                <button
                  type="button"
                  className="vergleich-actions__button"
                  onClick={onPrint}
                >
                  Drucken
                </button>
              )}
              {onExportCsv && (
                <button
                  type="button"
                  className="vergleich-actions__button"
                  onClick={onExportCsv}
                >
                  CSV exportieren
                </button>
              )}
              {onCopyLink && (
                <button
                  type="button"
                  className="vergleich-actions__button"
                  onClick={onCopyLink}
                  aria-live="polite"
                >
                  {linkCopied ? 'Link kopiert ✓' : 'Link kopieren'}
                </button>
              )}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
