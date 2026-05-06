# ADR-0001 — Backend boundary amendment: QA submission Worker

- **Status:** Accepted
- **Date:** 2026-05-06
- **Decided by:** Peter (project owner)

## Context

The project guardrail in `CLAUDE.md` ("Backend boundary") reserved backend introduction for OCR / document upload only. All other state was to live in localStorage and share-URLs. Frontend was forbidden from adding fetch / auth / cookies.

A new requirement surfaced while building out the QA-followups workflow:

- Friends-and-family testers (parents specifically) need to submit QA findings — including screenshots — without creating GitHub accounts.
- The triage workflow (`.scratch/qa-followups/`) is moving to a cloud-hosted Routine on `claude.ai/code/routines` so it survives PC sleep / offline state. That Routine can only see GitHub issues, so submissions must converge on GitHub regardless of submission channel.
- Two attempted no-backend paths fail:
  1. **GitHub prefilled-URL submission** works for testers with GH accounts, fails for parents who refuse to create one.
  2. **Stateless Worker proxying to the GH issue-creation API** can carry title / body / labels but cannot carry the screenshot. GitHub's user-attachment URLs (`github.com/.../assets/...`) require an authenticated UI session to mint; there is no public REST API to upload binaries during issue creation. A Worker that wants the screenshot inside the issue must host the image itself and reference it via `![](url)` in the issue body.

## Decision

Amend the `Backend boundary` policy in `CLAUDE.md` to add **QA submission for testers without GitHub accounts** as a second sanctioned backend trigger, alongside OCR.

The Worker is permitted object storage (Cloudflare R2 or equivalent) for screenshots, because that is the smallest implementation that meets the requirement. All other constraints from the original policy carry over unchanged:

- GDPR-compliant by design (region, retention, consent).
- Calculator continues to work fully offline for users who don't use this feature.
- Stack chosen at implementation time.
- Storage scoped to the lifetime of the linked GitHub issue; purge on closure.

## Consequences

**Positive:**
- F&F testers can submit QA findings — including screenshots — with one tap, no GitHub account required.
- Cloud-hosted triage Routine has a single inbox (GitHub issues) regardless of submission channel.
- The QA Worker's requirements (HTTP endpoint + object storage + ephemeral processing) are a strict superset of the OCR Worker's. Building QA first does not narrow the OCR design space; the two can share infrastructure.

**Negative:**
- First permanent backend in the project, ahead of OCR. Adds ops surface (deployment, secrets, monitoring), GDPR responsibilities (privacy notice, retention enforcement, possibly a register of processing activities under Art. 30 DSGVO), and a cost line (Worker + storage egress).
- Image hosting widens the GDPR perimeter — screenshots may incidentally include unredacted financial data despite composer redaction efforts. Submission consent UI must be explicit and exhaustive.
- Storage purging requires either a GitHub issue-closed webhook handler or a periodic sweeper. That is non-trivial state management even if the Worker itself stays stateless on the request path.

**Neutral / open:**
- Standard abuse mitigations (Cloudflare Turnstile, per-IP rate limit, Origin allowlist) are required but do not load-bear on this decision; treat as hygiene at implementation time.
- Whether the OCR backend reuses this Worker's account / R2 bucket / domain is a design question for OCR's own ADR, not this one.
- The two ready-for-agent items in the QA workflow (`.scratch/qa-followups/issues/02`, `.../04`) and the local-only triage cron remain in place; they migrate to a cloud Routine + GitHub-only inbox as a separate, follow-on workstream gated on this amendment.
