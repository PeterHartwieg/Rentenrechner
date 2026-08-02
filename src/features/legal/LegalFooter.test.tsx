// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QaFeedbackProvider } from '../qa-feedback/QaFeedbackProvider'
import { eachViewport, mockViewport } from '../../test/viewport'
import { LegalFooter } from './LegalFooter'

function renderFooter() {
  return render(
    <QaFeedbackProvider>
      <LegalFooter navigate={() => undefined} />
    </QaFeedbackProvider>,
  )
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  vi.unstubAllEnvs()
  mockViewport('desktop')
})

describe('LegalFooter', () => {
  it('renders the permanent legal and methodology links', () => {
    renderFooter()

    expect(screen.getByText('Impressum')).toBeTruthy()
    expect(screen.getByText('Datenschutzerklärung')).toBeTruthy()
    expect(screen.getByText('Lizenz: PolyForm Noncommercial 1.0.0')).toBeTruthy()
    expect(screen.getByText('↗ Methode im Detail')).toBeTruthy()
  })

  it('does not expose the retired soft-launch QA activator', () => {
    vi.stubEnv('VITE_QA_FOOTER_BUTTON', 'true')
    renderFooter()

    expect(screen.queryByText(/Sie testen für uns/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Feedback Modus starten/ })).toBeNull()
  })

  it('retains the legal footer at every supported viewport', () => {
    eachViewport(() => {
      const { container, unmount } = renderFooter()
      expect(container.textContent ?? '').toContain('Impressum')
      expect(container.textContent ?? '').toContain('Datenschutzerklärung')
      unmount()
    })
  })

  it('renders all methodology footnotes', () => {
    renderFooter()
    expect(screen.getByText(/Annahme: 5 % Rendite/)).toBeInTheDocument()
    expect(screen.getByText(/Steuern nach Stand 2026/)).toBeInTheDocument()
    expect(screen.getByText(/GRV-Werte: DRV-Renteninformation/)).toBeInTheDocument()
  })

  it('renders the methodology destination as a real link', () => {
    renderFooter()
    const link = screen.getByText(/Methode im Detail/)
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/methode')
  })

  it('uses SPA navigation for a primary click on the methodology link', () => {
    const navigate = vi.fn()
    render(
      <QaFeedbackProvider>
        <LegalFooter navigate={navigate} />
      </QaFeedbackProvider>,
    )
    fireEvent.click(screen.getByText(/Methode im Detail/))
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'methode' }))
  })
})
