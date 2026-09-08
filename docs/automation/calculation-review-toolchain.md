# Local calculation review toolchain (issue #382)

Design + operator docs for the **local** review planning/runner tooling in
`scripts/review/`. The tooling runs authenticated model CLIs that are already
installed and logged in on the operator's machine. It is not a GitHub
automation: no workflow, no backend, no telemetry, no credentials handling —
the CLIs keep using their own existing login state in place.

Pair with [`issue-to-merge-pipeline.md`](issue-to-merge-pipeline.md) (GitHub-side
automation) and [`docs/validation.md`](../validation.md) (external golden
suite). The two are complementary: goldens pin captured values; this toolchain
reviews *changes* against statutory sources before merge.

## What it does

1. **Plan** (`npm run review:plan -- --pr <n> [--complex]`) — reads the exact
   PR head SHA + changed files via `gh`, maps the change to review scope,
   names the panel and the context files. Read-only, no model calls.
2. **Run** (`npm run review:run -- --pr <n> [--complex] [--publish]`) —
   captures diff + curated context into a prompt file, checks out the exact
   head SHA into a detached throwaway worktree, runs the panel there, parses
   each native result JSON, gates on the verdict contract, writes a local
   machine-readable receipt.
3. **Publish** (optional, explicit `--publish` on `review:run`) — re-checks
   the PR head **and** base refs via `gh` immediately before writing
   (`STALE_HEAD` / `PR_MOVED` abort), requires the `verify` GitHub Actions
   check run to have succeeded on that exact SHA (approvals only), then sets
   the `calculation-review` commit status. The run is published from memory —
   there is no "publish an old receipt file" path, so a file on disk can never
   manufacture a decision. Never merges.
4. **Sources** (`npm run review:sources [-- --json] [-- --fail-on-stale]`) —
   deterministic source-freshness report over the source-review catalog.

Exit codes for `review:run`: `0` approve · `2` decision reject or needs-human ·
`1` tooling/validation failure (including any reviewer failing closed).

## Design decisions

### Panels (routing policy)

| Panel | Reviewers | When |
|---|---|---|
| `routine` (default) | Grok 4.6 (`~/.grok/bin/grok`) + Opus (`~/.local/bin/claude`, alias `opus`) | every calculation-bearing PR |
| `complex` | Fable 5.1 (`claude-fable-5-1`, exact id) + GPT-6-Astra (`codex exec`) + Grok 4.6 | rare; **only** via explicit `--complex` |

The complex panel is unreachable without the literal flag — no heuristic picks
it. This is pinned by tests (`panels.test.mjs`).

### Executable configuration

Default paths: `~/.local/bin/claude`, `~/.grok/bin/grok`, `codex` (PATH).
Override with `REVIEW_CLAUDE_BIN`, `REVIEW_GROK_BIN`, `REVIEW_CODEX_BIN`. A
missing binary fails with a message naming the env var and the expected
default location. The toolchain never reads, copies, or prints auth files —
each CLI uses its own credential store, untouched.

### Conservative impact mapping (`lib/impactMap.mjs`)

Two tiers only:

- **broad** — the change can move computed numbers. All five calculation
  domains in scope (tax/payroll, KV/PV, funding/eligibility,
  investment/insurance, household interactions), because the shared engine
  feeds every product and both simulation modes. Domain *focus* hints are
  added to the prompt but never reduce scope.
- **narrow** — cosmetic-only paths (CSS, content copy, docs, static assets,
  dev tooling). No calculation domain in scope.

Anything not matched by the narrow table is broad. The conservative fallback
is the point: an unclassified path must never silently shrink the review.
One carve-out: styling files (`.css`/`.scss`/… ) inside an otherwise
meaningful prefix count as cosmetic — meaningful prefixes beat file
extensions, and this is the only place an extension narrows a prefix.
Domain ids are shared with the source-freshness catalog.

Files that look like review receipts or approvals (`*receipt*`, `*approval*`,
`.review/*`) are flagged **untrusted**: they are excluded from reviewer
context and marked in the prompt. A diff must not be able to vouch for itself.

