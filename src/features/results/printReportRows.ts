import type {
  GermanRules,
  ProductId,
  ProductResult,
  ScenarioAssumptions,
  BavFundingResult,
} from '../../domain'
import type { Workspace, WorkspaceAssumptionsV2 } from '../../domain/workspace'
import type { InstanceCommon, EvidenceState } from '../../domain/instances'
import type { CombinedResult } from '../../engine/portfolioCombine'
import {
  buildVergleichDetailCardData,
  type VergleichDetailCardData,
  type VergleichDetailRow,
} from '../vergleich-detail/vergleichDetailRows'
import {
  getAvailabilityEntry,
} from '../vergleich-detail/vergleichDetailAvailability'
import { PRODUCT_REGISTRY, getProductMeta } from '../../engine/productRegistry'
import { legalConstants } from '../../rules/legalConstants'
import { formatCurrency, formatPercent } from '../../utils/format'
import { evidenceStateToProvKind, formatEvidenceStateForExport } from './provenanceHelpers'
import { buildLifecycleLineSeries, type LifecycleSeriesResult } from './breakEvenSeries'
import { buildWendepunkte, type WendepunktRow } from '../kapital/wendepunkte'
import { LIFECYCLE_HORIZON_AGE } from './lifecycleHorizon'
import {
  sensitivityIfReturnScenario,
  sensitivityIfRetirementAge,
  sensitivityIfInflation,
  sensitivityIfEtfBump,
  type SensitivityNote,
  type SensitivityRowResult,
} from '../mein-plan/sensitivitySelectors'
import {
  SENSITIVITY_RETURN_KONSERVATIV_ID,
  SENSITIVITY_RETIREMENT_AGE_DELAY,
  SENSITIVITY_INFLATION_RATE,
  SENSITIVITY_ETF_CONTRIBUTION_BUMP_EUR,
} from '../mein-plan/sensitivityConfig'

// ---------------------------------------------------------------------------
// printReportRows — pure data builders for the new PrintReport sections
// added by PR 11. Mirrors the redesigned web pages but flattens their card /
// chip / grid structures into the table-only shapes the A4 print needs.
//
// Each builder takes engine output (ProductResult / CombinedResult /
// Workspace) and returns a tagged data structure; the print component is
// presentational and never re-derives via simulation.
//
// Engine boundary: this module does NOT call any simulator. It re-uses
// existing pure helpers (`buildVergleichDetailCardData`, `getAvailabilityEntry`,
// `PRODUCT_REGISTRY`) and threads in the precomputed `bavFunding` from the
// caller. No engine output shape is changed.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// "Wohin geht das Geld" — compare-mode per-product breakdown
// ---------------------------------------------------------------------------

/**
 * Per-product print row blob for the "Wohin geht das Geld" compare-mode print
 * section. Same data shape as `VergleichDetailCardData` (the source helper)
 * with an added `availability` resolved at build time so the print row layer
 * is presentational only.
 */
export interface PrintWohinRow {
  readonly productId: ProductId
  readonly label: string
  readonly sections: ReadonlyArray<{
    readonly heading: string
    readonly rows: ReadonlyArray<VergleichDetailRow>
  }>
  /** Effektivkosten p. a. (decimal — 0.012 = 1.2 %). */
  readonly effectiveAnnualCost: number
  /** "Verfügbar ab" copy resolved at build time. */
  readonly availabilityLabel: string
  /** Optional secondary line below the availability label. */
  readonly availabilityNote: string | undefined
}

interface BuildPrintWohinRowsInput {
  /** All compare-mode product results filtered to the basis scenario. */
  results: ReadonlyArray<ProductResult>
  /** Live `assumptions` for the run. */
  assumptions: ScenarioAssumptions
  /** Live `bavFunding` for the run. Threaded so the bAV row's `gross − net − KV/PV` tax
   *  derivation compensates for the §3 Nr. 63 GRV-reduction line, per PR 290 Codex P2. */
  bavFunding: BavFundingResult | undefined
  /** Profile retirement age — used both for the § 2 heading and yearsToRetirement maths. */
  retirementAge: number
  /** User's current age — yearsToRetirement = retirementAge − age. */
  currentAge: number
}

/**
 * Build the ordered per-product row list for the print "Wohin geht das Geld"
 * section. Sort order matches PRODUCT_REGISTRY.order so the print mirrors the
 * web Vergleich-Detail grid. Products whose registry metadata is missing
 * (defensive — `getProductMeta` returns `undefined`) are dropped, same as on
 * the web page.
 */
