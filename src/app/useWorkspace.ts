/**
 * Legacy workspace-view storage key.
 *
 * The workspace-tabs collapse (this PR) removed the per-workspace tab strip
 * (`Eingaben/Vergleich/Details & Export`) and the `useWorkspace` hook that
 * backed it. The localStorage key under which the previously-active tab was
 * persisted is kept as a named export so the GDPR storage-keys disclosure on
 * `/datenschutz` continues to enumerate it for transparency on returning
 * users whose browsers still carry a stale value (cleared via the page's
 * "Daten löschen" action). The key is no longer written by any code path.
 */
export const WORKSPACE_KEY = 'rentenrechner-workspace-v1'
