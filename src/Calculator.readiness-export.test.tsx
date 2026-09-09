// @vitest-environment jsdom
//
// Arming check for the Phase 1 export suppression. `PrintReport` and
// `buildCombinePortfolioCsv` have carried a `householdTotalBlocked` option
// since Phase 1, but nothing passed it — so exports behaved exactly as before.
// Phase 2D's Calculator wiring is what turns it on: it computes
// `selectResultReadiness` and hands `householdTotalBlockedLabels(readiness)`
// to both export paths.
//
// Invariant under test: a blocked household total is never exported as a
// number. It leaves an empty cell plus one Hinweis line naming what is missing.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import App from './App'
import { addInstanceToWorkspace } from './features/inventory/inventoryHelpers'
import { defaultWorkspace, STORAGE_KEY_V2 } from './storage'
import type { Workspace } from './domain/workspace'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState(null, '', '/')
})

/** A started plan whose statutory-pension answer is still outstanding. */
function saveIncompletePlan(): void {
  let workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
  workspace = { ...workspace, mode: 'combine' }
  workspace = addInstanceToWorkspace(workspace, 'bav')
  workspace.baseline.assumptions.statutoryPension = {
    ...workspace.baseline.assumptions.statutoryPension,
    pensionEntryMethod: { kind: 'skipped' },
  }
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
}

function saveCompletePlan(): void {
  let workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
  workspace = { ...workspace, mode: 'combine' }
  workspace = addInstanceToWorkspace(workspace, 'bav')
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
}

describe('Calculator — readiness reaches the export layer', () => {
  it('leads with PlanOverview and keeps secondary controls in three closed disclosures', async () => {
    saveCompletePlan()
    render(<App />)
    await waitFor(() => expect(document.querySelector('.plan-overview')).not.toBeNull(), {
      timeout: 8000,
    })

    const host = document.querySelector('.mein-plan-host')!
    expect(host.firstElementChild).toHaveClass('mein-plan-shell')
    const overview = host.querySelector('.plan-overview')!
    expect(host.firstElementChild).toContainElement(overview as HTMLElement)
    expect(within(overview as HTMLElement).getByRole('heading', { level: 1 })).toHaveTextContent('Deine Rente im Überblick')

    const disclosures = Array.from(document.querySelectorAll<HTMLDetailsElement>('.rw-plan-disclosure'))
    expect(disclosures.map((details) => details.querySelector('summary')?.textContent)).toEqual([
      'Annahmen & Risiko',
      'Empfehlung: Wo geht mein nächster Euro hin?',
      'Details & Export',
    ])
    for (const details of disclosures) {
      expect(details.open).toBe(false)
      expect(overview.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const [risk, recommendation, exports] = disclosures
    expect(risk!.querySelector('.toolbar')).toBeInTheDocument()
    expect(risk!.querySelector('.toolbar')).not.toBeVisible()
    expect(risk!.querySelector('.assumptions-section')).toBeInTheDocument()
    expect(risk!.querySelector('.warnings-panel')).not.toBeVisible()
    const cta = within(recommendation!).getByText('Beiträge anpassen')
    expect(cta).not.toBeVisible()
    expect(exports!.closest('section')).toHaveAttribute('id', 'details')
    const csv = within(exports!).getByText('CSV exportieren')
    const print = within(exports!).getByText('PDF drucken')
    expect(csv).not.toBeVisible()
    expect(print).not.toBeVisible()

    fireEvent.click(risk!.querySelector('summary')!)
    expect(risk!.querySelector('.toolbar')).toBeVisible()
    fireEvent.click(recommendation!.querySelector('summary')!)
    expect(cta).toBeVisible()
    fireEvent.click(exports!.querySelector('summary')!)
    expect(csv).toBeVisible()
    const printWindow = vi.spyOn(window, 'print').mockImplementation(() => {})
    fireEvent.click(print)
    expect(printWindow).toHaveBeenCalledOnce()

    fireEvent.click(exports!.querySelector('summary')!)
    expect(print).not.toBeVisible()
    const report = document.querySelector('#print-report')!
    expect(report).toBeInTheDocument()
    expect(report.closest('details')).toBeNull()
    expect(report.firstElementChild).toHaveClass('pr-disclaimer')
  })

  it('passes the blocked labels into the print report when readiness is incomplete', async () => {
    saveIncompletePlan()
    render(<App />)
    await waitFor(() => expect(document.querySelector('#print-report')).not.toBeNull(), {
      timeout: 8000,
    })

    const report = document.querySelector('#print-report')
    expect(report?.textContent).toContain('Netto-Gesamtrente nicht berechnet')
    expect(report?.textContent).toContain('Die Angaben zu deiner gesetzlichen Rente stehen noch aus.')
  })

  it('emits no suppression notice when the total is allowed', async () => {
    saveCompletePlan()
    render(<App />)
    await waitFor(() => expect(document.querySelector('#print-report')).not.toBeNull(), {
      timeout: 8000,
    })

    const report = document.querySelector('#print-report')
    expect(report?.textContent).not.toContain('Netto-Gesamtrente nicht berechnet')
  })
})
