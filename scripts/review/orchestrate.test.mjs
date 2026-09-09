import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { executeReview, planReview } from './lib/orchestrate.mjs'
import { diffDigest } from './lib/prInfo.mjs'
import { BASE_CONTEXT_FILES, DOMAIN_CONTEXT_FILES, contextFilesForImpact, mapImpact } from './lib/impactMap.mjs'
import { saveReceipt } from './lib/receipts.mjs'
import { DEFAULT_POLICY } from './lib/sources.mjs'

// Full-pipeline tests. Everything external is faked: gh returns canned JSON,
// git worktree/snapshot operations are a fake over one real temp directory,
// and reviewers are the local node fixture. No test in this file contacts the
// network or a model CLI.

const SHA = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
const THREAD = '01a082a3-fc89-74c3-8171-be21bf04c4c7'
const NOW = new Date('2026-09-08T12:00:00Z')
const DIFF = 'diff --git a/src/engine/tax.ts\n+++ b/src/engine/tax.ts\n+const x = 1\n'
const PR_URL = 'https://github.com/PeterHartwieg/Rentenrechner/pull/42'
const FIXTURE = new URL('./test-fixtures/fake-reviewer.mjs', import.meta.url).pathname

// executeReview resolves binaries from env before spawning; point all three
// at the local node executable (guaranteed present and executable) so the
// availability preflight passes without touching any real model CLI.
Object.assign(process.env, {
  REVIEW_CLAUDE_BIN: process.execPath,
  REVIEW_GROK_BIN: process.execPath,
  REVIEW_CODEX_BIN: process.execPath,
})

// The pipeline pins reviewers to one real directory standing in for the
// detached review worktree (spawn needs an existing cwd; the codex rollout
// fixture records this path as the session cwd). Context is genuinely read
// from it, so every mapped context file is copied in from the real checkout.
const WORKTREE = realpathSync(mkdtempSync(join(tmpdir(), 'rw-orch-worktree-')))
const CONTEXT_PATHS = contextFilesForImpact(
  mapImpact(['src/engine/tax.ts']), // broad → base + all domain context
  () => true,
)

beforeEach(() => {
  rmSync(WORKTREE, { recursive: true, force: true })
  mkdirSync(WORKTREE, { recursive: true })
  for (const path of [...new Set([...BASE_CONTEXT_FILES, ...CONTEXT_PATHS, ...Object.values(DOMAIN_CONTEXT_FILES).flat()])]) {
    const source = join(process.cwd(), path)
    if (!existsSync(source)) continue
    const target = join(WORKTREE, path)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
  }
})
afterEach(() => rmSync(WORKTREE, { recursive: true, force: true }))

// Fake git: `worktree add` is accepted (the directory already exists via
// makeWorktreeDir), snapshots answer for the worktree, removal clears it. The
// status mirrors any artifact a misbehaving reviewer actually wrote.
function fakeRunGit({ baseContained = true } = {}) {
  const calls = []
  const run = async (args, { cwd } = {}) => {
    calls.push(args.join(' '))
    if (args[0] === 'worktree' && args[1] === 'add') return { stdout: `Preparing worktree (detached HEAD ${args[3]})\n` }
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
      if (!baseContained) {
        const error = new Error(`Command failed: git ${args.join(' ')}\n`)
        error.code = 1 // exit code 1 = "not an ancestor", not a tooling failure
        throw error
      }
      return { stdout: '' }
    }
    if (args[0] === 'rev-parse' && cwd === WORKTREE) return { stdout: `${SHA}\n` }
    if (args[0] === 'status') {
      return { stdout: existsSync(join(WORKTREE, 'fake-reviewer-artifact.txt')) ? '?? fake-reviewer-artifact.txt\n' : '' }
    }
    if (args[0] === 'worktree' && args[1] === 'remove') {
      rmSync(WORKTREE, { recursive: true, force: true })
      return { stdout: '' }
    }
    if (args[0] === 'worktree' && args[1] === 'prune') return { stdout: '' }
    throw new Error(`unexpected git call: ${args.join(' ')} (cwd ${cwd})`)
  }
  return { run, calls }
}

