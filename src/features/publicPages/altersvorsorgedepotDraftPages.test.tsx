// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { activeRules } from '../../rules'
import { publicRouteRegistry, type PublicRoute } from '../../seo/publicRouteRegistry'
import { generateSitemap } from '../../seo/sitemap'
import { HUB_CLUSTERS } from '../landing/hubClusters'
import { AltersvorsorgedepotAnbieterPage } from './AltersvorsorgedepotAnbieterPage'
import { AltersvorsorgedepotGesetzPage } from './AltersvorsorgedepotGesetzPage'
import anbieterFaq from './altersvorsorgedepot-anbieter.faq.json'
import gesetzFaq from './altersvorsorgedepot-gesetz.faq.json'

// ArticleLayout de-duplicates heading ids across the whole document.
afterEach(cleanup)

const DRAFTS = ['/altersvorsorgedepot-anbieter', '/altersvorsorgedepot-gesetz'] as const

describe('AV-Depot draft pages — publication gate', () => {
  it.each(DRAFTS)('%s is a draft: noindex, not in sitemap or hub', (id) => {
    const route: PublicRoute = publicRouteRegistry[id]
    expect(route.status).toBe('draft')
    expect(route.robots).toBe('noindex,follow')
    expect(route.inSitemap).toBe(false)
    expect(route.datePublished).toBeUndefined()
    expect(generateSitemap()).not.toContain(id)
    expect(HUB_CLUSTERS.flatMap((c) => c.links.map((l) => l.href))).not.toContain(`${id}/`)
  })

  it('no published route lists a draft among its related routes', () => {
    for (const route of Object.values(publicRouteRegistry) as PublicRoute[]) {
      if (route.status === 'draft') continue
      for (const draft of DRAFTS) expect(route.relatedRoutes).not.toContain(draft)
    }
  })

  it.each(DRAFTS)('%s carries FAQPage data from its .faq.json', (id) => {
    const faq = id === '/altersvorsorgedepot-anbieter' ? anbieterFaq : gesetzFaq
    const route: PublicRoute = publicRouteRegistry[id]
    expect(route.faq).toEqual(faq.map(({ q, a }) => ({ question: q, answer: a })))
  })
})

