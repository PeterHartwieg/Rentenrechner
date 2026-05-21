import type { ReactNode } from 'react'
import type { Route } from '../../app/useRoute'
import { ROUTES } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import './legal.css'

interface Props {
  title: string
  navigate: (target: Route) => void
  children: ReactNode
}

/**
 * Content wrapper for legal pages (Impressum, Datenschutz).
 *
 * Rendered inside AppShell, which supplies the StatusBar, AppHeader nav-tabs,
 * and MethodFooter. LegalLayout adds only:
 *  - a sober mono back-link header (← Zurück zum Rechner)
 *  - the article content area
 *  - a compact mono page-footer with Impressum + Datenschutz cross-links
 *
 * R2.3: Shell parity — Sober D token palette (white + IBM Plex + oxblood H1
 * only). No cream background, no Newsreader serif.
 */
export function LegalLayout({ title, navigate, children }: Props) {
  function goHome(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!shouldUseSpaNavigation(event)) return
    event.preventDefault()
    navigate(ROUTES.home)
  }

  function goImpressum(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!shouldUseSpaNavigation(event)) return
    event.preventDefault()
    navigate(ROUTES.impressum)
  }

  function goDatenschutz(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!shouldUseSpaNavigation(event)) return
    event.preventDefault()
    navigate(ROUTES.datenschutz)
  }

  return (
    <main className="legal-page">
      <header className="legal-header">
        <a href="/" onClick={goHome} className="legal-back-link">
          ← Zurück zum Rechner
        </a>
      </header>
      <article className="legal-article">
        <h1>{title}</h1>
        {children}
      </article>
      <footer className="legal-page-footer">
        <a href="/" onClick={goHome}>
          RentenWiki.de
        </a>
        <span className="legal-page-footer__sep" aria-hidden="true">·</span>
        <a
          href="/impressum/"
          onClick={goImpressum}
        >
          Impressum
        </a>
        <span className="legal-page-footer__sep" aria-hidden="true">·</span>
        <a
          href="/datenschutz/"
          onClick={goDatenschutz}
        >
          Datenschutzerklärung
        </a>
      </footer>
    </main>
  )
}