// Fake gh: two `pr view` calls + two branch-API calls anchor the review; any
// later call (the publish re-check) reports the CURRENT refs so stale/moved
// cases can be simulated.
function fakeGh({
  currentHead = SHA,
  snapshotBase = BASE,
  currentSnapshotBase = BASE,
  liveBase = BASE,
  liveBaseAfter,
  liveBaseMovesAtCall = Infinity,
  checkRuns = [],
} = {}) {
  const calls = []
  let views = 0
  let branchCalls = 0
  const run = async (command, args) => {
    calls.push([command, ...args].join(' '))
    expect(command).toBe('gh')
    if (args[0] === 'pr' && args[1] === 'view') {
      views += 1
      const head = views > 2 ? currentHead : SHA
      const base = views > 2 ? currentSnapshotBase : snapshotBase
      return JSON.stringify({
        number: 42,
        headRefOid: head,
        headRefName: 'codex/some-fix',
        baseRefOid: base,
        baseRefName: 'main',
        title: 'Fix BBG cap',
        url: PR_URL,
      })
    }
    if (args[0] === 'api' && args[1]?.startsWith('repos/') && args.includes('.commit.sha')) {
      branchCalls += 1
      return branchCalls >= liveBaseMovesAtCall ? (liveBaseAfter ?? liveBase) : liveBase
    }
    if (args[0] === 'pr' && args[1] === 'diff' && args.includes('--name-only')) return 'src/engine/tax.ts\n'
    if (args[0] === 'pr' && args[1] === 'diff') return DIFF
    if (args[0] === 'api' && args[1]?.includes('/check-runs')) {
      return JSON.stringify({ total_count: checkRuns.length, check_runs: checkRuns })
    }
    return ''
  }
  return {
    run,
    calls,
    branchCalls: () => branchCalls,
    statusWrites: () => calls.filter((call) => call.includes('/statuses/')),
    comments: () => calls.filter((call) => call.startsWith('gh pr comment')),
  }
}

// The pipeline passes `command` straight through; we derive the reviewer kind
// from the argv shape. `mcp list` / `inspect --json` calls are preflights,
// not reviews.
function kindFromArgs(args) {
  if (args[0] === 'mcp') return 'codex-mcp'
  if (args[0] === 'inspect') return 'grok-inspect'
  if (args[0] === 'exec') return 'codex'
  if (args.includes('--prompt-file')) return 'grok'
  return 'claude'
}

function pipelineSpawn(modes) {
  return (command, args, options) => {
    const kind = kindFromArgs(args)
    const env = {
      ...options.env,
      FAKE_REVIEW_CLI: kind,
      FAKE_REVIEW_MODE: modes[kind] ?? 'success',
      FAKE_CODEX_THREAD_ID: THREAD,
    }
    return spawn(process.execPath, [FIXTURE, ...args], { ...options, env })
  }
}

// Synthetic codex rollout named after the injected `now` (local wall clock —
// how the CLI names session files) with an mtime just after the start, so the
// runner's identity window checks pass deterministically.
function codexSessionsFixture({ model = 'gpt-6-astra', now = NOW } = {}) {
  const pad = (n) => String(n).padStart(2, '0')
  const y = now.getFullYear()
  const mo = pad(now.getMonth() + 1)
  const d = pad(now.getDate())
  const h = pad(now.getHours())
  const mi = pad(now.getMinutes())
  const s = pad(now.getSeconds())
  const sessionsDir = mkdtempSync(join(tmpdir(), 'rw-orch-codex-'))
  const dir = join(sessionsDir, String(y), mo, d)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `rollout-${y}-${mo}-${d}T${h}-${mi}-${s}-${THREAD}.jsonl`)
  writeFileSync(
    file,
    [
      JSON.stringify({ type: 'session_meta', payload: { id: THREAD, model_provider: 'openai', cwd: WORKTREE } }),
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1', model, cwd: WORKTREE } }),
    ].join('\n'),
    'utf8',
  )
  utimesSync(file, now, new Date(now.getTime() + 1000))
  return sessionsDir
}

