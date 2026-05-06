# PRD - QA feedback mode

Status: open
Created: 2026-05-05
Updated: 2026-05-05

## Problem Statement

QA feedback on the calculator UI is currently hard to make precise. A tester who notices a wrong word, confusing label, layout issue, broken tooltip, or bad menu-flow copy has to describe the location manually. That produces reports like "the text in the bAV menu is confusing", which are slow for maintainers to reproduce and easy for developers to misinterpret.

The project needs a QA-only feedback mode that lets testers mark the exact UI element they mean, add a short comment, and produce an actionable ticket with enough context to fix the issue quickly. The first version must respect the current product posture: frontend-only, no telemetry, no cookies, no accounts, and no phone-home behavior.

## Solution

Add a debug/QA feedback mode that can be activated explicitly during QA sessions. When active, the app overlays selectable feedback targets on the current UI. A tester clicks the exact label, input, button, chart label, tooltip, modal field, or navigation item that needs attention. The app pins that target, opens a compact feedback composer, and lets the tester describe the issue.

The submitted report is not silently sent anywhere in the first version. Instead, the app generates a reviewed ticket payload that the tester can copy, download, email, or use to open a pre-filled issue. The payload includes a stable feedback target id, current visible text, route, viewport, browser, app/build metadata, relevant UI flow context, optional share-link/scenario context, and optional screenshot/annotation data. Sensitive financial inputs and user-entered data are excluded by default unless the tester explicitly includes them.

This gives maintainers precise, reproducible feedback while preserving the existing no-backend privacy boundary. A later backend submission path can be added only after a GDPR/retention/consent design exists.

## User Stories

1. As a QA tester, I want to enable QA mode explicitly, so that normal users never see feedback controls by accident.
2. As a QA tester, I want QA mode to be reachable from a query parameter, so that maintainers can send me a link that starts in feedback mode.
3. As a QA tester, I want a visible indicator when QA mode is active, so that I do not confuse it with the normal calculator experience.
4. As a QA tester, I want to hover over selectable UI elements and see an outline, so that I know which element my report will attach to.
5. As a QA tester, I want to click a label, input, button, menu item, tooltip, chart label, or table cell, so that my comment points to the exact UI surface that needs attention.
6. As a QA tester, I want to select text inside nested components, so that feedback on reusable fields still resolves to a meaningful target.
7. As a QA tester, I want non-instrumented areas to fall back to a nearby section-level target, so that I can still report issues before every element has full coverage.
8. As a QA tester, I want to add a short comment, so that I can explain what is wrong.
9. As a QA tester, I want to classify the feedback as copy, layout, confusing flow, broken interaction, wrong value, accessibility, or other, so that maintainers can triage quickly.
10. As a QA tester, I want to set severity, so that blocking QA findings do not get lost among copy nits.
11. As a QA tester, I want to provide suggested replacement text, so that copy fixes can be applied without a back-and-forth.
12. As a QA tester, I want to attach the current visible text automatically, so that developers can search for the exact string if needed.
13. As a QA tester, I want the ticket to include a stable feedback target id, so that developers can find the relevant component even if copy changes later.
14. As a QA tester, I want the ticket to include the current route and workspace view, so that developers can reproduce the screen quickly.
15. As a QA tester, I want the ticket to include the active product/scenario context when relevant, so that reports about bAV, ETF, Riester, AVD, Basisrente, or private insurance are not ambiguous.
16. As a QA tester, I want the ticket to include browser and viewport details, so that layout issues can be reproduced on the same device class.
17. As a QA tester, I want to include an optional screenshot, so that visual spacing and alignment feedback is obvious.
18. As a QA tester, I want sensitive values to be hidden from the report by default, so that salary, contribution, and retirement assumptions are not leaked casually.
19. As a QA tester, I want to explicitly decide whether to include the current share-link/scenario state, so that repro value and privacy are balanced intentionally.
20. As a QA tester, I want a final preview before exporting the ticket, so that I can redact or edit sensitive details.
21. As a QA tester, I want to copy the ticket as Markdown, so that I can paste it into the local issue tracker, GitHub, Slack, or email.
22. As a QA tester, I want to download the report as a file, so that I can send a feedback bundle even when clipboard access is blocked.
23. As a QA tester, I want a pre-filled issue link where supported, so that filing a ticket takes one click after review.
24. As a QA tester, I want QA mode to work on mobile viewport sizes, so that responsive UI feedback can be reported precisely.
25. As a QA tester, I want QA mode to work inside modals, disclosure sections, guided setup, and tabbed workspace views, so that flow-specific copy can be reviewed in place.
26. As a QA tester, I want keyboard-accessible controls, so that QA mode itself can be tested without a mouse.
27. As a QA tester, I want to cancel a draft report without side effects, so that accidental clicks do not create noise.
28. As a maintainer, I want incoming reports to follow one consistent ticket template, so that triage is fast and comparable across testers.
29. As a maintainer, I want every report to include privacy flags, so that I can see whether scenario data or screenshots were intentionally included.
30. As a maintainer, I want feedback target ids to be stable and human-readable, so that reports remain useful after nearby markup changes.
31. As a maintainer, I want the first QA-mode rollout to cover high-value reusable components first, so that most reports are precise without instrumenting every leaf node manually.
32. As a developer, I want the ticket payload builder to be testable without React, so that report formatting and redaction rules are reliable.
33. As a developer, I want QA mode to be inert when disabled, so that it does not affect normal rendering, calculations, exports, localStorage, share URLs, or print reports.
34. As a developer, I want feedback instrumentation to be lightweight, so that adding a new target does not require changing global QA-mode code.
35. As a developer, I want the report to include app/build metadata, so that I can tell whether the tester saw the current version or an older deployment.
36. As a privacy-conscious project owner, I want no backend submission in the first version, so that the feature does not weaken the current no-phone-home commitment.
37. As a privacy-conscious project owner, I want any future backend submission to require an explicit consent and retention design, so that QA convenience does not create hidden data collection.
38. As a product reviewer, I want copy suggestions to preserve the "not advice" posture, so that QA fixes do not accidentally turn illustrations into recommendations.
39. As a product reviewer, I want reports about disclaimer, export, legal-footer, and license text to be easy to file, so that publication guardrails remain easy to police.
40. As an external commercial QA partner, I want a self-contained ticket export, so that I can send feedback without needing repository access.

