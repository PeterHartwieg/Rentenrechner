import { useMemo } from 'react'
import './VertragDetailPage.css'
import type { Route } from '../../app/useRoute'
import { ROUTES } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { usePortfolioState } from '../../app/portfolioState'
import { useCombineSimulation } from '../../app/useCombineSimulation'
import { de2026Rules } from '../../rules/de2026'
import { detectSavedMode } from '../../app/useRoute'
import { getProductMeta } from '../../engine/productRegistry'
import type { InstanceCommon } from '../../domain/instances'
import type { ProductId } from '../../domain/products/common'
import { VertragKpiStrip } from './VertragKpiStrip'
import { VertragScenarioTable } from './VertragScenarioTable'
import { VertragProvenanceList } from './VertragProvenanceList'
import { VertragMetadataAside } from './VertragMetadataAside'

interface Props {
  /**
   * Instance id from the dynamic `/vertrag/:instanceId` URL segment. Parsed
   * upstream by `pathToRoute`; arrives here already URL-decoded.
   */
  instanceId: string
  /**
   * SPA navigator. Threaded into the header back-link and the metadata
   * aside's edit/remove buttons (those route into `/eingaben` for now;
   * full per-contract edit pages are out of scope for PR 7).
   */
  navigate: (target: Route) => void
}

// ---------------------------------------------------------------------------
// Slot mapping: instance id prefix → workspace assumptions array key.
// Kept inline because the `instanceId` namespace prefix is the only signal
// for routing back into the right workspace slot without a parallel
// product-id field on the URL.
// ---------------------------------------------------------------------------

const SLOT_BY_PREFIX: ReadonlyArray<{
  prefix: string
  slot: ProductId
  wsaKey:
    | 'bav'
    | 'etf'
    | 'insurance'
    | 'basisrente'
    | 'altersvorsorgedepot'
    | 'riester'
}> = [
  { prefix: 'bav-', slot: 'bav', wsaKey: 'bav' },
  { prefix: 'etf-', slot: 'etf', wsaKey: 'etf' },
  { prefix: 'versicherung-', slot: 'versicherung', wsaKey: 'insurance' },
  { prefix: 'basisrente-', slot: 'basisrente', wsaKey: 'basisrente' },
  { prefix: 'altersvorsorgedepot-', slot: 'altersvorsorgedepot', wsaKey: 'altersvorsorgedepot' },
  { prefix: 'riester-', slot: 'riester', wsaKey: 'riester' },
]

function detectSlotFromId(instanceId: string): { slot: ProductId; wsaKey: string } | null {
  for (const entry of SLOT_BY_PREFIX) {
    if (instanceId.startsWith(entry.prefix)) {
      return { slot: entry.slot, wsaKey: entry.wsaKey }
    }
  }
  return null
}

/**
 * VertragDetailPage — `/vertrag/:instanceId` drill-in from Mein Plan (PR 7).
 *
 * Full-page replacement for the old `OptimiereVorsorgeModal`. Reads the
 * combine-mode workspace via `usePortfolioState` and resolves the addressed
 * instance with a slot detector on the `instanceId` prefix. When the
 * instance does not exist (deleted contract, stale share-link) the page
 * shows an explicit empty state with a back-link rather than redirecting
 * silently. Compare-mode users get an analogous empty state with a
 * "switch to Mein Plan" CTA because per-instance contract decisions only
 * make sense over the combine-mode workspace.
 *
 * Page-level state stays here. The four sub-components (KPI strip,
 * scenario table, provenance list, metadata aside) consume their data via
 * props — none of them re-detect mode or re-read storage.
 */
