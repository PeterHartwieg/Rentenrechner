export function formatCurrency(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits,
  }).format(value)
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    maximumFractionDigits,
  }).format(value)
}

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits,
  }).format(value)
}

/**
 * German-localised relative-time formatter for the workspace
 * "zuletzt geändert vor X" receipt strip on `/eingaben/produkte`.
 *
 * Returns "soeben" for under-10-seconds gaps, then "vor {n} Sek.",
 * "vor {n} Min.", "vor {n} Std.", "vor {n} Tag(en)", "vor {n} Woche(n)".
 *
 * Inputs less than zero (clock skew) are clamped to "soeben" — the strip
 * surfaces a stamp from localStorage which the user can theoretically
 * push into the future by editing system time, but we don't want to leak
 * "vor -5 Sek." into the UI.
 *
 * Pure: caller passes `Date.now() - lastEditedAt`. The helper does not
 * read the clock itself so tests stay deterministic.
 */
export function formatRelativeTime(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 10_000) {
    return 'soeben'
  }
  const seconds = Math.floor(elapsedMs / 1000)
  if (seconds < 60) {
    return `vor ${seconds} Sek.`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `vor ${minutes} Min.`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `vor ${hours} Std.`
  }
  const days = Math.floor(hours / 24)
  if (days < 7) {
    return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`
  }
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'vor 1 Woche' : `vor ${weeks} Wochen`
}
