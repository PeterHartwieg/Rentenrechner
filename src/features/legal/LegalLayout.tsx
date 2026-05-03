import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { Route } from '../../app/useRoute'
import './legal.css'

interface Props {
  title: string
  navigate: (target: Route) => void
  children: ReactNode
}

export function LegalLayout({ title, navigate, children }: Props) {
  function goHome(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    navigate('/')
  }

  return (
    <main className="legal-page">
      <header className="legal-header">
        <a href="/" onClick={goHome} className="legal-back-link">
          <ChevronLeft size={16} aria-hidden="true" />
          Zurück zum Rechner
        </a>
      </header>
      <article className="legal-article">
        <h1>{title}</h1>
        {children}
      </article>
      <footer className="legal-page-footer">
        <a href="/" onClick={goHome}>
          Rentenrechner
        </a>
        <span>·</span>
        <a
          href="/impressum"
          onClick={(event) => {
            event.preventDefault()
            navigate('/impressum')
          }}
        >
          Impressum
        </a>
        <span>·</span>
        <a
          href="/datenschutz"
          onClick={(event) => {
            event.preventDefault()
            navigate('/datenschutz')
          }}
        >
          Datenschutzerklärung
        </a>
      </footer>
    </main>
  )
}
