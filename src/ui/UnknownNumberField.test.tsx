// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { InputStatus } from '../domain'
import { UnknownNumberField } from './UnknownNumberField'

afterEach(cleanup)

function ControlledField() {
  const [value, setValue] = useState<number | null>(125)
  const [status, setStatus] = useState<InputStatus>('assumed')
  return <UnknownNumberField label="Monatsbeitrag" value={value} status={status} onChange={(next, nextStatus) => {
    if (nextStatus !== 'unknown') setValue(next)
    setStatus(nextStatus)
  }} />
}

describe('UnknownNumberField', () => {
  it('retains the parent value through unknown and restores it when unchecked', () => {
    render(<ControlledField />)
    const input = screen.getByRole('spinbutton', { name: 'Monatsbeitrag' })
    const checkbox = screen.getByRole('checkbox', { name: 'Monatsbeitrag: Weiß ich nicht' })
    expect(input).toHaveValue(125)
    expect(input).toHaveAccessibleDescription('Angenommen')
    fireEvent.click(checkbox)
    expect(input).toHaveValue(null)
    expect(input).toBeEnabled()
    expect(input).toHaveAccessibleDescription('Unbekannt')
    fireEvent.click(checkbox)
    expect(input).toHaveValue(125)
  })

  it('typing zero clears unknown, and clearing the input never becomes zero', () => {
    render(<ControlledField />)
    const input = screen.getByRole('spinbutton')
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    fireEvent.change(input, { target: { value: '0' } })
    expect(checkbox).not.toBeChecked()
    expect(input).toHaveValue(0)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(input).toHaveValue(null)
    expect(checkbox).not.toBeChecked()
  })

  it('reports the exact unknown transition without rounding numeric edits', () => {
    const onChange = vi.fn()
    render(<UnknownNumberField label="Kosten" value={1.234567} status="document" step={0.01} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')
    expect(input).toHaveValue(1.23)
    expect(input).toHaveAccessibleDescription('lt. Beleg')
    fireEvent.change(input, { target: { value: '2.34567' } })
    expect(onChange).toHaveBeenLastCalledWith(2.34567, 'entered')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenLastCalledWith(null, 'unknown')
  })

  it('connects unique labels and descriptions for repeated fields', () => {
    render(<><UnknownNumberField label="Beitrag A" value={null} status="unknown" onChange={vi.fn()} />
      <UnknownNumberField label="Beitrag B" value={100} status="entered" onChange={vi.fn()} /></>)
    const inputs = screen.getAllByRole('spinbutton')
    const checkboxes = screen.getAllByRole('checkbox')
    expect(new Set([...inputs, ...checkboxes].map((input) => input.id)).size).toBe(4)
    expect(inputs[0]).toHaveAccessibleDescription('Unbekannt')
    expect(checkboxes[1]).toHaveAccessibleDescription('Von dir angegeben')
  })

  it('supports precision overrides, units, bounds and an accessible range hint', () => {
    render(<UnknownNumberField label="Beitrag" value={12.345} status="entered" decimals={2} min={0} max={100} unit="€" onChange={vi.fn()} />)
    const input = screen.getByRole('spinbutton')
    expect(input).toHaveValue(12.35)
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('max', '100')
    fireEvent.change(input, { target: { value: '150' } })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Von dir angegeben Bitte höchstens 100 € eingeben.')
  })
})
