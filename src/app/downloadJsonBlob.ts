/**
 * Browser-only helper that triggers a JSON file download.
 *
 * Mirrors `downloadCsv` in `src/utils/csvExport.ts` — same Blob + object-URL
 * + temporary anchor pattern. Stays inside the frontend boundary (no
 * network), so no ADR is required.
 *
 * Usage: pair with `buildStateJson(profile, assumptions)` from
 * `src/storage.ts` to mint a download of the user's compare-mode
 * `{ version, profile, assumptions }` envelope.
 *
 * Filename stays ASCII per the `CLAUDE.md` brand rule (`rentenwiki-export.json`).
 * No-op on the server (jsdom-less callers see early-return).
 */
export function downloadJsonBlob(content: string, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