## Implementation Decisions

- Build the first version as a local-only QA feedback mode. It generates tickets but does not submit them to a server.
- Activation is explicit. Acceptable triggers include a query parameter, development/debug toggle, or future staging-only affordance. QA mode must not be visible during ordinary use unless deliberately enabled.
- Introduce stable feedback target metadata. A target should have a durable id, optional human-readable label, optional category, and optional privacy sensitivity.
- Prefer instrumenting reusable UI primitives and high-traffic sections first. This gives broad coverage with limited churn and keeps target ids consistent across repeated field patterns.
- Use nearest-target resolution. If a tester clicks a child node, the report attaches to the nearest feedback target. If no exact target exists, the overlay may fall back to a section-level target and mark precision as "section".
- Keep the ticket builder as a deep module with a simple input/output contract. It accepts a structured feedback report and returns Markdown, JSON, and destination-specific payloads.
- Split report collection from report export. The overlay gathers target/comment/context; export adapters handle clipboard, download, email, or pre-filled issue links.
- Redact by default. User-entered financial/profile values, localStorage contents, and scenario/share-link state are excluded unless the tester explicitly opts in.
- Scenario/share-link context is optional and reviewed. When included, the report records that the tester intentionally attached repro state.
- Screenshot capture is optional and client-side only in the first version. If screenshot support is added, it should support redaction masks for sensitive fields and must not upload automatically.
- Capture non-sensitive environment context automatically: route, workspace view, active modal/disclosure if known, viewport, user agent family, app version/build identifier, timestamp, and feedback target id.
- Keep drafts transient. Draft reports may live in memory during the session; persistent draft storage is not required for the first version.
- QA mode must not affect calculation results, persistence migrations, export contents, disclaimer visibility, legal pages, or normal share-link behavior.
- Any future "send to us" backend adapter is a separate capability. It must define consent, EU/GDPR processing region, retention policy, authentication or abuse protection, attachment limits, and failure handling before implementation.
- The UI copy for QA mode should be German if the tester-facing app remains German, but generated tickets may use English field names where useful for developers.
- Reports should be ready for the local markdown issue tracker, with a clear title, status suggestion, reproduction context, privacy flags, and tester comment.

## Testing Decisions