### Prompt contract (`lib/prompt.mjs`)

The prompt (diff + curated context per mapped domain + repo review bar) is
written to the OS temp dir, never the repo. It requires every reviewer to:

- restate the exact 40-char head SHA (any other value voids the review),
- name the **source + applicable date** for every legal claim,
- give an **interpretation**, a **counterexample or test**, and any
  **unresolved uncertainty** per finding,
- end with one structured verdict JSON block
  (`{ pr, headSha, verdict: approve|reject|needs-human, confidence, findings[],
  unresolved[] }`).

It also states the read-only/no-subagent/no-write rules and that a reachable
link is not legal approval.

### Read-only enforcement

Belt and braces — per CLI, both a tool allowlist **and** a config-isolation
flag, because a read-only tool allowlist alone does not stop a PR from
planting hooks or project plugins that run when the CLI starts:

- **claude** runs with `--safe-mode` (every customization surface disabled —
  CLAUDE.md, skills, plugins, hooks, MCP, custom agents; auth, model
  selection, and permissions still work) plus `--restricted` (ignores
  user/project/local settings files, confines file tools to the review
  worktree, refuses bypassPermissions), on top of the explicit
  `--tools Read,Grep,Glob` + `--allowedTools Read,Grep,Glob` allowlist and a
  strict empty MCP config (`--strict-mcp-config --mcp-config '{"mcpServers":{}}'`).
- **grok** has no safe-mode flag in this build (1.0.4), so the runner first
  runs the CLI's own discovery report, `grok inspect --json`, **inside the
  review worktree** and fails closed if it lists any hook/plugin/MCP/LSP
  server owned by the project (or with no ownership source at all). The
  review itself runs with `--no-memory`, `--no-subagents`, a
  `read_file,grep,list_dir` allowlist, `--deny MCPTool`, and web search off.
- **codex** runs `mcp list --json` twice — once plain, once with
  `-c mcp_servers.<server>.enabled=false` overrides for every configured
  server — and refuses to proceed while any server stays enabled. It also
  runs with `--disable plugins --disable apps --disable hooks
  --ignore-user-config --ignore-rules` and `-s read-only`. Unsafe server
  names are rejected outright, never interpolated into argv.

Around every reviewer run: a `git status --porcelain` + HEAD snapshot before
and after. Any worktree mutation or HEAD move voids that review — and one
voided reviewer invalidates the whole run.

### Fail-closed parsing (`lib/adapters.mjs`, `lib/verdicts.mjs`)

A reviewer counts only when ALL of the following hold; anything else fails
that reviewer and therefore the whole panel (`adjudicatePanel` returns
`invalid`):

- process exit code 0 and no timeout (default 30 min per reviewer,
  SIGTERM then SIGKILL),
- native result JSON parses and shows real completion (claude
  `type=result, subtype=success, is_error=false`; grok result text present
  with no error/truncation/turn-limit markers in metadata; codex JSONL events
  parsed + non-empty `--output-last-message` file),
- provider-reported model identity matches the requested model. For claude
  and grok the identity comes from the native result envelope's `modelUsage`
  keys (`identityEvidence: native-model-usage-keys`); for codex — whose
  stdout carries no model identity — it comes from the CLI's own rollout
  session file (`$CODEX_HOME/sessions/.../rollout-…-<thread>.jsonl`,
  `session_meta` + `turn_context` only; evidence kind
  `cli-session-turn-context`, timestamped inside the review invocation
  window). Accept lists are explicit per model with no fuzzy fallback, so
  the Opus slot can never be satisfied by a Fable id and vice versa,
- the reply contains a parseable verdict block that restates the exact PR
  number and head SHA, uses only enumerated values, and is not
  contradictory: `approve` with a **blocker or major** finding is rejected,
  as is `approve` carrying **unresolved questions** (those must downgrade to
  needs-human), and every `unresolved` entry must be a non-empty string,
- every finding carries all required fields.

Grok-specific: result text is read only from known result fields
(`response`, `result`, `content`, …, or the last assistant message).
`thought`/`draft`/`reasoning`-style fields are never consulted — a verdict
that exists only inside them does not exist (pinned by tests).