describe('/altersvorsorgedepot-anbieter', () => {
  it('renders all 84 rows from .rows in the default order', () => {
    const { container } = render(<AltersvorsorgedepotAnbieterPage />)
    const rows = container.querySelectorAll('.anbieter-table tbody tr')
    expect(rows).toHaveLength(84)
    expect(container.querySelectorAll('.anbieter-card')).toHaveLength(84)
    expect(rows[0].id).toBe('apobank')
    expect(screen.getByText(/Entwurf, nicht veröffentlicht\. Diese Seite/)).toBeTruthy()
  })

  it('exposes the anchors the copy and ArticleLayout rely on', () => {
    const { container } = render(<AltersvorsorgedepotAnbieterPage />)
    for (const id of ['anbietertabelle', 'methode', 'changelog', 'fuer-wen', 'fuer-wen-riester', 'fuer-wen-auszahlung']) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull()
    }
  })

  it('uses plain /go/ links with nofollow and no Werbelink', () => {
    const { container } = render(<AltersvorsorgedepotAnbieterPage />)
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('.anbieter-table a[href^="/go/"]'))
    expect(links).toHaveLength(82)
    for (const a of links) {
      expect(a.getAttribute('rel')).toBe('nofollow noopener')
      expect(a.getAttribute('aria-label')).toMatch(/^Zur Anbieterseite von .+ \(externe Seite\)$/)
    }
    expect(container.querySelector('.anbieter-legend')).toBeNull()
    expect(container.querySelectorAll('.anbieter-werbelink')).toHaveLength(0)
  })

  it('shows the cost type in every cost cell that has a number, k. A. otherwise', () => {
    const { container } = render(<AltersvorsorgedepotAnbieterPage />)
    const costCells = Array.from(container.querySelectorAll('.anbieter-table tbody tr'), (tr) => tr.children[6])
    const withNumber = costCells.filter((td) => td.querySelector('.anbieter-num'))
    expect(withNumber).toHaveLength(10)
    for (const td of withNumber) expect(td.querySelector('.anbieter-cost-art')?.textContent).toBeTruthy()
    for (const td of costCells.filter((c) => !c.querySelector('.anbieter-num'))) {
      expect(td.textContent).toBe('k. A.')
    }
    expect(container.textContent).toContain('Grundlagen unterschiedlich, nicht direkt vergleichbar')
  })

  it('states the 120 € statutory Mindesteigenbeitrag, not that it entfällt', () => {
    expect(activeRules.altersvorsorgedepot.minimumOwnContributionAnnual).toBe(120)
    const { container } = render(<AltersvorsorgedepotAnbieterPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Mindesteigenbeitrag von 120 Euro im Jahr/)
    expect(text).toMatch(/Für Zulagen gesetzlich: 120\s€ im Jahr/)
    expect(text).not.toMatch(/Mindesteigenbeitrag[^.]{0,120}entfällt/i)
  })

  it('sorts and filters on the client, with nulls last and a reset', () => {
    const { container } = render(<AltersvorsorgedepotAnbieterPage />)
    const table = container.querySelector('.anbieter-table') as HTMLElement
    fireEvent.click(within(table).getByRole('button', { name: /Laufende Kosten/ }))
    const first = container.querySelector('.anbieter-table tbody tr') as HTMLElement
    expect(first.id).toBe('trade-republic')
    expect(screen.getByText(/Sortiert nach Laufende Kosten, aufsteigend\. Einträge ohne Angabe stehen am Ende\./)).toBeTruthy()

    fireEvent.click(screen.getByLabelText(/^Versicherer \(38\)/))
    expect(container.querySelectorAll('.anbieter-table tbody tr')).toHaveLength(38)
    expect(screen.getByText(/38 von 84 Anbietern/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Alle anzeigen' }))
    expect(container.querySelectorAll('.anbieter-table tbody tr')).toHaveLength(84)
  })

  it('server-renders the default order without sort or filter controls', () => {
    const html = renderToString(<AltersvorsorgedepotAnbieterPage />)
    expect(html).not.toContain('Sortieren nach')
    expect(html).not.toContain('type="checkbox"')
    expect(html.indexOf('id="apobank"')).toBeLessThan(html.indexOf('id="zurich"'))
  })

  it('renders the visible FAQ from faq-anbieter.json', () => {
    const { container } = render(<AltersvorsorgedepotAnbieterPage />)
    const questions = Array.from(container.querySelectorAll('.faq-item h3'), (h) => h.textContent)
    expect(questions).toEqual(anbieterFaq.map((f) => f.q))
  })

  it('has no ranking words in the table section', () => {
    const { container } = render(<AltersvorsorgedepotAnbieterPage />)
    const text = container.querySelector('.anbieter-tabelle')?.textContent ?? ''
    expect(text).not.toMatch(/Testsieger|Empfehlung|für dich geeignet|passt zu dir|\bTop\b|bester/i)
  })

  it('links to the Frühstart anchor on the law page', () => {
    const { container } = render(<AltersvorsorgedepotAnbieterPage />)
    const hrefs = Array.from(container.querySelectorAll('a'), (a) => a.getAttribute('href'))
    expect(hrefs).toContain('/altersvorsorgedepot-gesetz/#fruehstart-rente')
    expect(hrefs).toContain('/altersvorsorgedepot-rechner/')
  })
})

describe('/altersvorsorgedepot-gesetz', () => {
  it('exposes #fruehstart-rente and links to the provider page and calculator', () => {
    const { container } = render(<AltersvorsorgedepotGesetzPage />)
    expect(container.querySelector('#fruehstart-rente')).not.toBeNull()
    const hrefs = Array.from(container.querySelectorAll('a'), (a) => a.getAttribute('href'))
    expect(hrefs).toContain('/altersvorsorgedepot-anbieter/')
    expect(hrefs).toContain('/altersvorsorgedepot-rechner/')
  })

  it('renders the visible FAQ from faq-gesetz.json', () => {
    const { container } = render(<AltersvorsorgedepotGesetzPage />)
    const questions = Array.from(container.querySelectorAll('.faq-item h3'), (h) => h.textContent)
    expect(questions).toEqual(gesetzFaq.map((f) => f.q))
  })

  it('keeps the 120 € Mindesteigenbeitrag; only the old income-based calculation entfällt', () => {
    const { container } = render(<AltersvorsorgedepotGesetzPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/mindestens 120 Euro im Jahr selbst einzahlst/)
    expect(text).toMatch(/Mindesteigenbeitrag 120 Euro: § 86 EStG/)
    expect(text).toMatch(/frühere Berechnung über einen Prozentsatz des Einkommens entfällt/)
    expect(text).not.toMatch(/Mindesteigenbeitrag[^.]{0,120}entfällt/i)
  })
})
