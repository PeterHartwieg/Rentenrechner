# API envelope, manifest, and rule resolution

Status: needs-triage
Type: feature

## Parent

.scratch/pure-frontend-api/PRD.md

## What to build

Create the first vertical slice of the pure front-end API: a versioned API result envelope, rule-year resolver, and manifest function. This gives consumers one stable discovery entrypoint before any tax or comparison operation is exposed.

The manifest should expose API version, active rule year, supported rule years, product manifest, default profile, default assumptions, comparison capability flags, response detail levels, Monte Carlo limits, and the not-advice/disclaimer posture. The rule resolver should accept an omitted rule year as "active rules" and reject unsupported explicit years through the API envelope rather than throwing or silently falling back.

This slice also installs the purity guardrail for `src/api/**`: API modules and API tests must not import React, browser storage, DOM globals, fetch, history, or clipboard. The guardrail should be enforced by tooling, not just convention.

## Acceptance criteria

- [ ] A pure API module exports a manifest function that returns serializable metadata without importing React, DOM APIs, browser storage, fetch, history, or clipboard.
- [ ] API responses use a shared success/error envelope with API version, rule year metadata, warnings, and structured errors.
- [ ] Manifest `activeRuleYear` is read from the active rules object (`activeRules.year`), not a literal year.
- [ ] Omitted rule year resolves to the active rules.
- [ ] Explicit supported rule year resolves to the same active rules for 2026.
- [ ] Explicit unsupported rule year returns a structured API error.
- [ ] Product metadata is sourced from the existing product registry/manifest, not duplicated.
- [ ] Defaults are sourced from canonical default profile and assumptions, not copied by hand.
- [ ] Tooling prevents `src/api/**` from importing React or React DOM.
- [ ] Tooling prevents `src/api/**` from using or importing browser-only side effects: `localStorage`, `sessionStorage`, `window`, `document`, `fetch`, `history`, `navigator.clipboard`.
- [ ] API tests run under a Node test environment so accidental browser dependency fails fast.
- [ ] Tests cover manifest shape, JSON serialization safety, rule-year success/failure paths, and no-browser dependency.

## Blocked by

None - can start immediately.
