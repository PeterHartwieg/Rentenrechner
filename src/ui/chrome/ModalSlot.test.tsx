// @vitest-environment jsdom
/**
 * Tests for ModalSlot (R2.1 / H1) — Sober D modal primitive.
 *
 * Coverage:
 *   - Renders nothing when `open === false`.
 *   - Renders panel + header + close button + body when open.
 *   - Title + eyebrow surface as accessible text.
 *   - role="dialog", aria-modal="true", aria-labelledby points at the title.
 *   - ESC keypress fires `onClose`.
 *   - Backdrop click fires `onClose`.
 *   - Close (X) button fires `onClose`.
 *   - Closing the modal restores body overflow (i.e. the lock is released).
 *   - Children are rendered inside `.rw-modal-slot__body`.
 *   - Default close-label is "Dialog schließen"; custom labels override it
 *     on both the X button and the backdrop.
 *   - panelClassName extends the panel class list without replacing the
 *     base `.rw-modal-slot__panel` class.
 *
 * These are the primitive's own a11y + interaction guarantees. Each
 * downstream consumer (InventoryWizard, future RecommenderCard modal,
 * LückeSchließenModal) gets these for free by composing through this
 * primitive, so they don't need to re-test focus trap / ESC / backdrop.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModalSlot } from './ModalSlot'

afterEach(() => {
  cleanup()
  // Defensive: any test that mounted ModalSlot locks body overflow; on
  // unmount the effect cleanup restores the previous value. Reset
  // explicitly here so a failing test can't leak a stuck overflow into
  // the next one.
  document.body.style.overflow = ''
})

describe('ModalSlot — open / closed', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <ModalSlot open={false} onClose={() => {}} title="Hidden">
        <p>Body</p>
      </ModalSlot>,
    )
    expect(container.querySelector('.rw-modal-slot')).toBeNull()
  })

  it('renders panel + header + body when open is true', () => {
    const { container } = render(
      <ModalSlot open onClose={() => {}} title="Sichtbar">
        <p>Body</p>
      </ModalSlot>,
    )
    expect(container.querySelector('.rw-modal-slot')).not.toBeNull()
    expect(container.querySelector('.rw-modal-slot__panel')).not.toBeNull()
    expect(container.querySelector('.rw-modal-slot__header')).not.toBeNull()
    expect(container.querySelector('.rw-modal-slot__body')).not.toBeNull()
  })
})

describe('ModalSlot — accessibility wiring', () => {
  it('exposes role="dialog" with aria-modal on the panel', () => {
    render(
      <ModalSlot open onClose={() => {}} title="Test">
        <p>Body</p>
      </ModalSlot>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toBeNull()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('wires aria-labelledby to the title element', () => {
    render(
      <ModalSlot open onClose={() => {}} title="Wizard Title">
        <p>Body</p>
      </ModalSlot>,
    )
    const dialog = screen.getByRole('dialog')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).not.toBeNull()
    const heading = document.getElementById(labelledBy!)
    expect(heading?.textContent).toBe('Wizard Title')
  })

  it('renders the eyebrow when supplied', () => {
    render(
      <ModalSlot open onClose={() => {}} title="Mit Eyebrow" eyebrow="Schritt 1 von 2">
        <p>Body</p>
      </ModalSlot>,
    )
    expect(screen.getByText('Schritt 1 von 2')).not.toBeNull()
  })

  it('omits the eyebrow node when not supplied', () => {
    const { container } = render(
      <ModalSlot open onClose={() => {}} title="Ohne Eyebrow">
        <p>Body</p>
      </ModalSlot>,
    )
    expect(container.querySelector('.rw-modal-slot__eyebrow')).toBeNull()
  })

  it('uses "Dialog schließen" as the default close-button aria-label', () => {
    render(
      <ModalSlot open onClose={() => {}} title="Default">
        <p>Body</p>
      </ModalSlot>,
    )
    expect(screen.getAllByLabelText('Dialog schließen').length).toBeGreaterThan(0)
  })

  it('honours closeLabel for both the X button and the backdrop', () => {
    render(
      <ModalSlot
        open
        onClose={() => {}}
        title="Custom label"
        closeLabel="Bestandsaufnahme schließen"
      >
        <p>Body</p>
      </ModalSlot>,
    )
    // Both the backdrop button and the close button share the same
    // dismiss semantics, so they both wear the custom label.
    expect(screen.getAllByLabelText('Bestandsaufnahme schließen').length).toBe(2)
  })
})

describe('ModalSlot — close handlers', () => {
  it('fires onClose when the close (X) button is clicked', () => {
    const onClose = vi.fn()
    render(
      <ModalSlot open onClose={onClose} title="ESC test">
        <p>Body</p>
      </ModalSlot>,
    )
    const closeBtn = screen.getAllByLabelText('Dialog schließen')[1]
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('fires onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ModalSlot open onClose={onClose} title="Backdrop test">
        <p>Body</p>
      </ModalSlot>,
    )
    const backdrop = container.querySelector<HTMLButtonElement>('.rw-modal-slot__backdrop')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('fires onClose when ESC is pressed', () => {
    const onClose = vi.fn()
    render(
      <ModalSlot open onClose={onClose} title="ESC test">
        <p>Body</p>
      </ModalSlot>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('ModalSlot — body scroll lock', () => {
  it('sets body overflow: hidden while open', () => {
    document.body.style.overflow = ''
    render(
      <ModalSlot open onClose={() => {}} title="Lock test">
        <p>Body</p>
      </ModalSlot>,
    )
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restores the previous overflow value on unmount', () => {
    document.body.style.overflow = 'scroll'
    const { unmount } = render(
      <ModalSlot open onClose={() => {}} title="Restore test">
        <p>Body</p>
      </ModalSlot>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('does not lock body overflow when open is false', () => {
    document.body.style.overflow = ''
    render(
      <ModalSlot open={false} onClose={() => {}} title="Closed">
        <p>Body</p>
      </ModalSlot>,
    )
    expect(document.body.style.overflow).toBe('')
  })
})

describe('ModalSlot — composition', () => {
  it('renders children inside .rw-modal-slot__body', () => {
    const { container } = render(
      <ModalSlot open onClose={() => {}} title="Children test">
        <p data-testid="child-body">Hello from inside</p>
      </ModalSlot>,
    )
    const body = container.querySelector('.rw-modal-slot__body')
    expect(body).not.toBeNull()
    expect(body!.querySelector('[data-testid="child-body"]')).not.toBeNull()
  })

  it('appends panelClassName to the panel without replacing the base class', () => {
    const { container } = render(
      <ModalSlot
        open
        onClose={() => {}}
        title="Panel class test"
        panelClassName="rw-modal-slot__panel--wide"
      >
        <p>Body</p>
      </ModalSlot>,
    )
    const panel = container.querySelector('.rw-modal-slot__panel')
    expect(panel).not.toBeNull()
    expect(panel!.classList.contains('rw-modal-slot__panel--wide')).toBe(true)
  })
})
