# ADR-0004: Local calculation review toolchain and source freshness process

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
2. **Two panels, explicit escalation.** Routine = Grok 4.6 + Claude Opus.
   Complex =
   Fable 5.1 + GPT-6-Astra + Grok 4.6, reachable only via literal
   `--complex`. No heuristic selects the expensive panel, and both
   entrypoints share one flag parser: `--complex`, `--complex true` and
   `--complex=true` all escalate, while a value-bearing form other than the
   documented `true` is rejected rather than silently downgraded to the
   routine panel. The entrypoints also reject unknown flags and stray
   positional arguments before any GitHub or model call, so a misspelling
   cannot read as "the cheaper panel was requested".
3. **Fail-closed verdict gate.** A review counts only with proven completion,
   matching provider-reported model, an exact restated PR head SHA, and a
   well-formed non-contradictory verdict (`approve` with a blocker/major
   finding or an unresolved question is rejected). The prompt is written to
   match that gate exactly: `unresolved` is reserved for consequential
   questions about the reviewed diff, while pre-existing limitations
   unrelated to the diff are `info` findings — otherwise a known limitation
   would block a PR that did not touch it. Identity evidence is
   honest about its provenance and about which model actually did the work:
   for claude the reviewing model is read from the `model` field of the
   native assistant messages themselves — EVERY assistant event must carry
   one, and an event that omits it fails the run instead of being filtered
   out of the check — with the result envelope's
   `modelUsage` keys recorded separately (auxiliary models such as Haiku
   handling side requests are bookkeeping, never identity); for grok the
   envelope's `modelUsage` keys; for codex the CLI's own rollout session
   file. Never a fabricated attestation. Anything malformed, truncated, or
   missing fails the run and is recorded honestly in the receipt.
4. **Reviewers run sandboxed, receipts are local and earned.** Each reviewer
   runs in a detached worktree pinned to the reviewed SHA with its CLI's
   config/customization surfaces disabled (claude `--safe-mode --restricted`;
   codex config/hook/plugin isolation plus an MCP preflight that replaces
   every discovered server with a COMPLETE inert disabled definition of its
   own transport type — `--ignore-user-config` removes the original
   definitions, so a partial `enabled=false` override would leave
   transport-less config that codex refuses to parse — and re-reads the
   native list to prove nothing stays enabled; grok a
   `grok inspect --json` discovery preflight that rejects project-owned
   hooks/plugins/MCP/LSP), and a worktree-mutation check voids any reviewer
   that wrote. Receipts are written only by the tooling into a gitignored
   local dir; approval-shaped files inside a PR diff are untrusted and
   excluded from reviewer context. The review checkout is treated as
   PR-controlled content: a tracked symlink anywhere in it voids the review
   before any context read, and every context file is read through a
   canonical-path containment check, so a diff can never route reviewer
   context to a file outside the checkout. The worktree path itself is
   canonicalized at creation (macOS `tmpdir()` sits behind
   `/var -> /private/var`, and the codex rollout cwd comparison is literal);
   that is a root-path normalization, not a symlink exemption. Each reviewer
   is timed on its own clock (its own `startedAt`/`completedAt` around its
   own invocation, read from real time by default), so a long first reviewer
   cannot push the next one's identity evidence outside the attribution
   window. With `--publish`, the receipt is re-written after a successful
   status write so the file on disk records the publication instead of
   claiming `published: null`; nothing ever publishes FROM a receipt. Reviewer identity is command + model +
   provider-reported identity — never a person; the tooling never fabricates
   a human approval, and publishing re-derives the decision from the
   in-memory records and requires the records to constitute exactly the
   requested panel.
5. **Publish is explicit, stale-gated, and verify-gated.** The review base is
   the **live base-branch head** (`gh api repos/{owner}/{repo}/branches/<name>`),
   not the PR record's `baseRefOid` — that field is the merge snapshot GitHub
   last computed and was observed stale while the branch had already
   advanced. `--publish` re-fetches the PR head and that live base and
   refuses to label a moved PR; an
   approval additionally requires the GitHub-Actions-owned `verify` check
   run to have concluded success on that exact SHA. The run list is captured
   explicitly (`filter=all&check_name=verify`, paged, refused if it cannot be
   proven complete) rather than relying on the API's default `filter=latest`,
   which filters by `completed_at` and can omit the queued re-run that must
   block. Any run still in flight
   blocks, the newest completed run decides, and a state where "which run is
   newest" cannot be established from the fields the REST API documents
   (`status`, `conclusion`, `started_at`) is refused rather than guessed —
   run ids and response order are not treated as a clock. Commit status
   context is fixed at
   `calculation-review`. No merge path exists in the toolchain.
6. **Source freshness is deterministic and honest.** The catalog reuses
   `validationSources` ids (drift-pinned by tests) plus explicit research-doc
   mappings; the impact map imports that same research-doc list, so every
   catalogued statutory source (root `*_RESEARCH.md`, `LEGAL_REVIEW.md`,
   `LEGAL_IMPLEMENTATION_AUDIT_2026.md`) maps broad and a newly catalogued
   source cannot become cosmetic by omission; `lastCaptured` and `lastReviewed` are distinct and unknown
   review dates stay null. A golden source gets a review date only from an
   explicit, validated review record written by a real audit
   (`GOLDEN_SOURCE_REVIEWS`); an unknown id or a malformed date fails the
   report instead of rendering a guess. Dates must be real calendar dates
   (UTC round-trip, so `2026-02-31` cannot roll over into a measurable day),
   and a date in the future relative to the report clock is never "fresh".
   The monthly audit is a documented procedure; the
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