async function runPipeline({
  complex = false,
  modes = {},
  publish = false,
  comment = false,
  verifyCommit = null,
  gh,
  codexModel,
  codexSessionNow = NOW,
  clock,
  now = NOW,
  makeWorktreeDir,
  repoRoot = process.cwd(),
  save,
} = {}) {
  const fake = gh ?? fakeGh()
  const git = fakeRunGit()
  const saved = []
  const spawned = []
  const spawnImpl = (command, args, options) => {
    spawned.push(`${command} ${args.join(' ')}`)
    return pipelineSpawn(modes)(command, args, options)
  }
  try {
    const result = await executeReview({
      pr: 42,
      complex,
      publish,
      comment,
      repoRoot,
      verifyCommit,
      timeoutMs: 30_000,
      ghRun: fake.run ?? fake,
      spawnImpl,
      runGit: git.run,
      codexSessionsDir: codexSessionsFixture({ model: codexModel, now: codexSessionNow }),
      now,
      clock,
      makeWorktreeDir: makeWorktreeDir ?? (() => WORKTREE),
      save:
        save ??
        (({ receipt }) => {
          // Snapshot the receipt AS SAVED: the pipeline keeps mutating the
          // same object (publication metadata), so a shared reference would
          // hide what each write actually contained.
          saved.push(structuredClone(receipt))
          return `/fake/receipt-${saved.length}.json`
        }),
    })
    return { ...result, saved, git, spawned }
  } catch (error) {
    // Attach the fakes so failure-path tests can assert on what happened.
    throw Object.assign(error, { git, saved, spawned })
  }
}

describe('planReview', () => {
  it('plans the routine panel against an atomically captured head+base', async () => {
    const plan = await planReview({ pr: 42, repoRoot: process.cwd(), ghRun: fakeGh().run })
    expect(plan.panel.kind).toBe('routine')
    expect(plan.panel.reviewers.map((r) => r.reviewer)).toEqual(['grok', 'claude'])
    expect(plan.prInfo.headSha).toBe(SHA)
    expect(plan.prInfo.baseSha).toBe(BASE)
    expect(plan.impact.breadth).toBe('broad')
    expect(plan.contextPaths).toContain('AGENTS.md')
  })

  it('plans against the LIVE base head and records the PR base snapshot separately', async () => {
    // Observed live on PR #391: baseRefOid frozen at 7c92d5a while main was
    // already at d7d9ec1. The review must pin the branch target, and the
    // receipt must show both facts.
    const plan = await planReview({
      pr: 42,
      repoRoot: process.cwd(),
      ghRun: fakeGh({ snapshotBase: '7'.repeat(40), liveBase: BASE }).run,
    })
    expect(plan.prInfo.baseSha).toBe(BASE)
    expect(plan.prInfo.baseSnapshotSha).toBe('7'.repeat(40))
  })

  it('plans the complex panel only when explicitly requested', async () => {
    const plan = await planReview({ pr: 42, complex: true, repoRoot: process.cwd(), ghRun: fakeGh().run })
    expect(plan.panel.kind).toBe('complex')
    expect(plan.panel.reviewers.map((r) => r.reviewer)).toEqual(['claude', 'codex', 'grok'])
  })
})

describe('executeReview — pre-flight aborts before any reviewer runs', () => {
  it('aborts with PR_MOVED when the live base advances while the diff is captured', async () => {
    const gh = fakeGh({ liveBase: BASE, liveBaseAfter: 'e'.repeat(40), liveBaseMovesAtCall: 2 })
    const error = await runPipeline({ gh }).catch((e) => e)
    expect(error.code).toBe('PR_MOVED')
    expect(error.message).toMatch(/base [0-9a-f]{8}→[0-9a-f]{8}/)
    expect(error.saved).toHaveLength(0)
    expect(error.spawned).toHaveLength(0)
  })

  it('aborts with BASE_NOT_CONTAINED when the reviewed head does not contain the live base', async () => {
    const git = fakeRunGit({ baseContained: false })
    const saved = []
    const error = await executeReview({
      pr: 42,
      repoRoot: process.cwd(),
      timeoutMs: 30_000,
      ghRun: fakeGh().run,
      spawnImpl: pipelineSpawn({}),
      runGit: git.run,
      codexSessionsDir: codexSessionsFixture(),
      now: NOW,
      makeWorktreeDir: () => WORKTREE,
      save: ({ receipt }) => {
        saved.push(receipt)
        return '/fake/never.json'
      },
    }).catch((e) => e)
    expect(error.code).toBe('BASE_NOT_CONTAINED')
    expect(error.message).toMatch(/does not contain the live base/)
    expect(saved).toHaveLength(0)
    expect(git.calls.some((call) => call.startsWith('merge-base --is-ancestor'))).toBe(true)
  })

  it('refuses a checkout that carries a symlink before reading context or spawning reviewers', async () => {
    const error = await runPipeline({
      // The "worktree" the pipeline is handed already contains a planted
      // link — the shape git tracks when a PR adds a symlink file.
      makeWorktreeDir: () => {
        const link = join(WORKTREE, 'CONTEXT.md')
        rmSync(link, { force: true })
        symlinkSync('/etc/hostname', link)
        return WORKTREE
      },
    }).catch((e) => e)
    expect(error.code).toBe('UNSAFE_REVIEW_TREE')
    expect(error.message).toMatch(/symlinked path\(s\).*CONTEXT\.md/s)
    // Nothing was read into a prompt and no reviewer started.
    expect(error.saved).toHaveLength(0)
    expect(error.spawned).toHaveLength(0)
  })
})