The final decision order is `invalid` > `reject` > `needs-human` > `approve`.
One bad reviewer invalidates the run; it never downgrades to approve.

### Receipts (`lib/receipts.mjs`)

Each run writes `.review-receipts/pr-<n>-<sha8>-<timestamp>.json`
(gitignored, local-only) containing: schema version, PR + exact head SHA +
diff digest (sha256), impact mapping, the requested panel **with its reviewer
list**, per-reviewer record (requested model **and** provider-reported
identity + the evidence kind it came from, verdict, findings, unresolved
questions, failure reasons), the panel decision, and
deterministic-verification metadata. The tool never runs tests itself;
`--verify-commit <sha>` records the caller's attestation as a claim, clearly
labelled. Approval-shaped files inside a PR diff are never trusted as
receipts — receipts are only what this tooling wrote locally.

Publishing re-derives the decision from the in-memory reviewer records and
refuses if the receipt does not match the run (decision, PR, head SHA, diff
digest, reviewer count, **and** that the records constitute exactly the
requested panel) — a doctored or stale receipt file can never publish.

### Publish gating (`lib/publish.mjs`)

`--publish` re-fetches `headRefOid` **and** `baseRefOid` via `gh` immediately
before writing; either having moved aborts with `STALE_HEAD` / `PR_MOVED` and
writes nothing. An approving decision additionally requires the `verify`
check run on the exact reviewed SHA to have concluded `success`, and only
check runs owned by the GitHub Actions app (id 15368) count — a third-party
check merely *named* `verify` is not our deterministic verification. The gate
judges the **latest** run by `started_at` (paginated, `per_page=100`): a
newer queued/in-progress run blocks even if an older run succeeded, while a
re-run heals an older failure. Anything short of that fails closed with
`VERIFY_NOT_SUCCESSFUL` and nothing is written.

The commit status context is `calculation-review`, mapped honestly from the
decision (`approve→success`, `reject→failure`, `needs-human→failure` — GitHub
has no neutral state and the gate must fail closed — `invalid→error`), plus
an optional concise PR comment (`--comment`) that identifies reviewers by
model — never by person, never as a human approval. The toolchain contains
no merge path.

## Source freshness process

`npm run review:sources` renders the deterministic report from
`scripts/review/sourceCatalog.mjs` + `lib/sources.mjs`:

- Golden sources are **reused from `validationSources`**
  (`src/test/externalGoldenFixtures.ts`) at report time — no duplicated dates
  or URLs. A vitest drift test (`sources.test.mjs`) pins that the catalog
  covers exactly the fixture ids.
- Root research docs (`*_RESEARCH.md`, `LEGAL_REVIEW.md`,
  `LEGAL_IMPLEMENTATION_AUDIT_2026.md`) are parsed from their own header
  lines: `Last researched` / `Targeted update` count as capture activity;
  `Last reviewed` / `Last audited` / `Last structured review` count as review
  activity.
- `lastCaptured` and `lastReviewed` are tracked as **distinct** dates. Unknown
  review dates stay `null` and render as "null (no record)" — absence of
  evidence never masquerades as a recent review.
- Policy: captures and reviews go stale after 6 months
  (`DEFAULT_POLICY` in `lib/sources.mjs`). The report is deterministic for a
  given `now`; `--fail-on-stale` turns it into a check a local heartbeat can
  call. The operator (repo owner) wires the heartbeat once the toolchain has
  proven itself live; there is deliberately no cron workaround and no
  persistent credential setup in the repo.

### Monthly source audit procedure

Run once a month (calendar reminder on the operator machine; the heartbeat
only *detects* staleness, the audit is the human/agent process):

1. `npm run review:sources` — list stale and never-reviewed items.
2. For each item, inspect the official source for changes since
   `lastCaptured` (BGBl. / BMF / BMAS / DRV / GKV pages, § 32a tariff tables,
   BBG ordinances, Basiszins letters, Rentenwert announcements).