export function buildPrintWohinRows({
  results,
  assumptions,
  bavFunding,
  retirementAge,
  currentAge,
}: BuildPrintWohinRowsInput): PrintWohinRow[] {
  if (results.length === 0) return []
  const yearsToRetirement = Math.max(0, retirementAge - currentAge)
  const orderById = new Map(
    PRODUCT_REGISTRY.map((entry) => [entry.metadata.id, entry.metadata.order]),
  )
  const sorted = [...results].sort(
    (a, b) => (orderById.get(a.productId) ?? 99) - (orderById.get(b.productId) ?? 99),
  )

  const out: PrintWohinRow[] = []
  for (const result of sorted) {
    const card: VergleichDetailCardData | null = buildVergleichDetailCardData({
      result,
      retirementAge,
      yearsToRetirement,
      assumptions,
      bavFunding,
    })
    if (!card) continue

    const availability = getAvailabilityEntry(result.productId, {
      insuranceContractStartYear:
        assumptions.insurance?.contractStartYear ??
        legalConstants.insurance.halbeinkuenfteRaisedMinAgeContractStartYear,
    })

    out.push({
      productId: card.productId,
      label: card.label,
      sections: card.sections,
      effectiveAnnualCost: card.effectiveAnnualCost,
      availabilityLabel: availability.label,
      availabilityNote: availability.note,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// "Methode & Quellen" — short methodology block (compare + combine)
// ---------------------------------------------------------------------------

/**
 * A single bullet of methodology copy in the printed § Methode block.
 *
 * Pure copy structure — no engine values are interpolated by the print
 * helpers. Statutory figures appear on `/methode` itself; the print block
 * is a navigation pointer + scope summary, not a re-render of the page.
 */
export interface PrintMethodeBullet {
  /** Short German label (e.g. "Steuermodell"). */
  readonly label: string
  /** One-sentence body copy. */
  readonly body: string
}

/**
 * Static methodology bullets shared by compare-mode AND combine-mode print.
 * Reuses the same five themes as the web /methode page so the print is a
 * faithful sub-summary, not a paraphrase: § 1 Renditeannahmen, § 2 Steuer-
 * Modell, § 3 Sozialversicherung, § 4 Statutorische Werte, § 5 Was wir
 * bewusst nicht modellieren. Kept terse — the print must fit ≤ 1 A4 page.
 *
 * `RULES_YEAR` is intentionally NOT interpolated here — the print disclaimer
 * already opens with "Stand 2026" copy, and the print Methode block points
 * the user to `/methode` for the year-bearing tables.
 */
export const PRINT_METHODE_BULLETS: ReadonlyArray<PrintMethodeBullet> = [
  {
    label: 'Renditeannahmen',
    body:
      'Drei Szenarien (konservativ, basis, optimistisch) als reale, langfristige Renditen p. a. ' +
      'Hergeleitet aus rollierenden 30-Jahres-Fenstern (MSCI World) und dem realen Median MSCI World 1900–2025.',
  },
  {
    label: 'Steuermodell',
    body:
      'Grundtarif § 32a EStG mit Soli; Kapitalerträge nach § 20 / § 32d EStG mit Abgeltungsteuer plus Sparer-Pauschbetrag; ' +
      'nachgelagerte Besteuerung der Renten nach § 22 EStG (Kohortenwerte).',
  },
  {
    label: 'Sozialversicherung',
    body:
      'KVdR mit Freibetrag § 226 SGB V (Versorgungsbezüge) bzw. freiwillige GKV § 240 SGB V. ' +
      'KV/PV-Apportionierung über die Beitragsbemessungsgrenze (modellierte Konvention).',
  },
  {
    label: 'Statutorische Werte',
    body:
      'BBG RV/KV, Aktueller Rentenwert, Bezugsgröße, Riester-Zulagen, Basisrenten-Höchstbetrag ' +
      'aus dem aktiven Regel-Modul (src/rules/) — jährlich nach BMF / BMAS aktualisiert.',
  },
  {
    label: 'Bewusst nicht modelliert',
    body:
      'Garantien einzelner Versicherungsverträge vor 2005, Auslandsbezug / Erbschaften, politische Risiken, ' +
      'individuelle Sterbetafeln. Annahmen sind Schätzungen — siehe Hinweise und Grenzen unten.',
  },
]

// ---------------------------------------------------------------------------
// "Zusammensetzung & Sensitivität" — combine-mode composition table rows
// ---------------------------------------------------------------------------

/** A single row of the combine-mode "Zusammensetzung" section in print. */
export interface PrintZusammenRow {
  /** Stable key for React `key=` — `'statutory'` or the instanceId. */
  readonly key: string
  /** Display label (instance label, or pension-baseline label for the statutory row). */
  readonly label: string
  /** Sub-label below (e.g. "ETF-Depot · beitragsfrei" or "Gesetzlich · § 22 Nr. 1 EStG"). */
  readonly sublabel: string | undefined
  /** Engine-precision EUR/Monat. `null` when not applicable (statutory row). */
  readonly contributionMonthly: number | null
  /** EUR/Monat net retirement income contribution. */
  readonly monthlyNet: number
  /** Engine-derived share (0..1) of headline net income. */
  readonly share: number
}

interface BuildPrintZusammenRowsInput {
  workspace: Workspace
  combinedForScenario: CombinedResult | undefined
}

/**
 * Build the "Zusammensetzung" print rows for combine-mode. Mirrors
 * `collectZusammenRows` in `MeinPlanPage.tsx` so the print and web surface
 * report identical figures (the engine values are unchanged — the row
 * shapes are equivalent, just flattened for table layout).
 *
 * Always emits a leading statutory-pension row (even when zero) so the
 * user sees the GRV / Versorgungswerk / Beamten baseline as the first
 * composition entry.
 *
 * Per CR10: the per-row `monthlyNet` is sourced exclusively from
 * `combinedForScenario.byInstance` (aggregate retirement-tax + KV/PV
 * pipeline). The earlier `perInstance` + `scenarioId` lookup was used only
 * to read `result.netMonthlyPayout` as a fallback, but that bypassed the
 * sanctioned aggregate path and produced wrong household-level numbers; the
 * parameters are therefore gone from this builder.
 *
 * Note: this is a copy of the same row-collection logic in
 * `MeinPlanPage.tsx`; extracting it into a single shared helper is a
 * separate task — the web page's `ZusammenRow` carries React-specific fields
 * (color, ReactNode) that the print does not need.
 */
export function buildPrintZusammenRows({
  workspace,
  combinedForScenario,
}: BuildPrintZusammenRowsInput): PrintZusammenRow[] {
  const wsa = workspace.baseline.assumptions
  const rows: PrintZusammenRow[] = []

  const headlineMonthlyNet = combinedForScenario?.monthlyNetIncome ?? 0
  const denom = headlineMonthlyNet > 0 ? headlineMonthlyNet : 0

  // Statutory pension row — always rendered, even when zero.
  const statutoryMonthly = combinedForScenario?.statutoryPensionMonthlyNet ?? 0
  rows.push({
    key: 'statutory',
    label: pensionBaselineLabel(wsa.statutoryPension.pensionBaselineType),
    sublabel: pensionBaselineSublabel(wsa.statutoryPension.pensionBaselineType),
    contributionMonthly: null,
    monthlyNet: statutoryMonthly,
    share: denom > 0 ? statutoryMonthly / denom : 0,
  })

  const slots = buildProductSlots(wsa)
  for (const slot of slots) {
    const meta = getProductMeta(slot.id)
    for (const inst of slot.instances) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      const share = combinedForScenario?.byInstance[inst.instanceId]
      // Per CR10: combine-mode net retirement income must come from the
      // aggregate retirement-tax pipeline (`combinedForScenario.byInstance`).
      // The per-instance `result.netMonthlyPayout` ignores progressive
      // §32a EStG aggregation across instances and KV/PV BBG apportionment,
      // so falling back to it produces wrong household-level numbers. When
      // the share is missing, treat as 0 — the row still renders so the user
      // sees the contract, but no false net figure is shown.
      const monthlyNet = share?.monthlyNet ?? 0

      let contributionMonthly: number | null = null
      if (inst.status === 'paid_up') {
        contributionMonthly = 0
      } else if (slot.id === 'etf' || slot.id === 'versicherung') {
        contributionMonthly = inst.monthlyContribution ?? null
      } else if (slot.id === 'bav') {
        contributionMonthly = inst.monthlyGrossConversion ?? null
      } else if (slot.id === 'basisrente') {
        contributionMonthly = inst.monthlyGrossContribution ?? null
      } else if (slot.id === 'altersvorsorgedepot' || slot.id === 'riester') {
        contributionMonthly = inst.monthlyOwnContribution ?? null
      }

      const instanceLabel = inst.label?.trim().length
        ? inst.label
        : (meta?.label ?? slot.id)
      const subLabel =
        inst.status === 'paid_up'
          ? `${meta?.label ?? slot.id} · beitragsfrei`
          : (meta?.label ?? slot.id)

      rows.push({
        key: inst.instanceId,
        label: instanceLabel,
        sublabel: subLabel,
        contributionMonthly,
        monthlyNet,
        share: denom > 0 ? monthlyNet / denom : 0,
      })
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// "Vertrag im Detail" — per-contract KPI + provenance for combine-mode print
// ---------------------------------------------------------------------------

/** A single KPI tile rendered in the printed "Vertrag im Detail" block. */
export interface PrintVertragKpi {
  readonly label: string
  /** Pre-formatted display string (`formatCurrency(value, 0)` already applied at builder level
   *  is awkward because we want the engine value too; the print component renders the value). */
  readonly value: number | null
  /** Pre-formatted overlay (`"beitragsfrei"` etc.); when present, takes precedence over value. */
  readonly displayOverride?: string
  /** Sub-line below the value (e.g. "mit 67" / "pro Monat"). */
  readonly sublabel: string
}

/** A single provenance-list line in the print "Vertrag im Detail" block. */
export interface PrintVertragProvenanceRow {
  readonly label: string
  /** German evidence label routed through `formatEvidenceStateForExport` (`'Bestätigt'`
   *  / `'lt. Beleg'` / `'Schätzwert'` / `'Unbekannt'`). */
  readonly evidenceLabel: string
  /** Underlying evidence kind for the print's coloured pill (matches PrintReport.css). */
  readonly evidenceKind: 'confirmed' | 'model' | 'default'
}

/** Per-contract printed block (one per instance in combine-mode). */
export interface PrintVertragBlock {
  readonly instanceId: string
  /** Display name (instance.label fallback to product meta). */
  readonly title: string
  /** Product family label (e.g. "ETF-Depot"). */
  readonly productLabel: string
  /** Contract status — used for the "beitragsfrei" / "gekündigt" markers in the subtitle. */
  readonly statusLabel: string | undefined
  /** Contract start year, formatted as a string (or `"—"` when unknown). */
  readonly contractStartLabel: string
  /** Anbieter (when set). */
  readonly anbieter: string | undefined
  /** Four KPI tiles (Beitrag, Einzahlungen, Voraussichtl. Kapital, Netto-Rente). */
  readonly kpis: ReadonlyArray<PrintVertragKpi>
  /** Provenance list (one row per evidence field). */
  readonly provenance: ReadonlyArray<PrintVertragProvenanceRow>
}

interface BuildPrintVertragBlocksInput {
  workspace: Workspace
  perInstance: Record<string, ProductResult[]>
  scenarioId: string
  combinedForScenario: CombinedResult | undefined
}

/**
 * Build one printed Vertrag block per instance (combine-mode print). Mirrors
 * `VertragKpiStrip.tsx` + `VertragProvenanceList.tsx` from PR 7 with the same
 * extract-monthly-contribution rules and the same evidence-key list per product.
 *
 * Surrendered and offered instances are skipped — same as Mein Plan § 1 and
 * the Vertrag-Detail "Vertrag N von M" counter. The blocks render in
 * `PRODUCT_REGISTRY` order so the print matches the web page sequence.
 */
export function buildPrintVertragBlocks({
  workspace,
  perInstance,
  scenarioId,
  combinedForScenario,
}: BuildPrintVertragBlocksInput): PrintVertragBlock[] {
  const wsa = workspace.baseline.assumptions
  const profile = workspace.baseline.profile
  const yearsContributing = Math.max(0, profile.retirementAge - profile.age)

  const blocks: PrintVertragBlock[] = []
  const slots = buildProductSlots(wsa)
  for (const slot of slots) {
    const meta = getProductMeta(slot.id)
    const productLabel = meta?.label ?? slot.id
    for (const inst of slot.instances) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue

      const result = perInstance[inst.instanceId]?.find((r) => r.scenarioId === scenarioId)
      const combinedShare = combinedForScenario?.byInstance[inst.instanceId]
      // Per CR10: combine-mode net retirement income must come from the
      // aggregate retirement-tax pipeline (`combinedForScenario.byInstance`).
      // The per-instance `result.netMonthlyPayout` ignores progressive
      // §32a EStG aggregation and KV/PV BBG apportionment across instances.
      // When `byInstance` has no entry, the KPI tile shows 0 rather than a
      // misleading per-instance figure.
      const netMonthly = combinedShare?.monthlyNet ?? 0

      const monthlyContribution = extractMonthlyContribution(inst, slot.id)
      const totalContributions =
        result?.totalUserCost ?? monthlyContribution * 12 * yearsContributing
      const capitalAtRetirement = result?.capitalAtRetirement ?? 0

      const kpis: PrintVertragKpi[] = [
        {
          label: 'Beitrag mtl.',
          value: monthlyContribution,
          displayOverride: monthlyContribution === 0 ? 'beitragsfrei' : undefined,
          sublabel: monthlyContribution === 0 ? 'derzeit keine Einzahlungen' : 'heute',
        },
        {
          label: 'Einzahlungen ges.',
          value: totalContributions,
          sublabel: `über ${yearsContributing} ${yearsContributing === 1 ? 'Jahr' : 'Jahre'}`,
        },
        {
          label: 'Voraussichtl. Kapital',
          value: capitalAtRetirement,
          sublabel: `mit ${profile.retirementAge}`,
        },
        {
          label: 'Netto-Rente',
          value: netMonthly,
          sublabel: 'pro Monat',
        },
      ]

      const provenance = buildProvenanceRows(inst, slot.id)
      const title = inst.label?.trim().length ? inst.label : productLabel
      const statusLabel = inst.status === 'paid_up' ? 'beitragsfrei' : undefined
      blocks.push({
        instanceId: inst.instanceId,
        title,
        productLabel,
        statusLabel,
        contractStartLabel:
          inst.contractStartYear && isFinite(inst.contractStartYear) && inst.contractStartYear > 0
            ? String(inst.contractStartYear)
            : '—',
        anbieter:
          'anbieter' in inst && typeof inst.anbieter === 'string' && inst.anbieter.trim().length > 0
            ? inst.anbieter.trim()
            : undefined,
        kpis,
        provenance,
      })
    }
  }
  return blocks
}

// ---------------------------------------------------------------------------
// "Kapital & Auszahlungen" — per-instance wendepunkte for combine-mode print
// ---------------------------------------------------------------------------

/**
 * A per-instance wendepunkte block. Each entry is an instance + its four
 * turning-point rows. The print emits a single table with the instance
 * label in a leading column so the layout stays page-bounded.
 */
export interface PrintWendepunkteSection {
  readonly instanceId: string
  /** Display label (instance.label fallback to product meta). */
  readonly title: string
  readonly rows: ReadonlyArray<WendepunktRow>
}

interface BuildPrintWendepunkteRowsInput {
  workspace: Workspace
  perInstance: Record<string, ProductResult[]>
  scenarioId: string
}

/**
 * Build per-instance wendepunkte sections (combine-mode print). One section
 * per active / paid-up instance. Reuses `buildLifecycleLineSeries` +
 * `buildWendepunkte` from the web `/kapital` page so the print and web
 * report identical turning points.
 *
 * Skipped instances: same as Mein Plan § 1 and Vertrag-Detail (surrendered
 * / offered are out). The horizon is `max(LIFECYCLE_HORIZON_AGE,
 * retirementEndAge)` — same as the web KapitalPage.
 */
export function buildPrintWendepunkteRows({
  workspace,
  perInstance,
  scenarioId,
}: BuildPrintWendepunkteRowsInput): PrintWendepunkteSection[] {
  const wsa = workspace.baseline.assumptions
  const profile = workspace.baseline.profile
  const horizonAge = Math.max(LIFECYCLE_HORIZON_AGE, wsa.retirementEndAge)

  const out: PrintWendepunkteSection[] = []
  const slots = buildProductSlots(wsa)
  for (const slot of slots) {
    const meta = getProductMeta(slot.id)
    const productLabel = meta?.label ?? slot.id
    for (const inst of slot.instances) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      const result = perInstance[inst.instanceId]?.find((r) => r.scenarioId === scenarioId)
      if (!result) continue

      // ProductResult satisfies LifecycleSeriesResult — the engine populates
      // `rows`, `monthlyUserCost`, `totalUserCost`, `capitalAtRetirement`,
      // `grossMonthlyPayout`, `netMonthlyPayout`, `payoutEndAge`,
      // `leibrenteBreakEvenAge`. `etfPayoutRows` and `lifecyclePayoutRows`
      // are per-product-discriminant fields on the typed union so we read
      // them defensively via a generic record cast (avoids narrowing on each
      // product id).
      //
      // PR 11 R1 (Codex C1): preserve the real `productId` so
      // `buildLifecycleLineSeries` / `annualNetPayoutAt` correctly take the
      // ETF-specific payout-row branch (`r.productId === 'etf'`). Two ETF
      // instances would otherwise collide on the shared dataKey namespace,
      // so we disambiguate via `seriesKey = instanceId` — the helper keys
      // its line/accumulator maps off `seriesKey ?? productId`.
      const resultRecord = result as unknown as Record<string, unknown>
      const seriesResult: LifecycleSeriesResult = {
        productId: result.productId,
        seriesKey: inst.instanceId,
        label: inst.label?.trim().length ? inst.label : productLabel,
        rows: result.rows ?? [],
        etfPayoutRows: resultRecord.etfPayoutRows as LifecycleSeriesResult['etfPayoutRows'],
        lifecyclePayoutRows: resultRecord.lifecyclePayoutRows as LifecycleSeriesResult['lifecyclePayoutRows'],
        monthlyUserCost: result.monthlyUserCost,
        totalUserCost: result.totalUserCost,
        capitalAtRetirement: result.capitalAtRetirement,
        grossMonthlyPayout: result.grossMonthlyPayout,
        netMonthlyPayout: result.netMonthlyPayout,
        payoutEndAge: result.payoutEndAge,
        leibrenteBreakEvenAge: result.leibrenteBreakEvenAge,
      }
      const data = buildLifecycleLineSeries(
        [seriesResult],
        profile.age,
        profile.retirementAge,
        horizonAge,
      )
      const rows = buildWendepunkte({
        selectedResults: [seriesResult],
        data,
        startAge: profile.age,
        retirementAge: profile.retirementAge,
        retirementEndAge: wsa.retirementEndAge,
      })
      out.push({
        instanceId: inst.instanceId,
        title: inst.label?.trim().length ? inst.label : productLabel,
        rows,
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Shared helpers (private)
// ---------------------------------------------------------------------------

type SlotInstance = {
  instanceId: string
  label?: string
  status: InstanceCommon['status']
  contractStartYear?: number
  monthlyContribution?: number
  monthlyGrossConversion?: number
  monthlyGrossContribution?: number
  monthlyOwnContribution?: number
  anbieter?: string
  evidenceMap?: Record<string, EvidenceState>
}

/**
 * Derive the product slot list from `PRODUCT_REGISTRY`. Mirrors the helper of
 * the same name in MeinPlanPage.tsx — duplicated here so the print rows
 * stay decoupled from the web page module (print is a stable artefact;
 * touching it shouldn't require a Mein Plan import).
 */
function buildProductSlots(wsa: WorkspaceAssumptionsV2): Array<{ id: ProductId; instances: SlotInstance[] }> {
  return PRODUCT_REGISTRY.map((entry) => ({
    id: entry.metadata.id as ProductId,
    instances: (() => {
      const raw = (wsa as unknown as Record<string, unknown>)[entry.assumptionsKey]
      return Array.isArray(raw) ? (raw as SlotInstance[]) : []
    })(),
  }))
}

/**
 * Pension-baseline label routing. Mirrors `pensionBaselineLabel` in
 * MeinPlanPage.tsx — duplicated for the same decoupling reason. Future
 * additions to `PensionBaselineType` surface as compile errors via the
 * `never` default branch.
 */
function pensionBaselineLabel(baselineType: WorkspaceAssumptionsV2['statutoryPension']['pensionBaselineType']): string {
  if (baselineType === undefined) return 'Gesetzliche Rente'
  switch (baselineType) {
    case 'grv':
      return 'Gesetzliche Rente'
    case 'versorgungswerk':
      return 'Versorgungswerk'
    case 'beamtenpension':
      return 'Beamtenpension'
    case 'none':
      return 'Keine Pflichtrente'
    default: {
      const _exhaustive: never = baselineType
      return _exhaustive
    }
  }
}

function pensionBaselineSublabel(
  baselineType: WorkspaceAssumptionsV2['statutoryPension']['pensionBaselineType'],
): string | undefined {
  if (baselineType === undefined) return 'Gesetzlich · § 22 Nr. 1 EStG'
  switch (baselineType) {
    case 'grv':
      return 'Gesetzlich · § 22 Nr. 1 EStG'
    case 'versorgungswerk':
      return 'Versorgungswerk · § 22 Nr. 1 EStG'
    case 'beamtenpension':
      return 'Beamtenversorgung · § 19 EStG'
    case 'none':
      return undefined
    default: {
      const _exhaustive: never = baselineType
      return _exhaustive
    }
  }
}

/**
 * Per-product "Beitrag heute" extractor. Mirrors the
 * `extractMonthlyContribution` helper in `VertragKpiStrip.tsx`. Paid-up
 * contracts return 0 verbatim. Exhaustive switch with `never` default.
 */
function extractMonthlyContribution(instance: SlotInstance, productId: ProductId): number {
  if (instance.status === 'paid_up') return 0
  switch (productId) {
    case 'etf':
    case 'versicherung':
      return instance.monthlyContribution ?? 0
    case 'bav':
      return instance.monthlyGrossConversion ?? 0
    case 'basisrente':
      return instance.monthlyGrossContribution ?? 0
    case 'altersvorsorgedepot':
    case 'riester':
      return instance.monthlyOwnContribution ?? 0
    default: {
      const _exhaustive: never = productId
      void _exhaustive
      return 0
    }
  }
}

interface ProvenanceField {
  evidenceKey: string
  label: string
}

/**
 * Per-product evidence field list. Mirrors `fieldsFor` in
 * `VertragProvenanceList.tsx` — keep in sync so the print and web surface
 * report the same provenance fields per contract.
 */
function fieldsFor(productId: ProductId): ReadonlyArray<ProvenanceField> {
  switch (productId) {
    case 'etf':
      return [
        { evidenceKey: 'monthlyContribution', label: 'Monatlicher Sparbeitrag' },
        { evidenceKey: 'annualAssetFee', label: 'Laufende Kosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Depotwert' },
        { evidenceKey: 'equityPartialExemption', label: 'Teilfreistellung (Aktienfonds)' },
      ]
    case 'bav':
      return [
        { evidenceKey: 'monthlyGrossConversion', label: 'Bruttoumwandlung pro Monat' },
        { evidenceKey: 'contractualMatchPercent', label: 'Arbeitgeberzuschuss' },
        { evidenceKey: 'fees.wrapperAssetFee', label: 'Versicherungskosten (Mantel)' },
        { evidenceKey: 'fees.fundAssetFee', label: 'Fondskosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Vertragswert' },
        { evidenceKey: 'durchfuehrungsweg', label: 'Durchführungsweg' },
      ]
    case 'versicherung':
      return [
        { evidenceKey: 'monthlyContribution', label: 'Monatlicher Beitrag' },
        { evidenceKey: 'fees.wrapperAssetFee', label: 'Versicherungskosten (Mantel)' },
        { evidenceKey: 'fees.fundAssetFee', label: 'Fondskosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Rückkaufswert' },
        { evidenceKey: 'guaranteedInterestRate', label: 'Garantiezins' },
        { evidenceKey: 'contractStartYear', label: 'Vertragsbeginn' },
      ]
    case 'basisrente':
      return [
        { evidenceKey: 'monthlyGrossContribution', label: 'Monatlicher Beitrag' },
        { evidenceKey: 'fees.wrapperAssetFee', label: 'Versicherungskosten (Mantel)' },
        { evidenceKey: 'fees.fundAssetFee', label: 'Fondskosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Vertragswert' },
      ]
    case 'altersvorsorgedepot':
      return [
        { evidenceKey: 'monthlyOwnContribution', label: 'Eigenbeitrag pro Monat' },
        { evidenceKey: 'fees.wrapperAssetFee', label: 'Depotkosten' },
        { evidenceKey: 'fees.fundAssetFee', label: 'Fondskosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Depotwert' },
        { evidenceKey: 'subtype', label: 'AVD-Variante' },
      ]
    case 'riester':
      return [
        { evidenceKey: 'monthlyOwnContribution', label: 'Eigenbeitrag pro Monat' },
        { evidenceKey: 'fees.wrapperAssetFee', label: 'Versicherungskosten (Mantel)' },
        { evidenceKey: 'fees.fundAssetFee', label: 'Fondskosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Vertragswert' },
        { evidenceKey: 'guaranteedInterestRate', label: 'Garantiezins' },
      ]
    default: {
      const _exhaustive: never = productId
      void _exhaustive
      return []
    }
  }
}

/**
 * Per-contract provenance rows for the print. Routes through the same
 * `evidenceStateToProvKind` mapping the rest of the app uses so the print
 * pill / label combination matches `VertragProvenanceList.tsx`.
 */
function buildProvenanceRows(instance: SlotInstance, productId: ProductId): PrintVertragProvenanceRow[] {
  const fields = fieldsFor(productId)
  const evidence = instance.evidenceMap ?? {}
  return fields.map((field) => {
    const state = evidence[field.evidenceKey]
    const kind = evidenceStateToProvKind(state)
    return {
      label: field.label,
      evidenceLabel: formatEvidenceStateForExport(state),
      evidenceKind: kind === 'model' ? 'model' : kind === 'confirmed' ? 'confirmed' : 'default',
    }
  })
}

// ---------------------------------------------------------------------------
// "Sensitivität" — combine-mode perturbation rows (PR 11 R1 scope restore)
//
// Mirrors `buildSensitivityRows` in `MeinPlanPage.tsx` but emits plain
// string-shaped rows the A4 print can render without ReactNode conditions.
// Cost: O(N × ≤4) on workspace instances per call (each row drives a full
// `runCombineSimulation` pass). Computed once per print render and threaded
// through `PrintReport` as a prop, so the cost is paid only when the user
// actually invokes window.print() in combine-mode.
// ---------------------------------------------------------------------------

/** A single sensitivity row rendered in the combine-mode print § 2 sub-table. */
export interface PrintSensitivityRow {
  /** Stable React key (matches the row id in MeinPlanPage). */
  readonly id: string
  /**
   * Plain-text condition copy ("Wenn …"). Print uses string-only copy so the
   * builder can stay React-free; the equivalent web row carries `ReactNode`
   * with `<strong>` highlights.
   */
  readonly conditionText: string
  /** Pre-formatted EUR/Monat delta (e.g. "+45 € / Mon.", "−120 € / Mon.", "±0 €/Mon."). */
  readonly deltaText: string
  /** Delta sign — drives the print pill colour. */
  readonly sign: 'pos' | 'neg' | 'neutral'
  /** Optional caption rendered below the condition (e.g. "Renteneintritt auf …
   *  begrenzt"). `null` when no extra copy is needed. */
  readonly noteText: string | null
}

interface BuildPrintSensitivityRowsInput {
  workspace: Workspace
  baselineCombined: CombinedResult | undefined
  rules: GermanRules
  scenarioId: string
}

/**
 * Build the ordered sensitivity row list for the combine-mode print.
 * Mirrors `buildSensitivityRows` in `MeinPlanPage.tsx`: same selectors,
 * same row-suppression rules, same row ids. The print-only differences
 * are the plain-text condition copy (no `<strong>` markup) and the
 * pre-formatted delta string (so the print component stays
 * presentational).
 *
 * Returns `[]` when `baselineCombined` is missing (degraded test path) so
 * the caller can short-circuit the section render.
 */
export function buildPrintSensitivityRows({
  workspace,
  baselineCombined,
  rules,
  scenarioId,
}: BuildPrintSensitivityRowsInput): PrintSensitivityRow[] {
  if (!baselineCombined) return []
  const wsa = workspace.baseline.assumptions
  const rows: PrintSensitivityRow[] = []

  // Row 1: Rendite konservativ
  const konservativScenario = wsa.returnScenarios.find(
    (s) => s.id === SENSITIVITY_RETURN_KONSERVATIV_ID,
  )
  if (konservativScenario && scenarioId !== SENSITIVITY_RETURN_KONSERVATIV_ID) {
    const result = sensitivityIfReturnScenario(
      workspace,
      baselineCombined,
      rules,
      scenarioId,
      SENSITIVITY_RETURN_KONSERVATIV_ID,
    )
    rows.push({
      id: 'rendite-konservativ',
      conditionText:
        `… die Märkte über die gesamte Laufzeit nur ` +
        `${formatPercent(konservativScenario.annualReturn, 1)} p. a. erwirtschaften ` +
        `(Szenario „${konservativScenario.label}")`,
      ...formatSensitivityDisplay(result),
    })
  }

  // Row 2: Renteneintritt 70 statt aktuell
  const currentAge = workspace.baseline.profile.retirementAge
  if (currentAge !== SENSITIVITY_RETIREMENT_AGE_DELAY) {
    const result = sensitivityIfRetirementAge(
      workspace,
      baselineCombined,
      rules,
      scenarioId,
      SENSITIVITY_RETIREMENT_AGE_DELAY,
    )
    rows.push({
      id: 'renteneintritt-70',
      conditionText:
        `… du mit ${SENSITIVITY_RETIREMENT_AGE_DELAY} Jahren in Rente gehst ` +
        `(statt aktuell ${currentAge})`,
      ...formatSensitivityDisplay(result),
    })
  }

  // Row 3: Inflation 3 % statt aktuell
  if (wsa.inflationRate !== SENSITIVITY_INFLATION_RATE) {
    const result = sensitivityIfInflation(
      workspace,
      baselineCombined,
      rules,
      scenarioId,
      SENSITIVITY_INFLATION_RATE,
    )
    rows.push({
      id: 'inflation-3',
      conditionText:
        `… die Inflation dauerhaft ${formatPercent(SENSITIVITY_INFLATION_RATE, 1)} ` +
        `beträgt (statt aktuell ${formatPercent(wsa.inflationRate, 1)})`,
      ...formatSensitivityDisplay(result),
    })
  }

  // Row 4: ETF-Beitrag +100 €/Monat (always emitted; selector reports the no-op note)
  const etfResult = sensitivityIfEtfBump(
    workspace,
    baselineCombined,
    rules,
    scenarioId,
    SENSITIVITY_ETF_CONTRIBUTION_BUMP_EUR,
  )
  rows.push({
    id: 'etf-bump',
    conditionText:
      `… du den ersten ETF-Sparplan um ` +
      `${formatCurrency(SENSITIVITY_ETF_CONTRIBUTION_BUMP_EUR, 0)}/Monat erhöhst`,
    ...formatSensitivityDisplay(etfResult),
  })

  return rows
}

/**
 * Display-formatting shared by every sensitivity row. Treats |delta| < 1
 * as neutral (same noise threshold as `formatDelta` in MeinPlanPage). Uses
 * Unicode minus (U+2212) for negative deltas to match typographic
 * conventions on the web surface.
 */
function formatSensitivityDisplay(result: SensitivityRowResult): {
  deltaText: string
  sign: 'pos' | 'neg' | 'neutral'
  noteText: string | null
} {
  const delta = result.headlineDelta
  const sign: 'pos' | 'neg' | 'neutral' =
    Math.abs(delta) < 1 ? 'neutral' : delta > 0 ? 'pos' : 'neg'
  const deltaText =
    Math.abs(delta) < 1
      ? '±0 €/Mon.'
      : `${delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(delta), 0)} / Mon.`
  return {
    deltaText,
    sign,
    noteText: formatSensitivityNote(result.note),
  }
}

/**
 * Map a `SensitivityNote` to a user-facing German caption, or `null` when
 * no extra copy is needed. Mirrors `formatNote` in MeinPlanPage so the
 * print and web surface report the same captions.
 */
function formatSensitivityNote(note: SensitivityNote | undefined): string | null {
  if (!note) return null
  switch (note) {
    case 'no_etf_instance':
      return 'Noch kein ETF-Sparplan im Plan — kein Vergleich möglich.'
    case 'etf_paid_up_only':
      return 'ETF-Vertrag vorhanden, aber beitragsfrei — Aufstockung würde einen neuen aktiven Vertrag erfordern.'
    case 'retirement_age_clamped':
      return 'Renteneintritt auf das Modell-Endalter − 1 begrenzt.'
    case 'unchanged':
      return null
    default: {
      const _exhaustive: never = note
      void _exhaustive
      return null
    }
  }
}