describe('executeReview — routine panel', () => {
  it('approves when all reviewers complete with matching SHA and model, and removes the worktree afterwards', async () => {
    const result = await runPipeline()
    expect(result.ok).toBe(true)
    expect(result.decision).toBe('approve')
    expect(result.reviews).toHaveLength(2)
    expect(result.receipt.reviewers.map((r) => r.accepted)).toEqual([true, true])
    expect(result.receipt.panel.kind).toBe('routine')
    expect(result.saved).toHaveLength(1)
    expect(result.git.calls).toContain(`worktree add --detach ${WORKTREE} ${SHA}`)
    expect(result.git.calls).toContain(`worktree remove --force ${WORKTREE}`)
  }, 60_000)

  it('rejects when one reviewer rejects', async () => {
    const result = await runPipeline({ modes: { grok: 'reject' } })
    expect(result.decision).toBe('reject')
    expect(result.ok).toBe(true)
  }, 60_000)

  it('fails closed when a verdict restates the wrong SHA', async () => {
    const result = await runPipeline({ modes: { claude: 'wrong-sha' } })
    expect(result.decision).toBe('invalid')
    expect(result.ok).toBe(false)
    expect(result.reasons.join('\n')).toMatch(/does not match the reviewed head/)
    // The failed run is still recorded honestly in the receipt.
    expect(result.receipt.decision).toBe('invalid')
  }, 60_000)

  it('fails closed when a reviewer crashes (exit-1)', async () => {
    const result = await runPipeline({ modes: { grok: 'exit-1' } })
    expect(result.decision).toBe('invalid')
    expect(result.reasons.join('\n')).toMatch(/exited with code 1/)
  }, 60_000)

  it('fails closed on malformed reviewer output', async () => {
    const result = await runPipeline({ modes: { claude: 'malformed' } })
    expect(result.decision).toBe('invalid')
    expect(result.reasons.join('\n')).toMatch(/non-JSON line/)
  }, 60_000)

  it('voids the whole run when a reviewer dirties the review worktree', async () => {
    const result = await runPipeline({ modes: { codex: 'write-worktree' }, complex: true })
    expect(result.decision).toBe('invalid')
    expect(result.reasons.join('\n')).toMatch(/modified the review worktree or moved HEAD/)
  }, 60_000)
})