- Test external behavior, not implementation details. Good tests assert that a tester can activate QA mode, select a target, compose feedback, review privacy choices, and export a useful report.
- Unit-test the ticket payload builder. Cover Markdown generation, JSON generation, title generation, target metadata, severity/type handling, and missing optional fields.
- Unit-test redaction rules. Verify that sensitive values, share-link state, screenshots, and local state are omitted by default and included only after explicit opt-in.
- Unit-test target resolution. Verify exact target, nested target, section fallback, and unknown target behavior.
- Component-test the overlay and composer. Cover hover outline, click-to-pin, cancel, submit, preview, keyboard navigation, and disabled-state behavior.
- Integration-test representative report flows across the main workspace views: inputs, comparison, details/export, guided setup, legal/disclaimer surfaces, and chart/table surfaces.
- Regression-test that QA mode is inert when disabled. Normal calculator rendering, calculations, localStorage behavior, share-link behavior, CSV/PDF report contents, and disclaimer session behavior should remain unchanged.
- Regression-test that local-only export performs no network request. This protects the no-backend and no-telemetry guardrail.
- Accessibility-test the QA controls themselves. The overlay must not trap focus incorrectly, composer controls need labels, and keyboard users must be able to create and cancel reports.
- Visual-test a small set of desktop and mobile viewports. The feedback overlay must not hide the selected element or make the comment composer unusable.
- Add smoke coverage for non-instrumented fallback targets so QA can report issues before full instrumentation coverage exists.
- Use existing UI and app-layer test patterns where possible; avoid adding broad end-to-end coverage for every feedback target individually.

## Out of Scope

- Silent submission to a backend.
- Analytics, telemetry, cookies, accounts, or tester identity tracking.
- A public customer-support feedback button for normal users.
- A full feedback management dashboard.
- Automatic duplicate detection across tickets.
- GitHub authentication or direct issue creation through an authenticated API.
- Persistent report drafts across browser sessions.
- Screen recording or automatic capture of full user interaction history.
- Bulk commercial QA workflows, white-label feedback, or broker-specific reporting.
- Automatic translation, copy linting, or language-style enforcement.
- OCR/document-upload feedback flows.
- Backend storage of screenshots, share links, localStorage snapshots, or user-entered financial data.
- Replacing the existing issue tracker workflow; the feature only produces better ticket inputs.

## Dog-fooding feedback (2026-05-05) — all resolved

After hands-on QA testing of the Phase 1 implementation, the following issues were identified and resolved:

1. **Severity labels in German.** `Schweregrad` options (Blocker, Major, Minor, Nit) use English labels in a German UI. Should be German throughout — the PRD already says UI copy should be German (implementation decision, line 79).
2. **Computed headline instead of "Kommentar".** The composer header says "Kommentar" but the generated title echoes the comment verbatim. A better headline would be auto-computed from Schweregrad + Art + selected container (e.g. "Minor Layout — Eingaben / bAV"), with the comment as body text only.
3. **Selection granularity too coarse.** Current `data-qa-target` instrumentation covers large sections, so a selection highlights the entire screen area. Need finer targets: individual text fields, graph legend items, table cells, button labels.
4. **Local issue file creation.** For local QA, add an export option that writes a markdown issue file directly to a local folder in this repo (e.g. `.scratch/qa-feedback-mode/reports/`), avoiding the clipboard/download/email indirection.
5. **Keyboard shortcut for QA mode toggle.** Currently requires editing the URL (`?qa=1`). A keyboard shortcut (e.g. Ctrl+Shift+Q) would make activation/deactivation fast without URL manipulation.

Issues: `11-*` through `15-*` in `.scratch/qa-feedback-mode/issues/`.

## Further Notes

Recommended delivery sequence:

1. Phase 1: local-only QA mode, stable feedback targets on reusable primitives and major workspace sections, comment composer, Markdown/JSON export, and redaction preview.
2. Phase 2: wider target coverage, screenshot annotation, stronger flow breadcrumbs, mobile polish, and pre-filled issue/mail destinations.
3. Phase 3: optional backend "send to us" adapter, only after GDPR, retention, consent, and abuse-handling decisions are written down.

Suggested first-slice success criteria:

- A tester can report a wrong word in a nested product input without describing the navigation manually.
- A tester can report a confusing label in a modal or guided setup step and the ticket includes the exact target id and flow context.
- A maintainer can reproduce a report from the generated ticket without asking "where is this?"
- Sensitive scenario/profile values are absent from the generated ticket unless the tester opted in during preview.
- With QA mode disabled, the app behaves identically to the current normal experience.

Open triage questions:

- Should QA mode be available on production through a secret query parameter, or only on staging/development deployments?
- Which ticket destination should ship first: copy-to-clipboard, file download, mailto, or pre-filled GitHub issue URL?
- Should screenshots be part of Phase 1 or deferred until target-id based reports are proven useful?
- What naming convention should feedback target ids use so they stay stable through the planned portfolio redesign?
- Who is the first intended tester audience: internal maintainers, friendly external QA testers, or paid commercial QA partners?
