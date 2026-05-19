// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import type { Route } from '../../app/useRoute'
import { ArticleLayout } from './ArticleLayout'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'

afterEach(() => {
  cleanup()
})

function inShell(node: ReactElement, route: Route = '/rentenluecke-rechner') {
  return createElement(AppShell, { route, navigate: () => {}, children: node })
}

describe('ArticleLayout — chrome and metadata invariants', () => {
  it('renders the registry h1 + summary for the given routeId', () => {
    const { getByRole, container } = render(
      <ArticleLayout routeId="/rentenluecke-rechner">
        <p>body</p>
      </ArticleLayout>,
    )
    const expected = publicRouteRegistry['/rentenluecke-rechner']
    expect(getByRole('heading', { level: 1 }).textContent).toBe(expected.h1)
    expect(container.textContent).toContain(expected.summary.slice(0, 40))
  })

  it('renders the "Stand:" line tied to the registry dateModified', () => {
    const { container } = render(
      <ArticleLayout routeId="/bav-rechner">
        <p>body</p>
      </ArticleLayout>,
    )
    expect(container.textContent).toContain(
      `Stand: ${publicRouteRegistry['/bav-rechner'].dateModified}`,
    )
  })

  it('renders the breadcrumb back-links to / and /artikel + the cluster heading', () => {
    const { container } = render(
      <ArticleLayout routeId="/etf-vs-bav">
        <p>body</p>
      </ArticleLayout>,
    )
    const crumb = container.querySelector('.article-breadcrumb')
    expect(crumb).not.toBeNull()
    const anchors = Array.from(crumb!.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(anchors).toContain('/')
    expect(anchors).toContain('/artikel')
    // /etf-vs-bav lives in the "bAV und ETF" cluster of HUB_CLUSTERS.
    expect(crumb!.textContent).toContain('bAV und ETF')
  })

  it('renders the per-route calculatorCta link on the page body', () => {
    const { container } = render(
      <ArticleLayout routeId="/riester-rechner">
        <p>body</p>
      </ArticleLayout>,
    )
    const cta = container.querySelector('a.article-cta')
    expect(cta).not.toBeNull()
    expect(cta!.getAttribute('href')).toBe(
      publicRouteRegistry['/riester-rechner'].calculatorCta.href,
    )
  })

  it('renders the children inside .article-body so MDX h2 anchors keep their ids for SEO permalinks', () => {
    const { container } = render(
      <ArticleLayout routeId="/basisrente-rechner">
        <h2 id="warum">Warum?</h2>
        <p>Inhalt</p>
      </ArticleLayout>,
    )
    const body = container.querySelector('.article-body')
    expect(body).not.toBeNull()
    const h2 = body!.querySelector('h2#warum')
    expect(h2).not.toBeNull()
  })

  it('exposes the right-rail "Zum gleichen Thema" card with relatedRoutes', () => {
    const { container } = render(
      <ArticleLayout routeId="/riester-vs-altersvorsorgedepot">
        <p>body</p>
      </ArticleLayout>,
    )
    const card = container.querySelector('.article-aside-card--related')
    expect(card).not.toBeNull()
    const links = Array.from(card!.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    // /riester-vs-altersvorsorgedepot relatedRoutes: '/', '/rentenluecke-rechner',
    // '/riester-rechner', '/altersvorsorgedepot-rechner'. '/' is filtered (it
    // duplicates the breadcrumb).
    expect(links).toContain('/rentenluecke-rechner/')
    expect(links).toContain('/riester-rechner/')
    expect(links).toContain('/altersvorsorgedepot-rechner/')
  })

  it('renders the LegalFooter inline (so /impressum and /datenschutz survive in-isolation renders)', () => {
    const { container } = render(
      <ArticleLayout routeId="/rente-netto-berechnen">
        <p>body</p>
      </ArticleLayout>,
    )
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toContain('/impressum/')
    expect(hrefs).toContain('/datenschutz/')
  })

  it('renders the disclaimer banner when wrapped in AppShell', () => {
    const { container } = render(
      inShell(
        <ArticleLayout routeId="/rentenluecke-rechner">
          <p>body</p>
        </ArticleLayout>,
      ),
    )
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('survives SSR (renderToString does not throw)', () => {
    expect(() =>
      renderToString(
        <ArticleLayout routeId="/private-rentenversicherung-rechner">
          <h2 id="x">x</h2>
          <p>body</p>
        </ArticleLayout>,
      ),
    ).not.toThrow()
  })

  it('does not surface fictional bylines (M. Sahin / L. Vogel / Fachprüfung)', () => {
    const { container } = render(
      <ArticleLayout routeId="/bav-rechner">
        <p>body</p>
      </ArticleLayout>,
    )
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/M\.\s?Sahin/i)
    expect(text).not.toMatch(/L\.\s?Vogel/i)
    expect(text).not.toMatch(/Fachprüfung/i)
    expect(text).not.toMatch(/CC\s?BY-SA/i)
  })

  it('applies an italic-accent on the H1 when accentTerm matches a substring', () => {
    const { container } = render(
      <ArticleLayout routeId="/bav-rechner" accentTerm="bAV">
        <p>body</p>
      </ArticleLayout>,
    )
    const accent = container.querySelector('.article-headline-accent')
    expect(accent).not.toBeNull()
    expect(accent!.textContent).toBe('bAV')
  })

  it('renders the headline plain when accentTerm is omitted', () => {
    const { container } = render(
      <ArticleLayout routeId="/bav-rechner">
        <p>body</p>
      </ArticleLayout>,
    )
    expect(container.querySelector('.article-headline-accent')).toBeNull()
  })

  it('defaults the GitHub edit link to the per-route MDX source path', () => {
    const { container } = render(
      <ArticleLayout routeId="/etf-vs-bav">
        <p>body</p>
      </ArticleLayout>,
    )
    const metaCard = container.querySelector('.article-aside-card--meta')
    const editLink = metaCard?.querySelector('a') as HTMLAnchorElement | null
    expect(editLink).not.toBeNull()
    // Per-route source path lives at src/features/publicPages/<slug>.body.mdx;
    // the default href must point at that file rather than the repo root.
    expect(editLink!.getAttribute('href')).toBe(
      'https://github.com/PeterHartwieg/Rentenrechner/edit/main/src/features/publicPages/etf-vs-bav.body.mdx',
    )
  })

  it('respects a caller-supplied githubEditHref override', () => {
    const { container } = render(
      <ArticleLayout routeId="/etf-vs-bav" githubEditHref="https://example.test/custom">
        <p>body</p>
      </ArticleLayout>,
    )
    const editLink = container.querySelector('.article-aside-card--meta a') as HTMLAnchorElement
    expect(editLink.getAttribute('href')).toBe('https://example.test/custom')
  })
})