describe('executeReview — complex panel', () => {
  it('runs all three reviewers including codex (MCP preflight + rollout identity) and approves', async () => {
    const result = await runPipeline({ complex: true })
    expect(result.decision, JSON.stringify(result.reasons, null, 2)).toBe('approve')
    expect(result.receipt.reviewers.map((r) => r.reviewer)).toEqual(['claude', 'codex', 'grok'])
    expect(result.receipt.panel.note).toMatch(/explicit --complex/)

    const codex = result.receipt.reviewers.find((r) => r.reviewer === 'codex')
    expect(codex.providerReportedModels).toEqual(['gpt-6-astra'])
    expect(codex.identityEvidence).toBe('cli-session-turn-context')
    // Identity comes from each CLI's own native metadata: claude's assistant
    // messages, grok's modelUsage keys.
    const claude = result.receipt.reviewers.find((r) => r.reviewer === 'claude')
    expect(claude.identityEvidence).toBe('native-assistant-message-models')
    expect(claude.providerReportedModels).toEqual(['claude-fable-5-1'])
    // Haiku appears in the usage map for side requests — recorded as
    // auxiliary, never as the reviewer.
    expect(claude.auxiliaryUsageModels).toEqual(['claude-haiku-4-5-20251001'])
    const grok = result.receipt.reviewers.find((r) => r.reviewer === 'grok')
    expect(grok.identityEvidence).toBe('native-model-usage-keys')
    expect(grok.auxiliaryUsageModels).toEqual([])
    // The preflight really ran `mcp list` twice against the fixture.
    const codexPre = result.reviews.find((r) => r.reviewer === 'codex').command
    expect(codexPre).toBe(process.execPath)
  }, 90_000)

  it('fails closed when the codex rollout records a different model', async () => {
    const result = await runPipeline({ complex: true, codexModel: 'gpt-5.6-sol' })
    expect(result.decision).toBe('invalid')
    expect(result.reasons.join('\n')).toMatch(/codex model identity mismatch/)
  }, 90_000)

  it('attributes codex identity to its OWN invocation window when a long first reviewer pushes the clock past 10 minutes', async () => {
    // A Fable-first complex panel where the first reviewer runs 12 minutes:
    // codex starts afterwards, so its rollout file is named at +12min. With
    // one panel-wide timestamp this was misattributed; with per-reviewer
    // windows it is cleanly accepted, and the tolerance itself is unchanged.
    const TWELVE_MIN = 12 * 60 * 1000
    const ticks = [
      NOW, // panel start
      NOW, // claude start
      new Date(NOW.getTime() + TWELVE_MIN), // claude complete
      new Date(NOW.getTime() + TWELVE_MIN), // codex start
      new Date(NOW.getTime() + TWELVE_MIN + 60_000), // codex complete
      new Date(NOW.getTime() + TWELVE_MIN + 60_000), // grok start
      new Date(NOW.getTime() + TWELVE_MIN + 120_000), // grok complete
    ]
    let tick = 0
    const clock = () => ticks[Math.min(tick++, ticks.length - 1)]
    const result = await runPipeline({
      complex: true,
      clock,
      codexSessionNow: new Date(NOW.getTime() + TWELVE_MIN),
    })
    expect(result.decision, JSON.stringify(result.reasons, null, 2)).toBe('approve')
    const byReviewer = Object.fromEntries(result.receipt.reviewers.map((r) => [r.reviewer, r]))
    expect(byReviewer.codex.accepted).toBe(true)
    expect(byReviewer.codex.startedAt).toBe(new Date(NOW.getTime() + TWELVE_MIN).toISOString())
    expect(byReviewer.codex.completedAt).toBe(new Date(NOW.getTime() + TWELVE_MIN + 60_000).toISOString())
    expect(byReviewer.claude.completedAt).toBe(new Date(NOW.getTime() + TWELVE_MIN).toISOString())
    // The panel timestamp stays at the panel start, separate from every
    // reviewer's invocation window.
    expect(result.receipt.generatedAt).toBe(NOW.toISOString())
  }, 90_000)

  it('still rejects a rollout from ANOTHER run — the clock injection widens nothing', async () => {
    // Same advancing clock, but the rollout file is named at the PANEL start
    // (a session from 12 minutes earlier): outside codex's own invocation
    // window, so identity must fail closed.
    const TWELVE_MIN = 12 * 60 * 1000
    const ticks = [NOW, NOW, new Date(NOW.getTime() + TWELVE_MIN), new Date(NOW.getTime() + TWELVE_MIN), new Date(NOW.getTime() + TWELVE_MIN + 60_000)]
    let tick = 0
    const clock = () => ticks[Math.min(tick++, ticks.length - 1)]
    const result = await runPipeline({ complex: true, clock, codexSessionNow: NOW })
    expect(result.decision).toBe('invalid')
    expect(result.reasons.join('\n')).toMatch(/codex|rollout|no codex rollout session file/)
  }, 90_000)
})

