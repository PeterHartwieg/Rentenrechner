# Local calculation review toolchain (issue #382)

Design + operator docs for the **local** review planning/runner tooling in
`scripts/review/`. The tooling runs authenticated model CLIs that are already
installed and logged in on the operator's machine. It is not a GitHub
automation: no workflow, no backend, no telemetry, no credentials handling —
the CLIs keep using their own existing login state in place.

Decision record: [`ADR-0004`](../adr/0004-local-calculation-review-toolchain.md).

Pair with [`issue-to-merge-pipeline.md`](issue-to-merge-pipeline.md) (GitHub-side
automation) and [`docs/validation.md`](../validation.md) (external golden
suite). The two are complementary: goldens pin captured values; this toolchain
reviews *changes* against statutory sources before merge.

## What it does

1. **Plan** (`npm run review:plan -- --pr <n> [--complex]`) — reads the exact
   PR head SHA, the **live base-branch head**, and the changed files via
   `gh`, maps the change to review scope, names the panel and the context
   files. Read-only, no model calls.
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
| `routine` (default) | Grok 4.6 (`~/.grok/bin/grok`) + Claude Opus (`~/.local/bin/claude`, requested as the `opus` alias; the provider-reported primary model must be a `claude-opus-*` id) | every calculation-bearing PR |
| `complex` | Fable 5.1 (`claude-fable-5-1`, exact id) + GPT-6-Astra (`codex exec`) + Grok 4.6 | rare; **only** via explicit `--complex` |

The complex panel is unreachable without the literal flag — no heuristic picks
it. Both entrypoints parse the flag through the same helper
(`assertExplicitComplexFlag`): a bare `--complex`, `--complex true` and
`--complex=true` escalate, absence stays routine, and **any other
value-bearing form is rejected loudly** rather than silently downgraded — an
explicit escalation request must never be answered with a cheaper panel.

