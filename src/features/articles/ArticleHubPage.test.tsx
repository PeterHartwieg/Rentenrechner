// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import type { Route } from '../../app/useRoute'
import { ArticleHubPage } from './ArticleHubPage'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import { HUB_CLUSTERS } from '../landing/hubClusters'
import { eachViewport } from '../../test/viewport'

afterEach(() => {
  cleanup()
})

function inShell(node: ReactElement, route: Route = '/artikel') {
  return createElement(AppShell, { route, navigate: () => {}, children: node })
}

describe('ArticleHubPage — /artikel route content', () => {
  it('renders the registry H1 "Artikel"', () => {
    const { getByRole } = render(<ArticleHubPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/artikel'].h1,
    )
  })

  it('renders each cluster heading from HUB_CLUSTERS as an h2', () => {
    const { container } = render(<ArticleHubPage />)
    const h2Texts = Array.from(container.querySelectorAll('h2')).map(
      (h) => h.textContent ?? '',
    )
    for (const cluster of HUB_CLUSTERS) {
      expect(h2Texts).toContain(cluster.heading)
    }
  })

  it('links to every clustered route in the registry', () => {
    const { container } = render(<ArticleHubPage />)
    const links = Array.from(container.querySelectorAll('.hub-card-link')).map(
      (a) => a.getAttribute('href'),
    )
    for (const cluster of HUB_CLUSTERS) {
      for (const link of cluster.links) {
        // HUB_CLUSTERS hrefs carry a trailing slash; the rendered article cards
        // emit the same form so direct loads hit the with-slash path the CDN
        // serves natively.
        expect(links).toContain(link.href)
      }
    }
  })

  it('shows the per-cluster article count (mono kicker)', () => {
    const { container } = render(<ArticleHubPage />)
    const counts = Array.from(container.querySelectorAll('.hub-group-count')).map(
      (n) => n.textContent ?? '',
    )
    for (const cluster of HUB_CLUSTERS) {
      const expected = `${cluster.links.length} Artikel`
      expect(counts).toContain(expected)
    }
  })

  it('shows the total article count and a latest-modified date in the kicker', () => {
    const { container } = render(<ArticleHubPage />)
    const kicker = container.querySelector('.hub-kicker')
    expect(kicker).not.toBeNull()
    const totalLinks = HUB_CLUSTERS.reduce((acc, c) => acc + c.links.length, 0)
    expect(kicker!.textContent).toContain(`${totalLinks} Beiträge`)
    // The latest date is derived from the registry's max dateModified across
    // articles; assert it is a YYYY-MM-DD string of the expected shape.
    expect(kicker!.textContent).toMatch(/zuletzt aktualisiert \d{4}-\d{2}-\d{2}/)
  })

  it('renders a "Stand:" line tied to the registry dateModified', () => {
    const { container } = render(<ArticleHubPage />)
    const stand = container.querySelector('.hub-stand')
    expect(stand).not.toBeNull()
    expect(stand!.textContent).toContain(`Stand: ${publicRouteRegistry['/artikel'].dateModified}`)
  })

  it('contains no fictional bylines (M. Sahin / L. Vogel / Fachprüfung / 318 Contributor)', () => {
    const { container } = render(<ArticleHubPage />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/M\.\s?Sahin/i)
    expect(text).not.toMatch(/L\.\s?Vogel/i)
    expect(text).not.toMatch(/Fachprüfung/i)
    expect(text).not.toMatch(/318\s?Contributor/i)
    expect(text).not.toMatch(/CC\s?BY-SA/i)
  })

  it('emits a WebPage JSON-LD block for the hub itself', () => {
    const html = renderToString(<ArticleHubPage />)
    // JSON-LD is pretty-printed (JSON.stringify with spacing) so we match on
    // the key fragments instead of byte-exact serialisation.
    expect(html).toMatch(/"@type"\s*:\s*"WebPage"/)
    expect(html).toMatch(/"name"\s*:\s*"Artikel zur Altersvorsorge \| RentenWiki\.de"/)
  })

  it('renders the not-advice disclaimer when wrapped in AppShell (compliance)', () => {
    const { container } = render(inShell(<ArticleHubPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('does not import engine code (no formatted EUR in rendered HTML)', () => {
    const html = renderToString(<ArticleHubPage />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders the hub without throwing at all three viewports', () => {
    eachViewport(() => {
      expect(() => renderToString(inShell(<ArticleHubPage />))).not.toThrow()
    })
  })
})
