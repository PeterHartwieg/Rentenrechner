// @vitest-environment jsdom
/**
 * Combine-mode household editor restored after the CombineDashboardSidebar
 * retirement (Codex PR #347 R3). Covers the two stranded fields:
 * Ehegattensplitting (baseline.partner) and exact child birth years.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { defaultWorkspace } from '../../storage'
import type { Scenario } from '../../domain/workspace'
import { CombineHaushaltSection } from './CombineHaushaltSection'

afterEach(() => cleanup())

const baseline: Scenario = defaultWorkspace.baseline
const withPartner: Scenario = {
  ...baseline,
  partner: { ...baseline.profile, grossSalaryYear: 0 },
}

describe('CombineHaushaltSection — Ehegattensplitting', () => {
  it('reflects baseline.partner in the checkbox state', () => {
    const { getByRole } = render(
      <CombineHaushaltSection baseline={withPartner} onPatchBaseline={vi.fn()} />,
    )
    expect((getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  })

  it('enabling splitting patches a zero-salary partner clone', () => {
    const onPatchBaseline = vi.fn()
    const { getByRole } = render(
      <CombineHaushaltSection baseline={baseline} onPatchBaseline={onPatchBaseline} />,
    )
    fireEvent.click(getByRole('checkbox'))
    expect(onPatchBaseline).toHaveBeenCalledTimes(1)
    const patch = onPatchBaseline.mock.calls[0]![0] as { partner?: { grossSalaryYear: number } }
    expect(patch.partner).toBeDefined()
    expect(patch.partner!.grossSalaryYear).toBe(0)
  })

  it('disabling splitting clears baseline.partner', () => {
    const onPatchBaseline = vi.fn()
    const { getByRole } = render(
      <CombineHaushaltSection baseline={withPartner} onPatchBaseline={onPatchBaseline} />,
    )
    fireEvent.click(getByRole('checkbox'))
    expect(onPatchBaseline).toHaveBeenCalledWith({ partner: undefined })
  })
})

describe('CombineHaushaltSection — child birth years', () => {
  it('parses a comma/semicolon/space list into childBirthYears', () => {
    const onPatchBaseline = vi.fn()
    const { container } = render(
      <CombineHaushaltSection baseline={baseline} onPatchBaseline={onPatchBaseline} />,
    )
    const textInput = container.querySelector('input[type="text"]') as HTMLInputElement
    fireEvent.change(textInput, { target: { value: '2008, 2012; 2015' } })
    // Commit-on-blur: the draft is not parsed/dispatched until blur, so a
    // partial edit (e.g. "2008,") isn't normalised away mid-typing.
    expect(onPatchBaseline).not.toHaveBeenCalled()
    fireEvent.blur(textInput)
    expect(onPatchBaseline).toHaveBeenCalledWith({
      profile: { ...baseline.profile, childBirthYears: [2008, 2012, 2015] },
    })
  })

  it('filters out non-year garbage (NaN, pre-1900)', () => {
    const onPatchBaseline = vi.fn()
    const { container } = render(
      <CombineHaushaltSection baseline={baseline} onPatchBaseline={onPatchBaseline} />,
    )
    const textInput = container.querySelector('input[type="text"]') as HTMLInputElement
    fireEvent.change(textInput, { target: { value: '2008, abc, 1850, 2020' } })
    fireEvent.blur(textInput)
    const patch = onPatchBaseline.mock.calls[0]![0] as { profile: { childBirthYears: number[] } }
    expect(patch.profile.childBirthYears).toEqual([2008, 2020])
  })
})
