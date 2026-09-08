# ADR-0003: Local calculation review toolchain and source freshness process

- Status: Accepted (2026-09-08)
- Issue: #382
- Companion doc: [`docs/automation/calculation-review-toolchain.md`](../automation/calculation-review-toolchain.md)

## Context

Calculation changes currently rely on the external golden suite
(`docs/validation.md`), the repo review bar (`AGENTS.md` / `CLAUDE.md`
"Review guidelines"), and GitHub-side agentic reviewers. What is missing is a
repeatable, auditable way to (a) route *pre-merge* multi-model review by the
calculation area a PR touches, and (b) keep the statutory research sources
fresh with an explicit record of what was captured when and what was
actually reviewed.

Authenticated model CLIs already exist on the operator machine
(`~/.local/bin/claude`, `~/.grok/bin/grok`, `codex`). No application backend
may be added for this (backend boundary), and no telemetry may be introduced.

## Decision

1. **Local, not SaaS, not CI.** The toolchain lives in `scripts/review/` and
   runs on the operator machine using the existing CLI logins. No new
   network egress beyond `gh` (GitHub API) and the CLIs the operator
   explicitly invokes. No credentials are read, copied, or printed.
2. **Two panels, explicit escalation.** Routine = Grok 4.6 + Opus. Complex =
   Fable 5.1 + GPT-6-Astra + Grok 4.6, reachable only via literal
   `--complex`. No heuristic selects the expensive panel.
3. **Fail-closed verdict gate.** A review counts only with proven completion,
   matching provider-reported model, an exact restated PR head SHA, and a
   well-formed non-contradictory verdict. Anything malformed, truncated, or
   missing fails the run and is recorded honestly in the receipt.
4. **Receipts are local and earned.** Machine-readable receipts are written
   only by the tooling into a gitignored local dir. Approval-shaped files
   found inside a PR diff are untrusted and excluded from reviewer context.
   Reviewer identity is the command + model — never a person; the tooling
   never fabricates a human approval.
5. **Publish is explicit and stale-gated.** `--publish` re-fetches the PR
   head and refuses to label a moved PR. Commit status context is fixed at
   `calculation-review`. No merge path exists in the toolchain.
6. **Source freshness is deterministic and honest.** The catalog reuses
   `validationSources` ids (drift-pinned by tests) plus explicit research-doc
   mappings; `lastCaptured` and `lastReviewed` are distinct and unknown
   review dates stay null. The monthly audit is a documented procedure; the
   operator may wire a local heartbeat (`--fail-on-stale`) once the toolchain
   is proven live. Branch protection is configured by the operator
   separately, after live proof.

## Consequences

- Deterministic `npm run verify` remains independently required; the review
  tool records verify attestations as claims, not evidence.
- The toolchain adds dev-time only surface: no runtime dependency for the
  calculator, no workflow YAML changes, no storage/telemetry changes.
- Review costs are bounded and predictable (2 or 3 model runs per PR).
- The conservative impact map over-reviews by design; narrowing it requires
  changing the documented table, not ad-hoc judgement.

## Alternatives considered

- **GitHub Actions automation** (like the existing agentic pipeline):
  rejected for this purpose — it would require secrets handling for model
  CLIs in CI and blur responsibility with the existing reviewers. The local
  toolchain needs no new secrets and no workflow changes.
- **Server-side review backend**: violates the backend boundary for no gain;
  sanctioned backend triggers (ADR-0001/0002) are unrelated.
- **Single-reviewer approval**: rejected — corroboration across independent
  models is the point, and the adjudication rule makes disagreement visible
  instead of averaging it away.
