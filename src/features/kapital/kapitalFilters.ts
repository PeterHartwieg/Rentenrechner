import type { Workspace } from '../../domain/workspace'
import type { ProductId, ProductResult, ScenarioAssumptions } from '../../domain'
import type { LifecycleSeriesResult } from '../results/breakEvenSeries'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import {
  aggregateLifecycleResults,
  buildPortfolioLifecycleViews,
  PORTFOLIO_LIFECYCLE_ID,
  type PortfolioLifecycleView,
} from '../results/portfolioLifecycle'
import { LIFECYCLE_HORIZON_AGE } from '../results/lifecycleHorizon'
import { PRODUCT_MANIFEST } from '../../app/productPresentation'

// ---------------------------------------------------------------------------
// KapitalChipOption — uniform shape consumed by KapitalFilterChips so the
// chip row is identical across compare-mode (per-product) and combine-mode
// (per-product-group + Gesamtportfolio) renderings (PR 8).
//
// The page picks ONE option at a time (single-select); `results` is the
// LifecycleSeriesResult[] that `BreakEvenChart` and the Wendepunkte table
// consume when this chip is active.
// ---------------------------------------------------------------------------

export interface KapitalChipOption {
  /** Stable id — `'all'` for the aggregate or a productId / portfolio id. */
  id: string
  /** German label shown in the chip. */
  label: string
  /** Short German label for the phone breakpoint. */
  shortLabel: string
  /** Results selected when this chip is active. */
  results: LifecycleSeriesResult[]
  /** Color used for the chip's active-state background. */
  color: string
}

const NEUTRAL_INK = '#222222'

// ---------------------------------------------------------------------------
// Combine-mode chip set
// ---------------------------------------------------------------------------

/**
 * Build the chip list for combine-mode. Always leads with an "Alle Verträge"
 * aggregate (driven by `buildPortfolioLifecycleViews`'s portfolio entry) and
 * follows with one chip per product group that has at least one active or
 * paid-up instance. Order matches `PRODUCT_REGISTRY` so the chips read
 * stably regardless of which products are in the workspace.
 */
export function buildCombineChipOptions(args: {
  workspace: Workspace
  perInstance: Record<string, ProductResult[]>
  scenarioId: string
}): { options: KapitalChipOption[]; views: PortfolioLifecycleView[] } {
  const views = buildPortfolioLifecycleViews({
    workspace: args.workspace,
    perInstance: args.perInstance,
    scenarioId: args.scenarioId,
    startAge: args.workspace.baseline.profile.age,
    retirementAge: args.workspace.baseline.profile.retirementAge,
    horizonAge: Math.max(
      LIFECYCLE_HORIZON_AGE,
      args.workspace.baseline.assumptions.retirementEndAge,
    ),
  })
  if (views.length === 0) return { options: [], views }

  const options: KapitalChipOption[] = []
  for (const view of views) {
    if (view.id === PORTFOLIO_LIFECYCLE_ID) {
      options.push({
        id: 'all',
        label: 'Alle Verträge',
        shortLabel: 'Alle',
        results: [view.result],
        color: NEUTRAL_INK,
      })
    } else if (view.productId) {
      const meta = productMeta(view.productId)
      options.push({
        id: view.productId,
        label: meta.label,
        shortLabel: meta.shortLabel,
        results: [view.result],
        color: meta.color,
      })
    }
  }
  return { options, views }
}

// ---------------------------------------------------------------------------
// Compare-mode chip set
// ---------------------------------------------------------------------------

/**
 * Build the chip list for compare-mode. The "Alle Produkte" chip aggregates
 * the filtered products into a single portfolio-shaped `LifecycleSeriesResult`
 * so `BreakEvenChart`'s benchmark line and break-even marker use one summed
 * paid-in series — necessary when products have different net contribution
 * paths (e.g. capped AVD / Riester) so the benchmark is not silently
 * sourced from the first product's paid-in alone. Per-product chips
 * forward the single `ProductResult` directly.
 *
 * The aggregator (`aggregateLifecycleResults`) is shared with combine-mode's
 * `Gesamtportfolio` view so both modes' "all" chips have identical math.
 */
export function buildCompareChipOptions(args: {
  assumptions: ScenarioAssumptions
  productResults: ProductResult[]
  startAge: number
  retirementAge: number
  horizonAge: number
}): KapitalChipOption[] {
  const visible = new Set(args.assumptions.visibleProducts)
  const filtered = args.productResults.filter((r) => visible.has(r.productId))
  if (filtered.length === 0) return []

  const aggregateResult = aggregateLifecycleResults({
    id: PORTFOLIO_LIFECYCLE_ID,
    label: 'Alle Produkte',
    results: filtered,
    startAge: args.startAge,
    retirementAge: args.retirementAge,
    horizonAge: args.horizonAge,
  })
  const allOption: KapitalChipOption = {
    id: 'all',
    label: 'Alle Produkte',
    shortLabel: 'Alle',
    results: [aggregateResult],
    color: NEUTRAL_INK,
  }
  const perProduct: KapitalChipOption[] = []
  // Iterate `PRODUCT_REGISTRY` order so chips stay in canonical product order
  // regardless of how `visibleProducts` was sorted in the workspace.
  for (const entry of PRODUCT_REGISTRY) {
    const productId = entry.metadata.id as ProductId
    const result = filtered.find((r) => r.productId === productId)
    if (!result) continue
    const meta = productMeta(productId)
    perProduct.push({
      id: productId,
      label: meta.label,
      shortLabel: meta.shortLabel,
      results: [result],
      color: meta.color,
    })
  }
  return [allOption, ...perProduct]
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function productMeta(productId: ProductId): {
  label: string
  shortLabel: string
  color: string
} {
  const entry = PRODUCT_MANIFEST.find((m) => m.id === productId)
  return {
    label: entry?.label ?? productId,
    shortLabel: entry?.shortLabel ?? entry?.label ?? productId,
    color: entry?.color ?? NEUTRAL_INK,
  }
}

/**
 * Resolve the active chip id against the available chip list. Falls back to
 * the first chip ('all' by construction) when the selection no longer
 * exists — keeps the page rendering after a workspace mutation that
 * removed the chip the user had picked (e.g. last ETF instance deleted).
 */
export function resolveActiveChipId(
  options: KapitalChipOption[],
  pickedId: string | null,
): string | null {
  if (options.length === 0) return null
  if (pickedId !== null && options.some((o) => o.id === pickedId)) return pickedId
  return options[0].id
}

/**
 * Returns the color map BreakEvenChart needs (`productId → color`). Built
 * from the active chip's results so combine-mode aggregated groups and
 * compare-mode per-product results both pick up canonical product colors.
 */
export function buildChartColorMap(results: LifecycleSeriesResult[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const result of results) {
    if (result.productId === PORTFOLIO_LIFECYCLE_ID) {
      out[result.productId] = NEUTRAL_INK
    } else {
      const meta = PRODUCT_MANIFEST.find((m) => m.id === result.productId)
      out[result.productId] = meta?.color ?? NEUTRAL_INK
    }
  }
  return out
}
