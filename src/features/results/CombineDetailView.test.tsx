// @vitest-environment jsdom
/**
 * Render tests for `CombineDetailView` (Group G issue 28).
 *
 * Coverage:
 *   - Renders one row per active/paid_up instance, including multiple
 *     instances of the same product type (workspace v2 multi-instance).
 *   - Skips surrendered instances.
 *   - Surfaces provenance markers for user-confirmed vs. estimated input
 *     fields via the shared `ProvLabel` primitive.
 *   - Empty workspace renders the empty state, not a malformed table.
 *   - Compare-mode `DetailComparisonTable` is never invoked here — these
 *     tests use the sibling component directly.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { CombineDetailView } from './CombineDetailView'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import { migrateV1ToV2 } from '../../storage'
import { PRODUCT_EVIDENCE_FIELDS } from '../../app/evidence'
import type { Workspace } from '../../domain/workspace'
import type { EtfInstance, BavInstance } from '../../domain/instances'

afterEach(() => cleanup())

function makeBaseWorkspace(): Workspace {
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    defaultAssumptions as unknown as Record<string, unknown>,
  )
}

function defaultProps(workspace: Workspace) {
  const bundle = runCombineSimulation(workspace, de2026Rules)
  const scenario = workspace.baseline.assumptions.returnScenarios[0]
  return {
    workspace,
    perInstance: bundle.perInstance,
    selectedScenarioId: scenario.id,
    selectedScenarioLabel: scenario.label,
    onExportCsv: vi.fn(),
    onPrint: vi.fn(),
  }
}

describe('CombineDetailView — multi-instance row rendering (#28)', () => {
  it('renders one row per active instance, including multiple instances of the same product', () => {
    const ws = makeBaseWorkspace()
    // Strip the migrated default contents; we want a deterministic 2 ETF + 1 bAV setup.
    ws.baseline.assumptions.etf = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    const etfA: EtfInstance = {
      instanceId: 'etf-A',
      label: 'Aktien-ETF',
      status: 'active',
      contractStartYear: 2022,
      currentValueEUR: 0,
      annualAssetFee: 0.002,
      annualContributionGrowthRate: 0,
      equityPartialExemption: 0.3,
      monthlyContribution: 200,
      evidenceMap: {},
    }
    const etfB: EtfInstance = {
      ...etfA,
      instanceId: 'etf-B',
      label: 'World-ETF',
      monthlyContribution: 150,
    }
    const bavExisting: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-X',
      label: 'Direktversicherung Allianz',
    }
    ws.baseline.assumptions.etf = [etfA, etfB]
    ws.baseline.assumptions.bav = [bavExisting]

    const { container, getByText } = render(<CombineDetailView {...defaultProps(ws)} />)

    // 2 ETF + 1 bAV = 3 rows.
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(3)

    // Each instance label is rendered.
    expect(getByText('Aktien-ETF')).not.toBeNull()
    expect(getByText('World-ETF')).not.toBeNull()
    expect(getByText('Direktversicherung Allianz')).not.toBeNull()
  })

  it('skips surrendered instances — they are not rows', () => {
    const ws = makeBaseWorkspace()
    ws.baseline.assumptions.etf = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    const active: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-active',
      label: 'Aktive bAV',
    }
    const surrendered: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-surrendered',
      label: 'Gekündigte bAV',
      status: 'surrendered',
    }
    ws.baseline.assumptions.bav = [active, surrendered]

    const { container, queryByText, getByText } = render(<CombineDetailView {...defaultProps(ws)} />)

    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(getByText('Aktive bAV')).not.toBeNull()
    expect(queryByText('Gekündigte bAV')).toBeNull()
  })

  it('renders the empty state when no instances are present', () => {
    const ws = makeBaseWorkspace()
    ws.baseline.assumptions.bav = []
    ws.baseline.assumptions.etf = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    const { container, queryByText } = render(<CombineDetailView {...defaultProps(ws)} />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(0)
    expect(queryByText(/Noch keine Verträge im Workspace/)).not.toBeNull()
  })

  it('CSV and print buttons fire the supplied handlers', () => {
    const ws = makeBaseWorkspace()
    const props = defaultProps(ws)
    const { getByText } = render(<CombineDetailView {...props} />)
    getByText('CSV exportieren').click()
    getByText('PDF drucken').click()
    expect(props.onExportCsv).toHaveBeenCalledTimes(1)
    expect(props.onPrint).toHaveBeenCalledTimes(1)
  })

  it('does not render a "Link kopieren" button (combine mode never shares v1 URLs)', () => {
    const ws = makeBaseWorkspace()
    const { queryByText } = render(<CombineDetailView {...defaultProps(ws)} />)
    expect(queryByText('Link kopieren')).toBeNull()
  })
})

describe('CombineDetailView — provenance markers (#28)', () => {
  it('shows the "Modellwert" pill when an instance has an empty evidenceMap (model-estimate)', () => {
    const ws = makeBaseWorkspace()
    // The migrateV1ToV2 default contents start with empty evidenceMaps → model_estimate.
    const { container } = render(<CombineDetailView {...defaultProps(ws)} />)
    const modelPills = container.querySelectorAll('.pec-prov--model')
    // At least one row (default workspace has bAV at minimum) carries the model marker.
    expect(modelPills.length).toBeGreaterThan(0)
  })

  it('shows the "geprüft" pill when all consumed input fields are user_confirmed', () => {
    const ws = makeBaseWorkspace()
    ws.baseline.assumptions.bav = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    const etfEvidenceMap = Object.fromEntries(
      PRODUCT_EVIDENCE_FIELDS.etf.map((f) => [f, 'user_confirmed' as const]),
    )
    const confirmedEtf: EtfInstance = {
      instanceId: 'etf-confirmed',
      label: 'Vertragsgeprüfter ETF',
      status: 'active',
      contractStartYear: 2022,
      currentValueEUR: 0,
      annualAssetFee: 0.002,
      annualContributionGrowthRate: 0,
      equityPartialExemption: 0.3,
      monthlyContribution: 200,
      evidenceMap: etfEvidenceMap,
    }
    ws.baseline.assumptions.etf = [confirmedEtf]

    const { container } = render(<CombineDetailView {...defaultProps(ws)} />)
    const confirmedPills = container.querySelectorAll('.pec-prov--confirmed')
    // Exactly one row, marker must be confirmed.
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(confirmedPills.length).toBe(1)
  })
})
