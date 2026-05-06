Status: ready-for-human
Type: copy
Priority: minor
Source: local-qa
Source ref: qa-2026-05-06T12-17-32-legal-footer-container.md
Triaged: 2026-05-06T00:00:00Z

# 01 — "Redundant" disclaimer in Rechtlicher Footer (HITL — compliance surface)

## Parent

.scratch/qa-followups/

## Problem

A tester flagged the disclaimer line in the footer ("Modellrechnung — keine
Anlage-, Steuer- oder Rechtsberatung.") as redundant and asked to remove it.
The tester apparently sees the same German wording elsewhere on the page
(likely the session-only `DisclaimerBanner` at the top). Removing or shortening
the footer copy directly affects the publication-blocking compliance surface
called out in `CLAUDE.md` (Critical guardrail #1: the disclaimer must remain
visible on every export and surface) — this is not a triage decision the agent
should make autonomously.

## What to change

Do **not** edit copy yet. A human owner must decide:

1. Whether the footer disclaimer is genuinely redundant given the
   `DisclaimerBanner` (which the user can collapse per session) — i.e. is the
   footer text a second guard against a collapsed banner, or true duplication?
2. If a change is approved, where the canonical disclaimer text lives and
   whether legal review is required (German wording is content-sensitive).
3. Whether export surfaces (`PrintReport.tsx`, `buildExportCsv`) are affected.

If the human decides to keep the footer copy: close as `wontfix` with a comment
explaining the dual-disclaimer rationale.

If the human decides to change it: the touchpoint is
`src/features/legal/LegalFooter.tsx` line 58 (the `<span class="app-footer-copy">`
that holds the literal "Modellrechnung — keine Anlage-, Steuer- oder
Rechtsberatung."). Co-located test: `src/features/legal/LegalFooter.test.tsx`
asserts on this string and would need updating in lockstep.

## Acceptance criteria

- [ ] Human reviewer confirms whether the footer disclaimer is required or
  duplicative given the session-collapsible top banner.
- [ ] If kept: a short note added (in this file or as a comment in the source)
  explaining why the duplication is intentional (compliance redundancy).
- [ ] If changed: footer test updated, `PrintReport` and `buildExportCsv`
  audited to confirm exports still embed the disclaimer at the top.

## Implementation context

- HITL hard rule: change touches `src/features/legal/**` and the
  publication-blocking disclaimer surface listed under "Critical guardrails" in
  `CLAUDE.md`. RUNBOOK forces `ready-for-human`.
- Relevant files:
  - `src/features/legal/LegalFooter.tsx` (the literal copy at line 58)
  - `src/features/legal/LegalFooter.test.tsx` (snapshot of footer text)
  - `src/features/results/PrintReport.tsx` (disclaimer must remain first child
    of `#print-report`)
  - `src/utils/csvExport.ts` → `buildExportCsv` (disclaimer is the first CSV
    section)
  - `src/features/disclaimer/DisclaimerBanner.tsx` (session-only banner the
    tester may have collapsed)
- Tests: `npx vitest run LegalFooter`, then `npm run verify` for full sweep.
- Related backlog: `.scratch/qa-feedback-mode/issues/18-temporary-footer-button-to-activate-qa.md`
  (separate footer cleanup task — do not bundle).

## Blocked by

Nothing.

## Open questions

Not applicable (HITL — see "What to change" for the human-owned decisions).

## Original report

.scratch/archive/qa-feedback-issues/qa-2026-05-06T12-17-32-legal-footer-container.md
.scratch/archive/qa-feedback-issues/qa-2026-05-06T12-17-32-legal-footer-container-screenshot.png