describe('executeReview — publish path', () => {
  const VERIFY_SUCCESS = {
    name: 'verify',
    status: 'completed',
    conclusion: 'success',
    head_sha: SHA,
    app: { id: 15368 }, // GitHub Actions — foreign check-run apps are rejected
  }

  it('publishes the in-memory run and stamps the receipt, re-checking the PR refs first', async () => {
    const gh = fakeGh({ checkRuns: [VERIFY_SUCCESS] })
    const result = await runPipeline({ publish: true, comment: true, gh })
    expect(result.decision).toBe('approve')
    expect(result.published.state).toBe('success')
    expect(result.receipt.published.at).toBe(NOW.toISOString())
    // collectPrInfo (2 views) + publish re-check (1 view) + check-runs + status + comment.
    expect(gh.calls.filter((call) => call.startsWith('gh pr view'))).toHaveLength(3)
    expect(gh.statusWrites()).toHaveLength(1)
    expect(gh.statusWrites()[0]).toContain(`statuses/${SHA}`)
    expect(gh.comments()).toHaveLength(1)
  }, 60_000)

  it('refuses to publish when the PR head moved after the review (STALE_HEAD)', async () => {
    const gh = fakeGh({ currentHead: 'd'.repeat(40), checkRuns: [VERIFY_SUCCESS] })
    const error = await runPipeline({ publish: true, gh }).catch((e) => e)
    expect(error.code).toBe('STALE_HEAD')
    expect(gh.statusWrites()).toHaveLength(0)
  }, 60_000)

  it('refuses to publish when the LIVE base advanced after the review (PR_MOVED)', async () => {
    // Branch call #3 is the publish re-check: main moved on while the panel
    // ran, so the reviewed diff no longer sits on the current base.
    const gh = fakeGh({ liveBaseAfter: 'e'.repeat(40), liveBaseMovesAtCall: 3, checkRuns: [VERIFY_SUCCESS] })
    const error = await runPipeline({ publish: true, gh }).catch((e) => e)
    expect(error.code).toBe('PR_MOVED')
    expect(error.message).toMatch(/base moved since the review/)
    expect(gh.statusWrites()).toHaveLength(0)
  }, 60_000)

  it('refuses to publish an approve without a successful verify check on the SHA', async () => {
    const gh = fakeGh({ checkRuns: [] })
    const error = await runPipeline({ publish: true, gh }).catch((e) => e)
    expect(error.code).toBe('VERIFY_NOT_SUCCESSFUL')
    expect(gh.statusWrites()).toHaveLength(0)
  }, 60_000)

  it('still removes the review worktree when publishing fails', async () => {
    const gh = fakeGh({ currentHead: 'd'.repeat(40), checkRuns: [VERIFY_SUCCESS] })
    const result = await runPipeline({ publish: true, gh }).catch((e) => e)
    expect(result.code).toBe('STALE_HEAD')
    // The pipeline's finally cleaned up through the fake git even though the
    // publish path threw.
    expect(result.git.calls).toContain(`worktree remove --force ${WORKTREE}`)
  }, 60_000)
})