export function VertragDetailPage({ instanceId, navigate }: Props) {
  // Hook calls precede every conditional return — React's Rules of Hooks
  // require an identical call order on every render. The empty-state
  // branches below render alternate trees, but the hook prelude is shared.
  const portfolioState = usePortfolioState()
  const workspace = portfolioState.workspace
  const simulation = useCombineSimulation(workspace)
  const rules = de2026Rules

  // Default scenario selection: prefer 'basis', else fall back to the
  // workspace's first scenario id (matches the recommender + Mein Plan
  // selection logic in `pickBasisScenario`).
  const scenarioId = useMemo(() => {
    const scenarios = workspace.baseline.assumptions.returnScenarios
    const basis = scenarios.find((s) => s.id === 'basis')
    return basis?.id ?? scenarios[0]?.id ?? 'basis'
  }, [workspace.baseline.assumptions.returnScenarios])

  // Header chrome: "Vertrag N von M" kicker. Counts active + paid-up
  // contracts in the canonical product order so the index reads stably
  // regardless of which slot the contract lives in. Surrendered / offered
  // instances are excluded — they don't appear on Mein Plan's § 1 list
  // either.
  const headerContext = useMemo(
    () => buildHeaderContext(workspace, instanceId),
    [workspace, instanceId],
  )

  // Mode-aware empty state. Combine-mode invariant: contract decisions read
  // from `workspace.baseline.assumptions[wsaKey]`; the singleton compare-mode
  // store has no such per-instance arrays, so the drill-in URL is a no-op
  // there. Surface that explicitly.
  //
  // `detectSavedMode` reads `localStorage` directly — pure, no hook — so it
  // is safe to call after the hook prelude.
  const savedMode = detectSavedMode()
  if (savedMode === 'compare') {
    return (
      <EmptyState
        title="Vertrag-Detail nur im Plan-Modus"
        body="Die Detailansicht eines einzelnen Vertrags steht nur im Plan-Modus zur Verfügung. Im Vergleichs-Modus rechnen wir Produkte gegeneinander, nicht einzelne Verträge."
        ctaLabel="Zu Mein Plan wechseln"
        ctaTarget={ROUTES.home}
        navigate={navigate}
      />
    )
  }

  // Instance lookup. The slot detector is the only routing signal we have —
  // a URL with an unknown prefix is treated as a missing instance.
  const slotInfo = detectSlotFromId(instanceId)
  const instance = slotInfo
    ? findInstanceInWorkspace(workspace, slotInfo.wsaKey, instanceId)
    : null

  if (!slotInfo || !instance) {
    return (
      <EmptyState
        title="Diese Vertrag wurde nicht gefunden"
        body={`Wir konnten keinen Vertrag mit der Kennung „${instanceId}" in deinem Plan finden. Vielleicht wurde er entfernt, oder der Link ist veraltet.`}
        ctaLabel="Zurück zu Mein Plan"
        ctaTarget={ROUTES.home}
        navigate={navigate}
      />
    )
  }

  const productResultsForInstance = simulation.perInstance[instanceId] ?? []
  const instanceResult = productResultsForInstance.find((r) => r.scenarioId === scenarioId)
    ?? productResultsForInstance[0]
  const combinedForScenario = simulation.combinedByScenarioId[scenarioId]

  const meta = getProductMeta(slotInfo.slot)
  const productLabel = meta?.label ?? slotInfo.slot
  const subtitleParts: string[] = [productLabel]
  if (instance.anbieter && instance.anbieter.trim().length > 0) {
    subtitleParts.push(instance.anbieter.trim())
  }
  const h1 = instance.label?.trim().length ? instance.label : productLabel

  return (
    <div className="vertrag-shell">
      <div className="vertrag-main">
        <div className="vertrag-grid">
          <article className="vertrag-body">
            <div className="vertrag-kicker">
              Mein Plan › Vertrag {headerContext.indexLabel}
            </div>
            <h1 className="vertrag-headline">{h1}</h1>
            <div className="vertrag-subtitle">{subtitleParts.join(' · ')}</div>
            <div className="vertrag-backline">
              <a
                href="/"
                className="vertrag-backlink"
                onClick={(event) => {
                  if (!shouldUseSpaNavigation(event)) return
                  event.preventDefault()
                  navigate(ROUTES.home)
                }}
              >
                ← Zurück zum Plan
              </a>
              <span aria-hidden="true">·</span>
              <span className="vertrag-meta-id">
                Vertrags-ID: <span className="vertrag-meta-id-mono">{instance.instanceId}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="vertrag-meta-start">
                angelegt: {formatStartYear(instance.contractStartYear)}
              </span>
            </div>

            <VertragKpiStrip
              instance={instance}
              productId={slotInfo.slot}
              instanceResult={instanceResult}
              retirementAge={workspace.baseline.profile.retirementAge}
              currentAge={workspace.baseline.profile.age}
            />

            <VertragScenarioTable
              workspace={workspace}
              instance={instance}
              rules={rules}
              scenarioId={scenarioId}
              combinedForScenario={combinedForScenario}
            />

            <VertragProvenanceList
              instance={instance}
              productId={slotInfo.slot}
            />
          </article>

          <VertragMetadataAside
            instance={instance}
            productId={slotInfo.slot}
            navigate={navigate}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmptyState — invalid id or compare-mode user
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  title: string
  body: string
  ctaLabel: string
  ctaTarget: Route
  navigate: (target: Route) => void
}

function EmptyState({ title, body, ctaLabel, ctaTarget, navigate }: EmptyStateProps) {
  return (
    <div className="vertrag-shell">
      <div className="vertrag-main">
        <article className="vertrag-empty">
          <h1 className="vertrag-empty-title">{title}</h1>
          <p className="vertrag-empty-body">{body}</p>
          <a
            href="/"
            className="vertrag-empty-cta"
            onClick={(event) => {
              if (!shouldUseSpaNavigation(event)) return
              event.preventDefault()
              navigate(ctaTarget)
            }}
          >
            {ctaLabel}
          </a>
        </article>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up an instance by id in a single workspace slot. The slot key is the
 * `WorkspaceAssumptionsV2` field name (e.g. `'insurance'`), not the
 * `ProductId` (`'versicherung'`) — they differ for the pAV slot.
 */
function findInstanceInWorkspace(
  workspace: ReturnType<typeof usePortfolioState>['workspace'],
  wsaKey: string,
  instanceId: string,
): InstanceCommon | null {
  const wsa = workspace.baseline.assumptions as unknown as Record<string, unknown>
  const raw = wsa[wsaKey]
  if (!Array.isArray(raw)) return null
  const found = (raw as InstanceCommon[]).find((i) => i.instanceId === instanceId)
  return found ?? null
}

interface HeaderContext {
  /** "N von M" style label (e.g. `"2 von 3"`); falls back to `"–"` when zero. */
  indexLabel: string
}

/**
 * Count active+paid-up instances across all product slots and find the
 * position of `instanceId` in that ordered list. Mirrors the iteration
 * order used by Mein Plan § 1 Zusammensetzung so the "Vertrag N von M"
 * kicker matches what the user sees on the source page.
 */
function buildHeaderContext(
  workspace: ReturnType<typeof usePortfolioState>['workspace'],
  instanceId: string,
): HeaderContext {
  const wsa = workspace.baseline.assumptions
  // Iteration order matches `PRODUCT_REGISTRY` (see MeinPlanPage's
  // `buildProductSlots`); we hand-roll the order here to avoid the
  // registry lookup roundtrip — the six product slots are stable and
  // adding a new slot already requires touching the registry directly.
  const slots: ReadonlyArray<InstanceCommon[]> = [
    wsa.bav,
    wsa.etf,
    wsa.insurance,
    wsa.basisrente,
    wsa.altersvorsorgedepot,
    wsa.riester,
  ]
  let total = 0
  let position = -1
  for (const arr of slots) {
    for (const inst of arr) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      total += 1
      if (inst.instanceId === instanceId) position = total
    }
  }
  if (total === 0 || position === -1) {
    return { indexLabel: '–' }
  }
  return { indexLabel: `${position} von ${total}` }
}

/**
 * Render the contract start year in the `MM/YYYY` style used by the mock.
 * Falls back to the bare year when no month signal is available (combine-
 * mode contracts only carry year-level granularity today).
 */
function formatStartYear(year: number | undefined): string {
  if (year === undefined || !isFinite(year) || year <= 0) return '—'
  return String(year)
}
