# Stretch: pure compatibility helpers for state and share payloads

Status: needs-triage
Type: stretch

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Expose optional pure compatibility helpers for parsing and building saved-state/share payloads through the front-end API contract. These helpers should wrap the existing migration and validation behavior without touching localStorage, sessionStorage, history, clipboard, URL state, or browser APIs.

This is a stretch/post-core issue because v1 has no direct consumer for these helpers. The main comparison API accepts profile/assumptions, not raw saved-state payloads. Legacy load fallback, including `compareSubMode === 'equal_cash' && equalInputAmountEUR === undefined`, belongs here or in storage compatibility, not in the comparison simulation facade.

## Acceptance criteria

- [ ] API exposes pure parse/build helpers for singleton compare-mode payloads if included in v1.
- [ ] API exposes pure parse/build helpers for workspace payloads only as compatibility support, not as a full combine-mode API.
- [ ] Helpers own legacy saved-state fallback parity, including the old equal-cash anchor fallback when applicable.
- [ ] Helpers return structured success/error envelopes rather than raw nulls.
- [ ] Helpers reuse existing storage migration/validation logic.
- [ ] Helpers do not access localStorage, sessionStorage, history, clipboard, fetch, DOM, or React.
- [ ] v1 and v2 payload behavior matches existing parse/build tests.
- [ ] Tests cover corrupt JSON, unsupported future schema, valid v1 migration, valid v2 workspace projection to singleton, and JSON serialization.

## Blocked by

- .scratch/pure-frontend-api/issues/01-api-envelope-manifest-and-rule-resolution.md
- .scratch/pure-frontend-api/issues/02-structured-validation-diagnostics.md
- Core API slices are higher priority; this can be deferred without blocking v1.
