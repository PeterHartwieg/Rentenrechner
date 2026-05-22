import type { ReactNode } from 'react'
import './chrome.css'
import { DisclaimerBanner } from '../../features/workspace/DisclaimerBanner'
import { StatusBar } from './StatusBar'
import { AppHeader } from './AppHeader'
import { MobileNav } from './MobileNav'
import { useViewport } from './useViewport'
import type { Route } from '../../app/useRoute'

interface AppShellProps {
  route: Route
  navigate: (target: Route, search?: string) => void
  kicker?: string
  title?: string
  editorial?: boolean
  children: ReactNode
}

/**
 * Top-level page chrome wrapper. Composes:
 *   - DisclaimerBanner (P0: stays on sessionStorage; first child of #print-report
 *     in PrintReport.tsx, but ALSO first child of the live shell so the
 *     disclaimer sits ABOVE the status bar per the design spec).
 *   - StatusBar (dark mono ribbon).
 *   - AppHeader (kicker + H1 + nav; or brand + hamburger on phone).
 *   - body slot (children — the route page content). Pages render their own
 *     `LegalFooter` inline, which carries both the methodology footnotes
 *     and the Impressum / Datenschutz / Lizenz strip (legal pages use the
 *     thinner `LegalLayout` footer instead). The previously-separate
 *     `MethodFooter` was folded into `LegalFooter` so there is only one
 *     footer per page.
 *   - MobileNav (phone only — bottom tab bar with safe-area inset).
 */
export function AppShell({ route, navigate, kicker, title, editorial, children }: AppShellProps) {
  const viewport = useViewport()
  const isPhone = viewport === 'phone'

  return (
    <div
      className={`rw-app-shell${editorial ? ' rw-app-shell--editorial' : ''}${isPhone ? ' rw-app-shell--phone' : ''}`}
    >
      <DisclaimerBanner />
      <StatusBar />
      <AppHeader
        route={route}
        kicker={kicker}
        title={title}
        editorial={editorial}
        navigate={navigate}
      />
      <main className="rw-app-shell__body">{children}</main>
      {isPhone && <MobileNav route={route} navigate={navigate} />}
    </div>
  )
}
