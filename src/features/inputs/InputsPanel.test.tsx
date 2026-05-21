// @vitest-environment jsdom

import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InputsPanel } from './InputsPanel'
import { nextInflationRateForExpertToggle } from './inflationExpert'
import type { ScenarioAssumptions } from '../../domain'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import { syncMonthlyContributions } from '../../app/syncContributions'
import { simulateRetirementComparison } from '../../engine/simulate'
import { eachViewport, mockViewport } from '../../test/viewport'

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

function TestHarness() {
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(
    () => syncMonthlyContributions(200, defaultAssumptions, defaultProfile, de2026Rules),
  )
  const simulation = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
  const selectedResults = simulation.products.filter((product) => product.scenarioId === 'basis')

  return (
    <InputsPanel
      profile={defaultProfile}
      onProfileChange={vi.fn()}
      assumptions={assumptions}
      onAssumptionsChange={setAssumptions}
      onSyncMonthlyContribution={(target) =>
        setAssumptions((current) =>
          syncMonthlyContributions(target, current, defaultProfile, de2026Rules),
        )
      }
      resetToDefaults={vi.fn()}
      simulation={simulation}
      selectedResults={selectedResults}
      scenarioLib={{
        library: [],
        save: vi.fn(),
        load: vi.fn(),
        duplicate: vi.fn(),
        remove: vi.fn(),
        rename: vi.fn(),
      }}
      kvdrMember={true}
      bavLumpSumTaxMode="voll_versorgungsbezug"
      insuranceTaxMode="halbeinkuenfte"
      insuranceResult={undefined}
      tarifgebunden={false}
      onTarifgebundenChange={vi.fn()}
    />
  )
}

describe('InputsPanel standard assumptions', () => {
  it('renders one public Netto-Beitrag input with 100/200/400 presets and no compare-mode copy', () => {
    const { container } = render(<TestHarness />)

    expect((screen.getByLabelText(/Netto-Beitrag/) as HTMLInputElement).value).toBe('200')
    expect(screen.getByRole('button', { name: '100 EUR' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '200 EUR' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '400 EUR' })).toBeTruthy()

    expect(container.textContent).not.toContain('Vergleichsmodus')
    expect(container.textContent).not.toContain('bAV-Anker')
    expect(container.textContent).not.toContain('Gleicher Beitrag')
  })

  it('exposes inflation only as an expert assumption and toggles it to 2 percent by default', () => {
    render(<TestHarness />)

    expect(screen.queryByLabelText(/Inflationsrate/)).toBeNull()
    fireEvent.click(screen.getByLabelText('Inflation berücksichtigen'))
    expect((screen.getByLabelText(/Inflationsrate/) as HTMLInputElement).value).toBe('2')
  })

  it('remembers an explicit expert inflation rate across off/on toggles', () => {
    render(<TestHarness />)

    fireEvent.click(screen.getByLabelText('Inflation berücksichtigen'))
    const input = screen.getByLabelText(/Inflationsrate/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '3.5' } })
    fireEvent.blur(input)

    fireEvent.click(screen.getByLabelText('Inflation berücksichtigen'))
    expect(screen.queryByLabelText(/Inflationsrate/)).toBeNull()
    fireEvent.click(screen.getByLabelText('Inflation berücksichtigen'))

    expect((screen.getByLabelText(/Inflationsrate/) as HTMLInputElement).value).toBe('3.5')
  })
})

describe('InputsPanel — viewport sweep (PR 11)', () => {
  it('renders the Netto-Beitrag input at phone / tablet / desktop', () => {
    eachViewport(() => {
      const { unmount } = render(<TestHarness />)
      expect((screen.getByLabelText(/Netto-Beitrag/) as HTMLInputElement).value).toBe('200')
      unmount()
    })
  })
})

describe('nextInflationRateForExpertToggle', () => {
  it('turns expert inflation off by making the active modeled rate zero', () => {
    expect(nextInflationRateForExpertToggle(false, 0.035)).toBe(0)
  })

  it('turns expert inflation on at 2 percent unless a positive rate already exists', () => {
    expect(nextInflationRateForExpertToggle(true, 0)).toBe(0.02)
    expect(nextInflationRateForExpertToggle(true, 0.035)).toBe(0.035)
    expect(nextInflationRateForExpertToggle(true, 0, 0.035)).toBe(0.035)
  })
})
