# QA feedback mode — developer notes

Local-only feedback overlay that lets a tester pin a screen region, add a
comment, and export a Markdown ticket / JSON bundle / mailto / GitHub-issue
URL. Activated by appending `?qa=1` to any URL; the flag is session-scoped
(`sessionStorage`), so it never persists into the next browser session.

This module is the only UI surface that ever touches the QA-mode flag. It
is intentionally walled off from the calculator engine, storage layer, CSV
exporter, and PDF/print report. A reviewer who lands on this code should
not need to read those modules to understand or extend the feature.

## No-backend, no-telemetry guarantee

The feature performs **zero network requests**. There is no `fetch`, no
`XMLHttpRequest`, no `navigator.sendBeacon`, no cookie write, no analytics
ping. Every export path is purely local:

- Markdown clipboard via `navigator.clipboard.writeText`.
- JSON bundle download via a constructed `Blob` and `URL.createObjectURL`.
- `mailto:` URL handed to `window.open` (the user's mail client opens; we
  never see a response).
- GitHub `issues/new?...` URL handed to `window.open` (browser navigates to
  GitHub directly).

Drafts live in the provider's React state only; a page reload discards them
(see `DECISIONS.md` §7). The QA-mode flag is the only piece of QA state
that survives a route change, and it lives in `sessionStorage` exclusively.
The flag never reaches `localStorage` — that would create a permanently-
feedback-y browser, which is a footgun and would interact with the
disclaimer banner's compliance contract.

## Regression tests that pin the contract

The guarantees above are pinned by a layered test suite. Every Phase 4
change must keep these green; do not skip or weaken them.

- `__tests__/inert.test.tsx` — provider in QA-off mode renders children
  identically to a bare render; no overlay, no listeners, no
  `data-qa-mode` attribute, no `data-qa-target` leaks.
- `__tests__/inert-app-boundary.test.tsx` — at the calculator's external
  seams (`buildExportCsv`, `PrintReport`, `urlShare` round-trip,
  `migrateAndValidateState`, `loadLibrary`), provider-on-vs-off output is
  byte-identical and contains no QA artifacts.
- `__tests__/no-network-e2e.test.tsx` — full flow (target -> composer ->
  preview -> all four export paths) drives `fetch`, `XMLHttpRequest.open`,
  and `XMLHttpRequest.send` spies; every spy must report zero calls.
- `__tests__/privacy-localStorage.test.ts` — the Markdown payload never
  reads `localStorage`, never embeds the `STORAGE_KEY_V2` literal, and
  never includes a `localStorage` key in the JSON envelope.
- `export/bundleExport.test.ts`, `export/outboundDestinations.test.ts` —
  unit-level fetch/XHR spies for the bundle and outbound URL helpers.

## How to extend safely

1. **Adding a new export destination?** Build a URL or a `Blob` and hand
   it to `window.open` / `triggerBlobDownload`. Do not introduce `fetch`.
   Add a fetch+XHR spy assertion to the helper's unit test (mirror
   `outboundDestinations.test.ts`).
2. **Adding a new feedback target?** Use `useFeedbackTarget` (component
   scope) or `qaTargetAttrs` (loops/maps). Never write raw `data-qa-*`
   attributes in JSX; the helpers gate them behind QA mode.
3. **Adding new persisted state?** Don't. Drafts stay in memory
   (`DECISIONS.md` §7). If a future issue legitimately needs persistence,
   land it as a separate decision-doc update, then a separate change.
4. **Touching the disclaimer banner, calculator engine, storage migration,
   CSV export, or PDF/print report?** Don't — those are orthogonal to the
   QA feature. The inert-app-boundary suite will fail loudly if you do.
5. **Need a backend?** That is a separate backlog item and changes the
   product's compliance posture (see `CLAUDE.md` "Backend boundary"). It
   is not a casual addition.
