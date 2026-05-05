# Lock QA mode policy and target ID convention

Status: done
Type: HITL
Resolved by: `.scratch/qa-feedback-mode/DECISIONS.md` (2026-05-05)

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Decide the human policy choices that the first QA feedback implementation needs before code lands: how QA mode is activated, where it is available, how feedback target ids are named, which local export destination ships first, and how screenshot privacy works in the first wave.

## Acceptance criteria

- [ ] QA mode availability is decided: production secret query parameter, staging/development only, or another explicit access rule.
- [ ] Activation behavior is decided, including whether `?qa=1` is supported.
- [ ] Stable feedback target id convention is documented with examples for inputs, product sections, workspace views, charts, tables, legal text, and guided setup.
- [ ] First-wave local export destination is chosen: clipboard Markdown, local file download, or both.
- [ ] Screenshot behavior is decided for first implementation, including full viewport vs selected region and the minimum redaction rule.
- [ ] The decision is recorded in this issue's comments or a sibling decision note before AFK implementation starts.

## Blocked by

None - can start immediately.