describe('executeReview — canonical review worktree path (macOS /var -> /private/var)', () => {
  it('reaches approve through a symlinked PARENT PREFIX with no realpath injection at all', async () => {
    // Live finding (Claude Opus 5 on ad2f987): production never passed
    // realpathImpl, so the raw mkdtemp path (/var/folders/...) was compared
    // against the canonical cwd codex records (/private/var/folders/...) and
    // the complex panel could not produce a valid review on macOS. The
    // pipeline is handed a path whose PARENT is a symlink — nothing inside
    // the reviewed checkout is a symlink — and must canonicalize it itself.
    const linkParent = mkdtempSync(join(tmpdir(), 'rw-orch-linkparent-'))
    const linked = join(linkParent, 'worktree-link')
    symlinkSync(WORKTREE, linked)
    try {
      const result = await runPipeline({ complex: true, makeWorktreeDir: () => linked })
      expect(result.decision, JSON.stringify(result.reasons, null, 2)).toBe('approve')
      const codex = result.receipt.reviewers.find((r) => r.reviewer === 'codex')
      expect(codex.accepted).toBe(true)
      expect(codex.identityEvidence).toBe('cli-session-turn-context')
      // git saw the canonical path, not the symlinked one.
      expect(result.git.calls).toContain(`worktree add --detach ${WORKTREE} ${SHA}`)
    } finally {
      rmSync(linkParent, { recursive: true, force: true })
    }
  }, 90_000)

  it('still refuses a symlink TRACKED INSIDE the checkout reached through that prefix', async () => {
    // Canonicalizing the root must not become a symlink escape hatch: a link
    // planted inside the reviewed tree is still fatal.
    const linkParent = mkdtempSync(join(tmpdir(), 'rw-orch-linkparent-'))
    const linked = join(linkParent, 'worktree-link')
    symlinkSync(WORKTREE, linked)
    try {
      const error = await runPipeline({
        makeWorktreeDir: () => {
          const planted = join(WORKTREE, 'CONTEXT.md')
          rmSync(planted, { force: true })
          symlinkSync('/etc/hostname', planted)
          return linked
        },
      }).catch((e) => e)
      expect(error.code).toBe('UNSAFE_REVIEW_TREE')
      expect(error.message).toMatch(/CONTEXT\.md/)
      expect(error.spawned).toHaveLength(0)
    } finally {
      rmSync(linkParent, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('executeReview — production default clock', () => {
  it('reads real time on EVERY invocation when neither clock nor now is injected', async () => {
    // Live finding (root, on the native receipt for ad2f987): the default
    // `now = new Date()` was captured once and reused via `() => now`, so a
    // 15-minute two-reviewer run reported identical startedAt/completedAt for
    // both reviewers — and pinned every reviewer to the panel start, which is
    // exactly what pushes a delayed codex (Astra) rollout outside its own
    // identity window. Date is stepped here rather than injected, so the
    // DEFAULT path (no clock, no now) is what runs.
    const RealDate = globalThis.Date
    const STEP_MS = 60_000
    let ticks = 0
    class SteppingDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(NOW.getTime() + ticks++ * STEP_MS)
        else super(...args)
      }
      static now() {
        return NOW.getTime() + ticks++ * STEP_MS
      }
    }
    globalThis.Date = SteppingDate
    let result
    try {
      // No `now` and no `clock` reach executeReview — the production default.
      result = await runPipeline({ now: null, codexSessionNow: NOW })
    } finally {
      globalThis.Date = RealDate
    }

    expect(result.decision, JSON.stringify(result.reasons, null, 2)).toBe('approve')
    const [first, second] = result.receipt.reviewers
    const stamps = [
      result.receipt.generatedAt,
      first.startedAt,
      first.completedAt,
      second.startedAt,
      second.completedAt,
    ]
    for (const stamp of stamps) expect(stamp).toEqual(expect.any(String))
    const times = stamps.map((stamp) => new RealDate(stamp).getTime())
    // Strictly increasing: no two of these may be the same frozen instant.
    for (let i = 1; i < times.length; i++) {
      expect(times[i], `stamp ${i} must be later than ${i - 1}: ${JSON.stringify(stamps)}`).toBeGreaterThan(times[i - 1])
    }
    expect(new Set(stamps).size).toBe(stamps.length)
  }, 60_000)

  it('an explicitly injected `now` still pins one deterministic instant', async () => {
    const result = await runPipeline()
    expect(result.receipt.generatedAt).toBe(NOW.toISOString())
    for (const reviewer of result.receipt.reviewers) {
      expect(reviewer.startedAt).toBe(NOW.toISOString())
      expect(reviewer.completedAt).toBe(NOW.toISOString())
    }
  }, 60_000)
})

describe('executeReview — what the receipt on DISK says about publication', () => {
  const VERIFY_SUCCESS = {
    name: 'verify',
    status: 'completed',
    conclusion: 'success',
    head_sha: SHA,
    started_at: '2026-09-08T11:00:00Z',
    completed_at: '2026-09-08T11:30:00Z',
    id: 100,
    app: { id: 15368 },
  }

  function receiptRoot() {
    const root = mkdtempSync(join(tmpdir(), 'rw-orch-receipts-'))
    return root
  }

  function readReceipt(path) {
    return JSON.parse(readFileSync(path, 'utf8'))
  }

  it('persists the publication metadata to the SAVED FILE, not just the returned object', async () => {
    // Live finding (root, on the native receipt for ad2f987): the receipt was
    // written before publishRunStatus ran, so a genuinely published run left
    // `published: null` on disk forever.
    const root = receiptRoot()
    try {
      const gh = fakeGh({ checkRuns: [VERIFY_SUCCESS] })
      const result = await runPipeline({ publish: true, comment: true, gh, repoRoot: root, save: saveReceipt })
      expect(result.published.state).toBe('success')
      const onDisk = readReceipt(result.receiptPath)
      expect(onDisk.published).not.toBeNull()
      expect(onDisk.published.state).toBe('success')
      expect(onDisk.published.headSha).toBe(SHA)
      expect(onDisk.published.at).toBe(NOW.toISOString())
      expect(onDisk.decision).toBe('approve')
      // One receipt file per run: the pre-publish write is replaced, never
      // left behind as a second, contradictory record.
      expect(readdirSync(join(root, '.review-receipts'))).toHaveLength(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('leaves an honestly UNPUBLISHED receipt on disk when publishing is refused', async () => {
    const root = receiptRoot()
    try {
      const gh = fakeGh({ currentHead: 'd'.repeat(40), checkRuns: [VERIFY_SUCCESS] })
      const error = await runPipeline({ publish: true, gh, repoRoot: root, save: saveReceipt }).catch((e) => e)
      expect(error.code).toBe('STALE_HEAD')
      const dir = join(root, '.review-receipts')
      const files = readdirSync(dir)
      expect(files).toHaveLength(1)
      const onDisk = readReceipt(join(dir, files[0]))
      expect(onDisk.published).toBeNull()
      expect(gh.statusWrites()).toHaveLength(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('a run without --publish records published: null on disk', async () => {
    const root = receiptRoot()
    try {
      const result = await runPipeline({ repoRoot: root, save: saveReceipt })
      expect(result.decision).toBe('approve')
      expect(readReceipt(result.receiptPath).published).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('receipt contents from the pipeline', () => {
  it('carries diff digest, verify attestation claim, and reviewer identities', async () => {
    const result = await runPipeline({ verifyCommit: 'c'.repeat(40) })
    expect(result.receipt.diffDigest).toBe(diffDigest(DIFF))
    expect(result.receipt.deterministicVerification.verifiedAtCommit).toBe('c'.repeat(40))
    for (const reviewer of result.receipt.reviewers) {
      expect(reviewer.providerReportedModels.length).toBeGreaterThan(0)
      expect(reviewer.command).toBe(process.execPath)
    }
  }, 60_000)

  it('records the live base and the PR base snapshot as distinct facts, plus per-reviewer timing', async () => {
    const result = await runPipeline({ gh: fakeGh({ snapshotBase: '7'.repeat(40), liveBase: BASE }) })
    expect(result.receipt.baseSha).toBe(BASE)
    expect(result.receipt.baseSnapshotSha).toBe('7'.repeat(40))
    for (const reviewer of result.receipt.reviewers) {
      expect(reviewer.startedAt).toBe(NOW.toISOString())
      expect(reviewer.completedAt).toBe(NOW.toISOString())
    }
    expect(result.receipt.generatedAt).toBe(NOW.toISOString())
  }, 60_000)
})

describe('no live network or model access from review tooling', () => {
  const sourceFiles = listSources(join(process.cwd(), 'scripts', 'review'))

  it('review modules never contain direct network calls (gh subprocess is the only egress)', () => {
    expect(sourceFiles.length).toBeGreaterThan(10)
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/\bfetch\s*\(/)
      expect(text, file).not.toMatch(/XMLHttpRequest/)
      expect(text, file).not.toMatch(/sendBeacon/)
      expect(text, file).not.toMatch(/https?\.request/)
      expect(text, file).not.toMatch(/axios/)
      expect(text, file).not.toMatch(/node:https/)
    }
  })

  it('the fake reviewer fixture documents its offline contract', () => {
    const text = readFileSync(FIXTURE, 'utf8')
    expect(text).toMatch(/NEVER contacts a model or the network/)
  })
})

function listSources(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === 'test-fixtures' || name === 'node_modules') continue
      out.push(...listSources(path))
    } else if (/\.(mjs|ts)$/.test(name) && !name.endsWith('.test.mjs')) {
      out.push(path)
    }
  }
  return out
}

describe('source policy constant', () => {
  it('stays in sync with the documented report policy', () => {
    expect(DEFAULT_POLICY.captureStaleAfterMonths).toBe(6)
    expect(DEFAULT_POLICY.reviewStaleAfterMonths).toBe(6)
  })
})
