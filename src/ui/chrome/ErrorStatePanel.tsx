import type { MouseEvent, ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import './ErrorStatePanel.css'

/**
 * Tone of the panel.
 *
 * - `error`: something is wrong / unexpected (e.g. broken share-link, stale
 *   `/vertrag/:id`). Surfaces a warning icon and uses the oxblood accent
 *   sparingly on the dismiss / hover affordances.
 * - `empty`: a neutral "nothing here yet" / "no comparison set" state. No
 *   icon, no warning colour — the panel is a quiet prompt with an optional
 *   CTA pointing the user at the action that would populate the surface.
 */
export type ErrorStatePanelTone = 'error' | 'empty'

/**
 * Optional call-to-action. The panel supports either an `href` (rendered as
 * a real anchor so external/internal links work, including middle-click +
 * right-click context menu) or an `onClick` handler (rendered as a
 * `<button>` for in-app actions that do not change the URL).
 *
 * **Precedence rule: `href` wins.** When both are provided, the panel
 * renders `<a href={href}>` and attaches `onClick` to it. This is the
 * standard SPA interception pattern — the click handler can call
 * `event.preventDefault()` for plain left-clicks to handle navigation in
 * JS, while modifier-clicks (Cmd/Ctrl/middle) fall through to the browser's
 * native anchor behaviour (new tab, etc.). If only `onClick` is supplied
 * (no `href`), a `<button>` is rendered instead.
 */
interface ErrorStatePanelCta {
  label: string
  /** Optional href; renders an `<a>` tag (wins over `onClick` when both are supplied). */
  href?: string
  /** Optional click handler; attaches to the `<a>` for SPA interception, or renders a `<button>` when no `href` is supplied. */
  onClick?: (event: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void
}

interface ErrorStatePanelProps {
  /** Visual tone. See ErrorStatePanelTone docs. */
  tone: ErrorStatePanelTone
  /**
   * Optional title shown above the body copy. Empty-tone panels typically
   * supply this; error-tone panels for tiny inline banners may omit it.
   */
  title?: string
  /** Body copy. Always rendered. */
  message: ReactNode
  /** Optional CTA rendered as the primary action. */
  cta?: ErrorStatePanelCta
  /**
   * Optional dismiss handler. When supplied, an "X" button appears in the
   * top-right corner; only the share-link recovery banner uses this today.
   * For empty / not-found states, the CTA is the only path out.
   */
  onDismiss?: () => void
  /**
   * Optional aria-label for the dismiss button. Defaults to "Hinweis
   * schließen" which matches the legacy share-link banner copy.
   */
  dismissLabel?: string
  /**
   * Optional extra class on the outer wrapper. Consumers use this to apply
   * page-specific layout overrides (e.g. centred + max-width for the
   * VertragDetail empty state) without forking the primitive's CSS.
   */
  className?: string
}

/**
 * ErrorStatePanel — Sober D / Hybrid recovery + empty-state primitive.
 *
 * Sits in `src/ui/chrome/` alongside `ModalSlot` so the page chrome and
 * the recovery panel share the same token vocabulary (`--rw-bg-paper`,
 * `--rw-rule`, `--rw-ink`, IBM Plex Sans, oxblood accent used sparingly).
 *
 * Three production call-sites:
 *
 * 1. **Share-link recovery** in `Calculator.tsx` — fired when `?s=…` decoded
 *    to something the schema rejects. `tone="error"` with the dismiss
 *    affordance so the user can continue with their saved or default
 *    inputs. (R3.2 / audit H9)
 * 2. **Stale `/vertrag/:id`** in `VertragDetailPage.tsx` — combine-mode
 *    user landed on a contract id that no longer exists in their workspace
 *    (deleted, share-link from a different workspace, etc.).
 *    `tone="error"` + CTA back to Mein Plan. Also covers the compare-mode
 *    "this URL is only valid in Plan-Modus" fallback. (R3.2 / audit C7)
 * 3. **Empty `/` compare view** in `VergleichPage.tsx` — compare-mode
 *    user with no visible products selected. `tone="empty"` + CTA to
 *    `/eingaben`. The GRV baseline still projects; the panel just nudges
 *    the user toward picking a Vorsorgeprodukt. (R3.2 / audit C7)
 *
 * Composition rules:
 * - `role="alert"` + `aria-live="polite"` are applied to error-tone panels
 *   so screen-readers announce the recovery message when it appears.
 * - `role="status"` is used for empty-tone panels because there is no
 *   error condition to announce — the panel is informational chrome that
 *   sits inside the page layout.
 * - The primitive does not own focus management. Consumers that need to
 *   move focus into the panel (rare for empty states; share-link recovery
 *   does not need it) wrap the panel in their own focus management code.
 */
export function ErrorStatePanel({
  tone,
  title,
  message,
  cta,
  onDismiss,
  dismissLabel = 'Hinweis schließen',
  className,
}: ErrorStatePanelProps) {
  // Pick the correct ARIA role + live-region semantics per tone. The error
  // path needs `role="alert"` so AT users hear the recovery message when
  // it appears after a broken share-link decode; the empty path uses
  // `role="status"` because the panel is steady-state chrome.
  const isError = tone === 'error'
  const ariaRole = isError ? 'alert' : 'status'
  const ariaLive = isError ? 'polite' : undefined

  const rootClass = ['rw-error-state', `rw-error-state--${tone}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass} role={ariaRole} aria-live={ariaLive}>
      {/* Warning icon is part of the error tone's visual language; empty
          tone has no icon so it doesn't read as a problem. */}
      {isError && (
        <AlertTriangle
          size={18}
          aria-hidden="true"
          className="rw-error-state__icon"
        />
      )}

      <div className="rw-error-state__content">
        {title && <p className="rw-error-state__title">{title}</p>}
        <div className="rw-error-state__message">{message}</div>

        {cta && (
          <div className="rw-error-state__cta-row">
            {cta.href ? (
              // href wins — render <a> so Cmd/Ctrl/middle-click work correctly.
              // onClick attaches to the anchor for SPA interception (caller can
              // preventDefault() on plain left-clicks while modifier-clicks fall
              // through to the browser's native anchor navigation).
              <a
                href={cta.href}
                className="rw-error-state__cta"
                onClick={cta.onClick}
              >
                {cta.label}
              </a>
            ) : cta.onClick ? (
              <button
                type="button"
                className="rw-error-state__cta"
                onClick={cta.onClick}
              >
                {cta.label}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          className="rw-error-state__dismiss"
          aria-label={dismissLabel}
          onClick={onDismiss}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
