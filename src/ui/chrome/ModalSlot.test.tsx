// @vitest-environment jsdom
/**
 * Tests for ModalSlot — Sober D modal primitive.
 *
 * Coverage:
 *   R2.1 / H1 baseline:
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
 *   R4.2 / H10 additions:
 *   - Drag handle node renders unconditionally (CSS hides it outside the
 *     phone breakpoint) so SSR + hydration agree across viewports.
 *   - Touch-drag below the dismiss threshold snaps back (no onClose; inline
 *     transform cleared).
 *   - Touch-drag past the dismiss threshold (smaller of 80 px or 25 vh)
 *     fires onClose.
 *   - Active drag adds `.is-dragging` to the panel so CSS can suppress the
 *     snap-back transition for direct-finger tracking.
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

// R4.2 / H10 — phone swipe-to-dismiss + drag handle.
//
// The drag handle is rendered unconditionally so SSR + hydration agree
// across viewports; CSS hides it outside the phone breakpoint. Touch
// events bind to the drag-region wrapper around the handle + header so
// scrolling inside the body content is not hijacked.
describe('ModalSlot — phone drag-to-dismiss (R4.2 / H10)', () => {
  it('renders the drag handle node unconditionally', () => {
    const { container } = render(
      <ModalSlot open onClose={() => {}} title="Drag handle test">
        <p>Body</p>
      </ModalSlot>,
    )
    // The handle is always in the DOM so SSR + first client render agree
    // — the phone-only treatment is CSS-driven (display: block inside the
    // phone @media block, otherwise display: none).
    const handle = container.querySelector('.rw-modal-slot__drag-handle')
    expect(handle).not.toBeNull()
    // aria-hidden because the handle is decorative; the close path stays
    // owned by the X button + ESC + backdrop.
    expect(handle?.getAttribute('aria-hidden')).toBe('true')
  })

  it('wraps the handle and header in a drag-region with touch handlers', () => {
    const { container } = render(
      <ModalSlot open onClose={() => {}} title="Drag region test">
        <p>Body</p>
      </ModalSlot>,
    )
    const region = container.querySelector('.rw-modal-slot__drag-region')
    expect(region).not.toBeNull()
    // The region wraps both the handle and the header (so dragging on
    // the header dismisses too, not only the tiny handle pill).
    expect(region!.querySelector('.rw-modal-slot__drag-handle')).not.toBeNull()
    expect(region!.querySelector('.rw-modal-slot__header')).not.toBeNull()
  })

  it('adds .is-dragging while a touch drag is in progress', () => {
    const { container } = render(
      <ModalSlot open onClose={() => {}} title="Dragging class test">
        <p>Body</p>
      </ModalSlot>,
    )
    const region = container.querySelector('.rw-modal-slot__drag-region')!
    const panel = container.querySelector('.rw-modal-slot__panel')!
    expect(panel.classList.contains('is-dragging')).toBe(false)

    fireEvent.touchStart(region, { touches: [{ clientY: 100 }] })
    expect(panel.classList.contains('is-dragging')).toBe(true)

    fireEvent.touchEnd(region, { touches: [] })
    expect(panel.classList.contains('is-dragging')).toBe(false)
  })

  it('translates the panel during touchmove past the start position', () => {
    const { container } = render(
      <ModalSlot open onClose={() => {}} title="Drag transform test">
        <p>Body</p>
      </ModalSlot>,
    )
    const region = container.querySelector('.rw-modal-slot__drag-region')!
    const panel = container.querySelector<HTMLElement>('.rw-modal-slot__panel')!

    fireEvent.touchStart(region, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(region, { touches: [{ clientY: 140 }] })
    expect(panel.style.transform).toBe('translateY(40px)')

    // Releasing below the threshold (40 < 80) snaps back: transform is
    // cleared on touchend and the CSS transition (re-enabled by the
    // .is-dragging removal) handles the visible animation.
    fireEvent.touchEnd(region, { touches: [] })
    expect(panel.style.transform).toBe('')
  })

  it('does not move the panel upward (drag-up is ignored)', () => {
    const { container } = render(
      <ModalSlot open onClose={() => {}} title="Drag up test">
        <p>Body</p>
      </ModalSlot>,
    )
    const region = container.querySelector('.rw-modal-slot__drag-region')!
    const panel = container.querySelector<HTMLElement>('.rw-modal-slot__panel')!

    fireEvent.touchStart(region, { touches: [{ clientY: 200 }] })
    fireEvent.touchMove(region, { touches: [{ clientY: 100 }] }) // deltaY = -100
    // Drag-up is a no-op: only the panel transform stays clear.
    expect(panel.style.transform).toBe('')

    fireEvent.touchEnd(region, { touches: [] })
    expect(panel.style.transform).toBe('')
  })

  it('does NOT fire onClose when the drag ends below the dismiss threshold', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ModalSlot open onClose={onClose} title="Below threshold test">
        <p>Body</p>
      </ModalSlot>,
    )
    const region = container.querySelector('.rw-modal-slot__drag-region')!

    fireEvent.touchStart(region, { touches: [{ clientY: 100 }] })
    // deltaY = 70 — below the 80 px minimum threshold.
    fireEvent.touchMove(region, { touches: [{ clientY: 170 }] })
    fireEvent.touchEnd(region, { touches: [] })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('fires onClose when the drag ends past the dismiss threshold', () => {
    // Force a tall viewport so the 25 vh upper bound stays above the
    // 80 px floor, making the floor the effective threshold; the touch
    // delta (200 px) is comfortably past it either way.
    Object.defineProperty(window, 'innerHeight', {
      value: 900,
      configurable: true,
      writable: true,
    })
    const onClose = vi.fn()
    const { container } = render(
      <ModalSlot open onClose={onClose} title="Past threshold test">
        <p>Body</p>
      </ModalSlot>,
    )
    const region = container.querySelector('.rw-modal-slot__drag-region')!

    fireEvent.touchStart(region, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(region, { touches: [{ clientY: 300 }] }) // deltaY = 200
    fireEvent.touchEnd(region, { touches: [] })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('treats touchcancel like touchend (cancel snaps back, no onClose)', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ModalSlot open onClose={onClose} title="Touch cancel test">
        <p>Body</p>
      </ModalSlot>,
    )
    const region = container.querySelector('.rw-modal-slot__drag-region')!
    const panel = container.querySelector<HTMLElement>('.rw-modal-slot__panel')!

    fireEvent.touchStart(region, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(region, { touches: [{ clientY: 150 }] })
    fireEvent.touchCancel(region, { touches: [] })

    expect(onClose).not.toHaveBeenCalled()
    expect(panel.style.transform).toBe('')
    expect(panel.classList.contains('is-dragging')).toBe(false)
  })
})
