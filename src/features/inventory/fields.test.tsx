// @vitest-environment jsdom
/**
 * Tests for shared inventory field primitives (issue 10).
 *
 * Coverage:
 *   toNumber  — safe string-to-number with fallback
 *   InvField  — labelled wrapper rendering
 *   InvNumber — numeric input with commit-on-blur/Enter semantics
 *   InvSelect — select wrapped in shell div
 *   InvText   — text input wrapped in shell div
 *   Shared option tables — DFW_OPTIONS, PAYOUT_OPTIONS_FULL, PAYOUT_OPTIONS_NO_KAPITAL
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { InvField, InvNumber, InvSelect, InvText } from './fields'
import {
  toNumber,
  DFW_OPTIONS,
  PAYOUT_OPTIONS_FULL,
  PAYOUT_OPTIONS_NO_KAPITAL,
} from './fieldHelpers'

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// Programmatic label association (issue #69)
// ---------------------------------------------------------------------------

describe('InvField — programmatic label association', () => {
  it('getByLabelText finds the InvNumber input by its label', () => {
    render(
      <InvField label="Vertragsbeginn">
        <InvNumber value={2020} onChange={() => {}} />
      </InvField>,
    )
    const input = screen.getByLabelText('Vertragsbeginn') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('number')
    expect(input.value).toBe('2020')
  })

  it('getByLabelText finds the InvSelect control by its label', () => {
    const OPTIONS = [
      { value: 'leibrente', label: 'Leibrente' },
      { value: 'zeitrente', label: 'Zeitrente' },
    ] as const
    render(
      <InvField label="Auszahlungsform">
        <InvSelect value="leibrente" options={OPTIONS} onChange={() => {}} />
      </InvField>,
    )
    const select = screen.getByLabelText('Auszahlungsform') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('leibrente')
  })

  it('getByLabelText finds the InvText input by its label', () => {
    render(
      <InvField label="Anbieter">
        <InvText value="Allianz" onChange={() => {}} />
      </InvField>,
    )
    const input = screen.getByLabelText('Anbieter') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('text')
    expect(input.value).toBe('Allianz')
  })

  it('hint is wired via aria-describedby on the input control', () => {
    render(
      <InvField label="Monatsbeitrag" hint="Bruttobetrag eingeben">
        <InvNumber value={200} onChange={() => {}} />
      </InvField>,
    )
    const input = screen.getByLabelText('Monatsbeitrag')
    // the input itself should carry aria-describedby pointing to the hint paragraph
    const hintId = input.getAttribute('aria-describedby')
    expect(hintId).toBeTruthy()
    const hintEl = input.ownerDocument.getElementById(hintId!)
    expect(hintEl?.textContent).toBe('Bruttobetrag eingeben')
  })
})

// ---------------------------------------------------------------------------
// toNumber
// ---------------------------------------------------------------------------

describe('toNumber', () => {
  it('parses a valid integer string', () => {
    expect(toNumber('42')).toBe(42)
  })

  it('parses a valid float string', () => {
    expect(toNumber('3.14')).toBeCloseTo(3.14, 5)
  })

  it('returns 0 for an empty string (Number("") === 0 is finite)', () => {
    // Number('') === 0 which is finite, so it does not use the fallback.
    // This preserves the behaviour of the original sidebar toNumber helper.
    expect(toNumber('', 99)).toBe(0)
  })

  it('returns the fallback for a non-numeric string', () => {
    expect(toNumber('abc', 7)).toBe(7)
  })

  it('returns the fallback for NaN', () => {
    expect(toNumber('NaN', 5)).toBe(5)
  })

  it('returns 0 when called with empty string and no fallback (Number("") is 0)', () => {
    expect(toNumber('')).toBe(0)
  })

  it('handles negative numbers', () => {
    expect(toNumber('-10')).toBe(-10)
  })

  it('parses zero correctly', () => {
    expect(toNumber('0')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// InvField
// ---------------------------------------------------------------------------

describe('InvField', () => {
  it('renders the label text', () => {
    render(<InvField label="Vertragsbeginn"><span>child</span></InvField>)
    expect(screen.getByText('Vertragsbeginn')).toBeTruthy()
  })

  it('renders children', () => {
    render(<InvField label="Test"><span data-testid="inner">inner</span></InvField>)
    expect(screen.getByTestId('inner')).toBeTruthy()
  })

  it('renders hint when provided', () => {
    render(<InvField label="Test" hint="Hilfetext"><span /></InvField>)
    expect(screen.getByText('Hilfetext')).toBeTruthy()
  })

  it('does not render a hint paragraph when hint is omitted', () => {
    const { container } = render(<InvField label="Test"><span /></InvField>)
    expect(container.querySelector('.inventory-field-hint')).toBeNull()
  })

  it('wraps content in .inventory-field', () => {
    const { container } = render(<InvField label="Test"><span /></InvField>)
    expect(container.querySelector('.inventory-field')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// InvNumber
// ---------------------------------------------------------------------------

describe('InvNumber', () => {
  it('renders the current value', () => {
    const { container } = render(<InvNumber value={42} onChange={() => {}} />)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('42')
  })

  it('renders suffix when provided', () => {
    render(<InvNumber value={5} suffix="EUR" onChange={() => {}} />)
    expect(screen.getByText('EUR')).toBeTruthy()
  })

  it('does not render suffix element when omitted', () => {
    const { container } = render(<InvNumber value={5} onChange={() => {}} />)
    expect(container.querySelector('em')).toBeNull()
  })

  it('calls onChange during typing when value is valid', () => {
    const onChange = vi.fn()
    const { container } = render(<InvNumber value={0} onChange={onChange} />)
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '100' } })
    expect(onChange).toHaveBeenCalledWith(100)
  })

  it('does not call onChange for empty input during typing', () => {
    const onChange = vi.fn()
    const { container } = render(<InvNumber value={5} onChange={onChange} />)
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits value on blur', () => {
    const onChange = vi.fn()
    const { container } = render(<InvNumber value={0} onChange={onChange} />)
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '77' } })
    onChange.mockClear()
    fireEvent.blur(input)
    // The draft '77' is committed — onChange fired again on blur
    expect(onChange).toHaveBeenCalledWith(77)
  })

  it('commits value on Enter key', () => {
    const onChange = vi.fn()
    const { container } = render(<InvNumber value={0} onChange={onChange} />)
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '55' } })
    onChange.mockClear()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(55)
  })

  it('wraps input in .inventory-input-shell', () => {
    const { container } = render(<InvNumber value={0} onChange={() => {}} />)
    expect(container.querySelector('.inventory-input-shell')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// InvSelect
// ---------------------------------------------------------------------------

describe('InvSelect', () => {
  const OPTIONS = [
    { value: 'leibrente', label: 'Leibrente' },
    { value: 'zeitrente', label: 'Zeitrente' },
  ] as const

  it('renders all options', () => {
    render(<InvSelect value="leibrente" options={OPTIONS} onChange={() => {}} />)
    expect(screen.getByText('Leibrente')).toBeTruthy()
    expect(screen.getByText('Zeitrente')).toBeTruthy()
  })

  it('shows the current value as selected', () => {
    const { container } = render(
      <InvSelect value="zeitrente" options={OPTIONS} onChange={() => {}} />,
    )
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('zeitrente')
  })

  it('calls onChange with the selected value', () => {
    const onChange = vi.fn()
    const { container } = render(
      <InvSelect value="leibrente" options={OPTIONS} onChange={onChange} />,
    )
    const select = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'zeitrente' } })
    expect(onChange).toHaveBeenCalledWith('zeitrente')
  })

  it('wraps select in .inventory-select-shell', () => {
    const { container } = render(
      <InvSelect value="leibrente" options={OPTIONS} onChange={() => {}} />,
    )
    expect(container.querySelector('.inventory-select-shell')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// InvText
// ---------------------------------------------------------------------------

describe('InvText', () => {
  it('renders the current value', () => {
    const { container } = render(<InvText value="Allianz" onChange={() => {}} />)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('Allianz')
  })

  it('renders placeholder when provided', () => {
    const { container } = render(
      <InvText value="" placeholder="z. B. Allianz" onChange={() => {}} />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.placeholder).toBe('z. B. Allianz')
  })

  it('calls onChange on input change', () => {
    const onChange = vi.fn()
    const { container } = render(<InvText value="" onChange={onChange} />)
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Neue Bezeichnung' } })
    expect(onChange).toHaveBeenCalledWith('Neue Bezeichnung')
  })

  it('wraps input in .inventory-input-shell', () => {
    const { container } = render(<InvText value="" onChange={() => {}} />)
    expect(container.querySelector('.inventory-input-shell')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Shared option tables
// ---------------------------------------------------------------------------

describe('DFW_OPTIONS', () => {
  it('includes direktversicherung_3_63', () => {
    expect(DFW_OPTIONS.some((o) => o.value === 'direktversicherung_3_63')).toBe(true)
  })

  it('includes direktversicherung_40b_alt', () => {
    expect(DFW_OPTIONS.some((o) => o.value === 'direktversicherung_40b_alt')).toBe(true)
  })

  it('includes all 6 Durchführungsweg options', () => {
    expect(DFW_OPTIONS).toHaveLength(6)
  })
})

describe('PAYOUT_OPTIONS_FULL', () => {
  it('includes leibrente, zeitrente, and kapitalverzehr', () => {
    const values = PAYOUT_OPTIONS_FULL.map((o) => o.value)
    expect(values).toContain('leibrente')
    expect(values).toContain('zeitrente')
    expect(values).toContain('kapitalverzehr')
  })

  it('has exactly 3 entries', () => {
    expect(PAYOUT_OPTIONS_FULL).toHaveLength(3)
  })
})

describe('PAYOUT_OPTIONS_NO_KAPITAL', () => {
  it('includes leibrente and zeitrente but not kapitalverzehr', () => {
    const values = PAYOUT_OPTIONS_NO_KAPITAL.map((o) => o.value)
    expect(values).toContain('leibrente')
    expect(values).toContain('zeitrente')
    expect(values).not.toContain('kapitalverzehr')
  })

  it('has exactly 2 entries', () => {
    expect(PAYOUT_OPTIONS_NO_KAPITAL).toHaveLength(2)
  })
})