3. If a value or interpretation changed: update the research doc header
   dates, update `src/rules/` values, add/adjust a golden fixture with
   capture date + notes, run `npm run verify`.
4. After reviewing an item against the implementation **without** a drift:
   record the review (add a dated review line to the doc header, or a dated
   note in the golden fixture) so `lastReviewed` stops being null.
5. Escalate consequential unresolved questions as GitHub issues instead of
   guessing; link them from the research doc.

A reachable link never approves an interpretation; the audit is about
*content changes*, not availability.

## Operator playbook

```bash
# plan only (no model calls)
npm run review:plan -- --pr 123
npm run review:plan -- --pr 123 --complex --json

# full review, local receipt only
npm run review:run -- --pr 123 --verify-commit $(git rev-parse HEAD)

# full review, then publish status + comment (gated on exact head + verify check)
npm run review:run -- --pr 123 --publish --comment

# freshness
npm run review:sources
npm run review:sources -- --json --fail-on-stale
```

Everything runs offline except `gh` (GitHub API, read-only except the
explicit publish call) and the model CLIs you explicitly invoke.

## Known model assumptions and open questions

The toolchain reviews code against sources; it does **not** fix known
modeling gaps. These remain open, deliberately documented rather than
silently assumed away:

- **KV/PV proportional apportionment over BBG** — a documented modeling
  choice; no statute mandates priority for single-member cases
  (`CONTEXT.md` → cross-cutting invariants).
- **bAV cap/subsidy from year-1 inputs** held constant under
  Beitragsdynamik — documented approximation (`CLAUDE.md`).
- **AVD 2027 constants** pending final BGBl. publication
  (`docs/validation.md` Priority Backlog #5;
  `ALTERSVORSORGEDEPOT_2027_RESEARCH.md` caveat).
- **DRV Rentenschätzer** still showing 40.79 EUR/EP while the app uses the
  announced 42.52 EUR/EP from 2026-07-01 (`docs/validation.md` backlog #1).
- **AVD Günstigerprüfung eligibility gate** missing (#363).
- **bAV offer (Angebot) default conversion double-counted** by the
  recommender (#349).
- **Statutory parameter versioning** as a broader fix for year-coupling
  (#376) and the Riester Kinderzuschlag opt-out (#371) remain feature work.

The golden fixtures and this catalog pin what *is* verified; everything above
stays visible until closed by its own issue.

## Cost model

Routine review = 2 model runs (Grok 4.6 + Opus) over a bounded prompt
(≤ 600 k chars, typically far less). Complex = 3 runs. The dominant cost is
reviewer latency (minutes, not seconds); publish adds two `gh` calls.

## Known quirks / limitations

- `--max-turns 35` works in the installed claude build (2.1.263) even though
  `--help` omits it; the wall-clock timeout remains the backstop.
- `codex exec` receives the prompt on stdin (argv would risk ARG_MAX on big
  diffs); its provider model identity is not in the `--json` event stream at
  all — it is read from the rollout session file the CLI itself writes, and
  a run without one fails closed rather than being trusted.
- Grok's native JSON field names are not documented beyond `--help`, so the
  parser accepts a conservative allowlist of result fields and fails closed
  on anything it does not recognize. Its config-discovery posture relies on
  `grok inspect --json` (the CLI's own machine-readable report); if a future
  version changes that shape, the preflight fails closed.
- The impact map is intentionally coarse: `src/features/**` code counts as
  calculation-bearing because display-layer row builders compute numbers.
- Reviewers run in a detached worktree pinned to the reviewed SHA, so a PR
  that changes mid-review cannot leak into an in-flight run; a moved PR is
  caught by the publish re-check, and the worktree is removed in a `finally`.

## Adapting to other projects

The tooling is repo-agnostic except for: `src/test/externalGoldenFixtures.ts`
(golden source reuse — replace or drop), the root research-doc list in
`sourceCatalog.mjs`, the domain focus matchers in `impactMap.mjs`, and the
review-bar context files. The CLI adapters (`lib/adapters.mjs`) pin argument
shapes that must be re-checked against the installed CLIs' `--help`.