Argv handling backs that up (`lib/cliArgs.mjs`). `--name=value` is parsed as a
flag with a value (without it, `--complex=true` produced a flag literally
*named* `complex=true`, left `flags.complex` undefined, and read as "routine
was requested"). Each entrypoint declares the flags it accepts and rejects
anything else — unknown/misspelled flags (`--complexx=true`) and stray
positional arguments — **before** any GitHub call or reviewer spawn, so a typo
cannot quietly shrink the requested panel. Boolean flags (`--publish`,
`--comment`, `--json`) follow the same rule: present is on, absent is off, a
value other than `true` is an error rather than a quiet no-op. Pinned at the
entrypoints, not just on the helpers (`panels.test.mjs`, `cli.test.mjs`).

### Executable configuration

Default paths: `~/.local/bin/claude`, `~/.grok/bin/grok`, `codex` (PATH).
Override with `REVIEW_CLAUDE_BIN`, `REVIEW_GROK_BIN`, `REVIEW_CODEX_BIN`. A
missing binary fails with a message naming the env var and the expected
default location. The toolchain never reads, copies, or prints auth files —
each CLI uses its own credential store, untouched.

### PR anchor: head SHA + live base head (`lib/prInfo.mjs`)

Every review is pinned to two commits, both read via `gh`:

- **head** — `gh pr view --json headRefOid`. Reviewers must restate it, the
  worktree is checked out at it, verdicts must match it, publish re-checks it.
- **base** — the commit the base branch currently points at, read from the
  branch endpoint (`gh api repos/{owner}/{repo}/branches/<name> --jq .commit.sha`).
  The PR record's own `baseRefOid` / `base.sha` is the merge snapshot GitHub
  last computed for the PR; it was observed stale (pointing at `7c92d5a`)
  while `main` had already advanced to `d7d9ec1`. That snapshot is still
  captured, but only as provenance (`baseSnapshotSha`) — it is never the
  review base. Branch names are percent-encoded so a slashed branch stays one
  path segment.

The anchor is read **before** the diff is pulled and re-read after; any
movement of head, live base, or the PR's own base snapshot in between aborts
with `PR_MOVED` rather than reviewing a diff stitched from two states.
`--publish` repeats the same read immediately before writing.

### Conservative impact mapping (`lib/impactMap.mjs`)

Two tiers only:

- **broad** — the change can move computed numbers. All five calculation
  domains in scope (tax/payroll, KV/PV, funding/eligibility,
  investment/insurance, household interactions), because the shared engine
  feeds every product and both simulation modes. Domain *focus* hints are
  added to the prompt but never reduce scope.
- **narrow** — presentational-only paths (styling, prose docs, static
  assets). No calculation domain in scope. Dev tooling, worker/API code,
  workflows, and assurance docs are **not** narrow: they carry logic,
  defaults, or the review gates themselves.

Anything not matched by the narrow table is broad. The conservative fallback
is the point: an unclassified path must never silently shrink the review.
A broad change with **no** mapped focus domain is labelled exactly that in
the prompt ("none mapped — scope remains BROAD"), never "cosmetic-only": on
the first live panel run that mislabel presented a payout-tax PR as
presentational. Engine-root payout channels (`etfPayout.ts`,
`insurancePayout.ts`, `bavPayout.ts`, `certifiedPensionPayout.ts`,
`payoutMath.ts`) sit outside `src/engine/products/` and are mapped explicitly
to investment/insurance for that reason; the captured statutory oracle
fixtures (`src/test/externalGoldenFixtures.ts`) map to all five domains.
One carve-out: styling files (`.css`/`.scss`/… ) inside an otherwise
meaningful prefix count as cosmetic — meaningful prefixes beat file
extensions, and this is the only place an extension narrows a prefix.
Domain ids are shared with the source-freshness catalog.

Every **catalogued statutory source** is meaningful, and the list is imported
from `sourceCatalog.mjs` rather than restated: the root `*_RESEARCH.md` docs,
`LEGAL_REVIEW.md` and `LEGAL_IMPLEMENTATION_AUDIT_2026.md` are the documents
the freshness report tracks, so a change to one can move a statutory
interpretation and must never be classified as prose. Being catalog-driven is
the guarantee: a source added to the catalog tomorrow cannot become cosmetic
here by omission, and each one focuses exactly the domains the catalog's
`areas` say it underpins. The domain assurance maps
(`docs/context/rules-and-tax.md`, `docs/context/products.md`,
`docs/rules-versioning.md`, `docs/golden-coverage-audit.md`) are meaningful
for the same reason — they route a later statutory change to the rule file,
engine function, research doc, and oracle that own it. `docs/context/ui.md`
stays presentational. `src/engine/retirementTax.ts` focuses **both**
tax/payroll and KV/PV: it is the single retirement-tax pipeline (cohort
Besteuerungsanteil, Versorgungsfreibetrag, Werbungskosten/Sonderausgaben,
Ehegattensplitting) as well as the KV/PV apportionment.

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

**Statutory vs engineering evidence.** Statute + applicable date are required
only when a finding asserts something about the law. A finding about
engineering quality — code structure, invariants, tests, tooling, API
behavior — cites the repository itself (file path plus the CONTEXT.md /
CLAUDE.md invariant it protects) or official API/CLI documentation, and sets
`applicableDate` to `"unspecified"`. Demanding a statute for a tooling finding
would only produce invented citations.

**Pre-existing legal uncertainty** that is unrelated to the diff is a
*labelled limitation*: reviewers report it as an **`info` finding** so it
stays visible, and must neither manufacture it into a blocker/major finding
against the PR nor invent a law status either way. It must **not** go under
`unresolved` — the gate rejects every `approve` carrying unresolved
questions, so parking an unrelated limitation there would fail a PR for
something it did not change.

**`unresolved` is reserved** for consequential questions about *this* diff
that the reviewer could not settle and that need a human decision. That
treatment is deliberately unchanged: a real unresolved question still forces
`needs-human` or `reject`.

The wording is pinned to the validator (`lib/verdicts.mjs`) by tests in
`prompt.test.mjs`, so the prompt can never instruct reviewers to produce
output the gate rejects. The three rules that must agree:

| Reply shape | Gate |
|---|---|
| `approve` + `blocker` **or** `major` finding | rejected as contradictory |
| `approve` + any non-empty `unresolved` | rejected as contradictory |
| `approve` / `needs-human` + `info`/`minor` findings, empty `unresolved` | valid |
| `needs-human` + **empty** findings array + real `unresolved` questions | valid — never invent finding fields to fill the array |

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

### Checkout containment (`lib/contextGuard.mjs`)

The review checkout is PR-controlled content, including which paths are
symlinks — git tracks them, so a diff could ship
`AGENTS.md -> ../../../private-notes.md` and the context reader would hand
operator-private text to a model. Two independent, fail-closed guards:

- `assertNoSymlinksUnder` walks the review tree **before** any context read
  or reviewer spawn and refuses the review if it finds a single symlink
  (`UNSAFE_REVIEW_TREE`, naming the offending paths). Nothing in this repo is
  a tracked symlink, so the blunt rule is the safe rule. There is **no
  exemption** — not even `.git`: a worktree's `.git` is a plain pointer file,
  so it passes on its own merits, and a `.git` that is a symlink is reported
  like any other offender.
- `containedReadText` reads each context file through a canonical path proven
  to resolve inside the worktree root: relative paths only, no `..` escape,
  no symlinked component below the root, and a `realpath` re-check after
  resolution. This covers plain `..` escapes (no symlink needed) and any link
  planted after the scan. The root itself may sit behind a symlinked prefix
  (macOS `/var -> /private/var`) — canonicalising it cannot defeat the
  containment check that follows.

Per-reviewer clocks: `startedAt`/`completedAt` are read from the clock
immediately around **each** reviewer's own preflight+spawn, not from the
panel's shared timestamp. Reusing the panel start would bind every reviewer to
it, and a legitimately long first run (Fable) would push the next reviewer's
(Astra) rollout session file outside the codex identity window and fail a
valid review. The **default** clock reads real time on every call; `clock`/
`now` are injectable only so tests can pin a deterministic instant. (A frozen
default was a real bug: the first native panel receipt claimed identical
start and finish stamps for both reviewers of a 15-minute run.)

The review worktree path is **canonicalized when it is created**, before `git
worktree add`, so every later consumer — git, the containment walk, and the
codex rollout identity check — sees the same string the spawned CLIs record
as their cwd. On macOS `tmpdir()` sits behind `/var -> /private/var`, and the
codex identity comparison is literal, so a raw `mkdtemp` path voided every
codex review on the documented operator platform. Canonicalizing the ROOT is
not a symlink exemption: a symlink tracked anywhere inside the checkout is
still fatal.

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
- provider-reported model identity matches the requested model. For **claude**
  the reviewing model is the `model` field of the native assistant messages
  in the `stream-json --verbose` stream: EVERY assistant event must carry it
  (one that omits it fails the run instead of being skipped), they must all
  agree, and they must match the requested model.
  The final result's `modelUsage` keys are recorded separately — a key that
  is not the requested model (e.g. `claude-haiku-4-5-20251001` handling side
  requests) is logged as an `auxiliaryModels` fact, not an identity failure,
  but the primary model must still appear among the keys or the usage map
  contradicts the assistant stream (evidence kind
  `native-assistant-message-models`). For **grok** the identity is the result
  envelope's `modelUsage` object keys (`native-model-usage-keys`). For
  codex — whose stdout carries no model identity — it comes from the CLI's
  own rollout session file (`$CODEX_HOME/sessions/.../rollout-…-<thread>.jsonl`,
  `session_meta` + `turn_context` only; evidence kind
  `cli-session-turn-context`, timestamped inside **that reviewer's own**
  invocation window, see per-reviewer clocks above). Accept lists are explicit per model with no fuzzy fallback, so
  the Opus slot can never be satisfied by a Fable id and vice versa,
- the reply contains a parseable verdict block that restates the exact PR
  number and head SHA, uses only enumerated values, and is not
  contradictory: `approve` with a **blocker or major** finding is rejected,
  as is `approve` carrying **unresolved questions** (those must downgrade to
  needs-human), and every `unresolved` entry must be a non-empty string,
- every finding carries all required fields.

Grok-specific: the result text is read **only** from the native `text` field
of the result envelope — there is no `response`/`result`/`content` fallback
and no last-assistant-message reconstruction.
`thought`/`draft`/`reasoning`-style fields are never consulted — a verdict
that exists only inside them does not exist (pinned by tests).

The final decision order is `invalid` > `reject` > `needs-human` > `approve`.
One bad reviewer invalidates the run; it never downgrades to approve.

### Receipts (`lib/receipts.mjs`)

Each run writes `.review-receipts/pr-<n>-<sha8>-<timestamp>.json`
(gitignored, local-only) containing: schema version, PR + exact head SHA +
diff digest (sha256), impact mapping, the requested panel **with its reviewer
list**, per-reviewer record (requested model **and** provider-reported
identity + the evidence kind it came from, any auxiliary usage models seen
alongside the primary one, that reviewer's own start/finish timestamps,
verdict, findings, unresolved questions, failure reasons), the panel
decision, and
deterministic-verification metadata. The tool never runs tests itself;
`--verify-commit <sha>` records the caller's attestation as a claim, clearly
labelled. Approval-shaped files inside a PR diff are never trusted as
receipts — receipts are only what this tooling wrote locally.

With `--publish`, the receipt is written **twice to the same path**: once
before publishing (so a crash still leaves a record, honestly carrying
`published: null`) and again after the status write succeeds, now carrying the
publication metadata. The completed run's file therefore never understates a
status that really was published. This is a re-write of the in-memory run's
own receipt — there is still no path that reads a receipt back in, and
publishing remains impossible from a receipt file.

Publishing re-derives the decision from the in-memory reviewer records and
refuses if the receipt does not match the run (decision, PR, head SHA, diff
digest, reviewer count, **and** that the records constitute exactly the
requested panel) — a doctored or stale receipt file can never publish.

### Publish gating (`lib/publish.mjs`)

`--publish` re-fetches the head SHA **and** the live base-branch head via
`gh` immediately before writing; either having moved aborts with
`STALE_HEAD` / `PR_MOVED` and writes nothing. Using the live branch head (not
the PR's frozen base snapshot) is what makes "the base moved" detectable at
all. An approving decision additionally requires the `verify`
check run on the exact reviewed SHA to have concluded `success`, and only
check runs owned by the GitHub Actions app (id 15368) count — a third-party
check merely *named* `verify` is not our deterministic verification. Runs
belonging to a different `head_sha` void the evidence outright.

**How the runs are captured** (`fetchVerifyCheckRuns`). The request is
explicit about everything the answer depends on:
`repos/{owner}/{repo}/commits/<sha>/check-runs?filter=all&check_name=verify&per_page=100&page=<n>`.
`filter=all` matters: GitHub documents `filter` as defaulting to `latest`,
which filters check runs by their `completed_at` timestamp — and a queued
re-run has no `completed_at`, so the very run that must block an approval is
the one a default request is most likely to omit. `check_name` narrows
server-side so pagination cannot push a `verify` run off the end behind
unrelated checks; the GitHub-Actions app-id filter stays local, because a
third-party check may share the name. Pages are requested explicitly (rather
than via `gh api --paginate`, which concatenates one JSON object per page)
so completeness is checked here: a malformed page, a missing `total_count`,
a `total_count` that changes between pages, or fewer runs collected than
`total_count` all refuse the evidence. An incomplete list can hide a pending
run, so it is never judged.

**Which run decides the SHA** (`selectDecisiveVerifyRun`).
Ordering is derived only from fields the REST API documents for a check run
(`status`, `conclusion`, `started_at`, `head_sha`). Check-run `id` is *not*
used as a clock — ids are identifiers, not a documented ordering guarantee —
and neither is the array order of `check_runs`, which the API does not
document either. In order:

1. **Any** run that is not `completed` blocks, with no timestamp comparison
   at all. A queued run has `started_at: null` until it starts, so the old
   "sort by `started_at`, take the first" rule sorted the newest re-run last
   and let an older success through while verification was still pending.
   A run in flight means the SHA's state is unknown.
2. A single completed run is decisive; no ordering is needed.
3. Several completed runs are ordered by `started_at`. A completed run
   without a parseable `started_at` makes the order unknowable → refuse.
4. Runs tied on the newest `started_at` are decisive only if they agree on
   the conclusion (then the order cannot change the answer). Disagreeing
   ties → refuse.

So a re-run still heals an older failure, and a newer failed or cancelled run
still overrides an older success. Anything else — including "we cannot tell
which run is newest" — fails closed with `VERIFY_NOT_SUCCESSFUL`, and nothing
is written. Uncertain evidence is refused rather than resolved by guesswork.

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
- A golden source gets a review date **only** from an explicit record in
  `GOLDEN_SOURCE_REVIEWS` (`sourceCatalog.mjs`), keyed by `validationSources`
  id: `{ lastReviewed: 'YYYY-MM-DD', note?: string }`, where `note` says what
  was checked and where the evidence lives. The catalog validates every
  record — unknown id, non-object record, missing/malformed date, non-string
  note all throw instead of rendering a guess — and a source with no record
  keeps `lastReviewed: null` rather than inheriting its capture date. The
  set starts **empty**: dates are written by a real audit (below), never
  generated. Pinned by `sources.test.mjs`.
- Dates are validated as **real calendar dates**, not just `YYYY-MM-DD`
  shaped: `2026-02-31` matches the shape but `new Date()` rolls it over to
  2026-03-03, which would then be measured — and possibly labelled fresh —
  as a day that never existed. `isRealCalendarDate` round-trips through UTC
  and rejects it. Curated review records fail loudly; an impossible date in a
  research-doc header degrades to "no record" instead of crashing the report.
- A date **in the future** relative to the report's injected `now` is never
  fresh: it renders as `future-dated` (an impossible date as `invalid-date`)
  and needs attention. Nobody captured or reviewed anything on a day that has
  not happened.
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
   record the review so `lastReviewed` stops being null — for a research doc
   add a dated `Last reviewed:` header line; for a golden source add a
   `GOLDEN_SOURCE_REVIEWS` entry with that date and a note naming the
   evidence (fixture id + commit, or the audit note in a research doc).
   Only a review that actually happened gets a date.
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

## Known modeling gaps (pointer, not a copy)

The toolchain reviews code against sources; it does **not** fix known modeling
gaps, and it deliberately does **not** restate them here. A copied list of
legal caveats goes stale the moment the underlying doc is updated, and a stale
caveat in a review doc is worse than none — reviewers would weigh it as
current.

The single sources of truth are:

- [`docs/validation.md`](../validation.md) — golden-suite coverage and the
  priority backlog of known divergences.
- `CONTEXT.md` / `CLAUDE.md` — cross-cutting modeling choices and documented
  approximations.
- The root `*_RESEARCH.md` docs and `LEGAL_REVIEW.md` /
  `LEGAL_IMPLEMENTATION_AUDIT_2026.md` — per-area caveats with their own
  dates, which `npm run review:sources` tracks.
- Open GitHub issues for anything consequential and unresolved.

Reviewers are told the same thing in the prompt: an existing legal
uncertainty unrelated to the diff is a labelled limitation to report as an
`info` finding — not a finding to manufacture against the PR, and not an
`unresolved` question that would block it.

## Cost model

Routine review = 2 model runs (Grok 4.6 + Claude Opus) over a bounded prompt
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
  parser reads the review text from the single verified native field `text`
  and from nothing else — no `response`/`result`/`content` fallback, no
  last-assistant-message reconstruction, and never a thought/draft field. An
  envelope that carries the verdict anywhere else fails closed rather than
  being salvaged. Its config-discovery posture relies on
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
