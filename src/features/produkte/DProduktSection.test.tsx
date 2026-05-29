// @vitest-environment jsdom

/**
 * `DProduktSection` (CX-PR3-2) — a11y regression: the `<fieldset>` must
 * expose its accessible name so screen readers announce the § kicker as the
 * group name. Tests use `getByRole('group', { name })` per the WAI-ARIA spec
 * (fieldset maps to `group` role; accessible name comes from `aria-labelledby`).
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DProduktSection } from './DProduktSection'

afterEach(() => cleanup())

describe('DProduktSection — CX-PR3-2 accessible group name', () => {
  it('fieldset is announced with the legend text as its accessible name', () => {
    const { getByRole } = render(
      <DProduktSection legend="§ 2 · Eigene Verträge" note="Deine Sparpläne.">
        <p>child content</p>
      </DProduktSection>,
    )
    // WAI-ARIA: <fieldset> maps to role="group". `aria-labelledby` must
    // supply the accessible name so screen readers announce the § kicker.
    expect(
      getByRole('group', { name: /§ 2 · Eigene Verträge/i }),
    ).toBeInTheDocument()
  })

  it('renders the note text alongside the legend', () => {
    const { getByText } = render(
      <DProduktSection legend="§ 1 · Gesetzliche Rente" note="Pflicht für Angestellte.">
        <span>child</span>
      </DProduktSection>,
    )
    expect(getByText('§ 1 · Gesetzliche Rente')).toBeInTheDocument()
    expect(getByText('Pflicht für Angestellte.')).toBeInTheDocument()
  })

  it('renders children inside the section body', () => {
    const { getByText } = render(
      <DProduktSection legend="§ 3 · Sparformen" note="Hinzufügen.">
        <span data-testid="child">child node</span>
      </DProduktSection>,
    )
    expect(getByText('child node')).toBeInTheDocument()
  })
})
