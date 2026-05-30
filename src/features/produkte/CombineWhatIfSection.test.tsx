// @vitest-environment jsdom
/**
 * Combine-mode what-if lifecycle controls restored after the
 * CombineDashboardSidebar retirement (Codex PR #347 R3): the what-if list, the
 * stale/frozen baseline badge (re-base / freeze), and archive-and-restart.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { defaultWorkspace } from '../../storage'
import type { Scenario, WhatIfScenario } from '../../domain/workspace'
import { CombineWhatIfSection } from './CombineWhatIfSection'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const baseline: Scenario = defaultWorkspace.baseline

function makeWhatIf(overrides: Partial<WhatIfScenario> = {}): WhatIfScenario {
  const snapshot: Scenario = {
    ...baseline,
    createdAt: new Date('2020-01-01T00:00:00Z').toISOString(),
  }
  return {
    ...baseline,
    id: 'wi1',
    label: 'Mehr in bAV',
    origin: 'manual',
    derivedFromBaselineId: baseline.id,
    derivedFromBaselineSnapshot: snapshot,
    ...overrides,
  }
}

const ARCHIVE_LABEL = 'Aktuellen Stand als Baseline speichern und neu starten'

describe('CombineWhatIfSection', () => {
  it('renders one card per what-if with label + origin', () => {
    const { getByText } = render(
      <CombineWhatIfSection
        whatIfs={[
          makeWhatIf(),
          makeWhatIf({ id: 'wi2', label: 'Riester stoppen', origin: 'recommender' }),
        ]}
        baselineLastEditedAt={undefined}
        hasContracts={false}
        onRebase={vi.fn()}
        onFreeze={vi.fn()}
        onArchiveAndRestart={vi.fn()}
      />,
    )
    expect(getByText('Mehr in bAV')).toBeTruthy()
    expect(getByText('Riester stoppen')).toBeTruthy()
    expect(getByText('Empfehlung')).toBeTruthy()
  })

  it('shows the stale badge with re-base/freeze when baseline edited after snapshot', () => {
    const onRebase = vi.fn()
    const onFreeze = vi.fn()
    const { getByText } = render(
      <CombineWhatIfSection
        whatIfs={[makeWhatIf()]}
        baselineLastEditedAt={new Date('2026-01-01T00:00:00Z').getTime()}
        hasContracts={false}
        onRebase={onRebase}
        onFreeze={onFreeze}
        onArchiveAndRestart={vi.fn()}
      />,
    )
    expect(getByText('Baseline hat sich geändert')).toBeTruthy()
    fireEvent.click(getByText('Auf aktuellen Stand re-basen'))
    expect(onRebase).toHaveBeenCalledWith('wi1')
    fireEvent.click(getByText('Snapshot beibehalten'))
    expect(onFreeze).toHaveBeenCalledWith('wi1')
  })

  it('hides the stale badge when the baseline was never edited', () => {
    const { queryByText } = render(
      <CombineWhatIfSection
        whatIfs={[makeWhatIf()]}
        baselineLastEditedAt={undefined}
        hasContracts={false}
        onRebase={vi.fn()}
        onFreeze={vi.fn()}
        onArchiveAndRestart={vi.fn()}
      />,
    )
    expect(queryByText('Baseline hat sich geändert')).toBeNull()
  })

  it('shows the frozen badge when frozenAt post-dates the baseline edit', () => {
    const { getByText } = render(
      <CombineWhatIfSection
        whatIfs={[makeWhatIf({ frozenAt: new Date('2026-06-01T00:00:00Z').getTime() })]}
        baselineLastEditedAt={new Date('2026-01-01T00:00:00Z').getTime()}
        hasContracts={false}
        onRebase={vi.fn()}
        onFreeze={vi.fn()}
        onArchiveAndRestart={vi.fn()}
      />,
    )
    expect(getByText(/Eingefroren am/)).toBeTruthy()
  })

  it('fires onArchiveAndRestart only when the confirm is accepted', () => {
    const onArchiveAndRestart = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { getByText } = render(
      <CombineWhatIfSection
        whatIfs={[]}
        baselineLastEditedAt={undefined}
        hasContracts={true}
        onRebase={vi.fn()}
        onFreeze={vi.fn()}
        onArchiveAndRestart={onArchiveAndRestart}
      />,
    )
    fireEvent.click(getByText(ARCHIVE_LABEL))
    expect(onArchiveAndRestart).toHaveBeenCalledTimes(1)
  })

  it('does not archive when the confirm is dismissed', () => {
    const onArchiveAndRestart = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { getByText } = render(
      <CombineWhatIfSection
        whatIfs={[]}
        baselineLastEditedAt={undefined}
        hasContracts={true}
        onRebase={vi.fn()}
        onFreeze={vi.fn()}
        onArchiveAndRestart={onArchiveAndRestart}
      />,
    )
    fireEvent.click(getByText(ARCHIVE_LABEL))
    expect(onArchiveAndRestart).not.toHaveBeenCalled()
  })

  it('renders nothing when there are no what-ifs and no contracts', () => {
    const { container } = render(
      <CombineWhatIfSection
        whatIfs={[]}
        baselineLastEditedAt={undefined}
        hasContracts={false}
        onRebase={vi.fn()}
        onFreeze={vi.fn()}
        onArchiveAndRestart={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
