import { AlertTriangle } from 'lucide-react'

interface InvalidLinkBannerProps {
  onDismiss: () => void
}

/**
 * Shown when `?s=…` share URL is present but cannot be decoded / validated.
 * The user can dismiss it and interact with the default scenario instead.
 * Dismissible (close button) so it does not block interaction.
 */
export function InvalidLinkBanner({ onDismiss }: InvalidLinkBannerProps) {
  return (
    <div className="invalid-link-banner" role="alert" aria-live="polite">
      <AlertTriangle size={16} aria-hidden="true" className="invalid-link-banner__icon" />
      <span className="invalid-link-banner__text">
        Dieser Link ist ungültig oder abgelaufen. Es werden stattdessen die gespeicherten
        oder Standard-Eingaben angezeigt.
      </span>
      <button
        type="button"
        className="invalid-link-banner__dismiss"
        aria-label="Hinweis schließen"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  )
}
