// Review pipeline orchestration used by review-run.mjs.
//
// All external effects are injectable (gh runner, spawn, git, clock, file
// reads) so tests drive the full pipeline with fakes and never touch the
// network or a real model CLI.
//
// Execution shape: capture PR head + LIVE base atomically → map impact →
// create a clean detached worktree at the exact head SHA → require the head
// to contain the live base → reject symlink-bearing trees → read mapped
// context FROM THAT SHA through contained reads → run the panel inside the
// worktree (each reviewer with its own invocation timestamps) → validate
// verdicts → adjudicate → save a local receipt → optionally publish
// (in-memory only).

import { existsSync, readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

import { makeSubprocessRun } from './ghRun.mjs'

import { collectPrInfo } from './prInfo.mjs'
import { contextFilesForImpact, mapImpact } from './impactMap.mjs'
import { collectContextExcerpts, buildReviewPrompt } from './prompt.mjs'
import { selectPanel } from './panels.mjs'
import { assertReviewerBinAvailable } from './binPaths.mjs'
import {
  buildReviewerInvocation,
  parseClaudeReviewerOutput,
  parseCodexReviewerOutput,
  parseGrokReviewerOutput,
} from './adapters.mjs'
import {
  assertHeadContainsBase,
  createReviewWorktree,
  executeReviewer,
  removeReviewWorktree,
} from './runner.mjs'
import { assertNoSymlinksUnder, containedReadText } from './contextGuard.mjs'
import { adjudicatePanel, extractVerdictBlock, validateVerdict } from './verdicts.mjs'
import { buildReceipt, saveReceipt } from './receipts.mjs'
import { publishRunStatus } from './publish.mjs'

export const DEFAULT_REVIEWER_TIMEOUT_MS = 30 * 60 * 1000

const PARSERS = {
  claude: parseClaudeReviewerOutput,
  grok: parseGrokReviewerOutput,
  codex: parseCodexReviewerOutput,
}

// gh runner returns the raw stdout STRING (same contract as the injected
// fakes) — callers parse text, not {stdout, stderr}. Note: makeSubprocessRun
// is a factory; this calls it once to get the actual runner.
const defaultGhRun = makeSubprocessRun()

function defaultRunGit(args, { cwd } = {}) {
  return promisify(execFile)('git', args, { encoding: 'utf8', cwd, maxBuffer: 16 * 1024 * 1024 })
}

function repoPath(repoRoot, path) {
  return join(repoRoot, path)
}

// Builds the full review plan WITHOUT running any reviewer. Shared by
// review-plan.mjs (display) and executeReview (execution). The exists() check
// here is advisory display filtering against the current checkout; execution
// re-reads context at the reviewed SHA and fails if it is unavailable there.
export async function planReview({ pr, complex = false, repoRoot = process.cwd(), ghRun = defaultGhRun }) {
  const prInfo = await collectPrInfo({ pr, run: ghRun })
  const impact = mapImpact(prInfo.files)
  const panel = selectPanel({ complex })
  const contextPaths = contextFilesForImpact(impact, (path) => existsSync(repoPath(repoRoot, path)))
  return { prInfo, impact, panel, contextPaths }
}

export async function executeReview({
  pr,
  complex = false,
  publish = false,
  comment = false,
  repoRoot = process.cwd(),
  verifyCommit = null,
  timeoutMs = DEFAULT_REVIEWER_TIMEOUT_MS,
  ghRun = defaultGhRun,
  spawnImpl,
  runGit = defaultRunGit,
  codexSessionsDir,
  now = null,
  clock,
  save = saveReceipt,
  makeWorktreeDir,
}) {
  // One panel timestamp for receipt bookkeeping; each reviewer gets its OWN
  // invocation start/completion from the same clock.
  //
  // The DEFAULT reads real time on every call. A frozen default (`() => now`
  // captured once) made a native receipt claim identical startedAt and
  // completedAt for both reviewers of a 15-minute run, and — worse — pinned
  // every reviewer to the panel start, which is exactly what pushes a delayed
  // codex (Astra) rollout file outside its own identity window. `clock` and
  // `now` stay injectable so tests can pin a fixed instant deliberately.
  const panelClock = clock ?? (now ? () => now : () => new Date())
  const panelStartedAt = panelClock()
  const { prInfo, impact, panel, contextPaths } = await planReview({ pr, complex, repoRoot, ghRun })

  // Reviewers work in a clean detached worktree pinned to the exact head SHA.
  const worktree = await createReviewWorktree({
    repoRoot,
    headSha: prInfo.headSha,
    runGit,
    ...(makeWorktreeDir ? { makeTempDir: makeWorktreeDir } : {}),
  })
  try {
    // The reviewed head must contain the LIVE base commit — a diff against a
    // main that has already moved on is not reviewable. merge-base runs
    // inside the worktree, which shares the repo's object store.
    await assertHeadContainsBase({
      headSha: prInfo.headSha,
      baseSha: prInfo.baseSha,
      cwd: worktree.path,
      runGit,
    })

    // Refuse a checkout that carries any symlink BEFORE reading context or
    // starting a reviewer: a tracked symlink can point outside the checkout.
    assertNoSymlinksUnder(worktree.path)

    const excerpts = collectContextExcerpts({
      paths: contextPaths,
      readText: (path) =>
        containedReadText({ rootPath: worktree.path, path, readText: (p) => readFileSync(p, 'utf8') }),
    })
    const prompt = buildReviewPrompt({
      prInfo,
      impact,
      contextExcerpts: excerpts,
      panelNote: panel.note,
    })

    const reviews = []
    for (const entry of panel.reviewers) {
      const bin = assertReviewerBinAvailable(entry.reviewer)
      const parsed = await executeReviewer({
        reviewer: entry.reviewer,
        model: entry.model,
        command: bin.command,
        prompt,
        worktreePath: worktree.path,
        expectedHeadSha: prInfo.headSha,
        timeoutMs,
        buildInvocation: buildReviewerInvocation,
        parseOutput: PARSERS[entry.reviewer],
        spawnImpl,
        runGit,
        codexSessionsDir,
        clock: panelClock,
      })

      let verdict = null
      if (parsed.ok) {
        const extracted = extractVerdictBlock(parsed.text)
        verdict = extracted.ok
          ? validateVerdict({ verdict: extracted.verdict, pr: prInfo.pr, headSha: prInfo.headSha })
          : { ok: false, reason: extracted.reason }
      }

      reviews.push({
        reviewer: entry.reviewer,
        model: entry.model,
        command: bin.command,
        parse: parsed,
        verdict,
        startedAt: parsed.meta?.startedAt ?? null,
        completedAt: parsed.meta?.completedAt ?? null,
      })
    }

    const adjudication = adjudicatePanel(reviews)

    const receipt = buildReceipt({
      prInfo,
      impact,
      panel,
      reviews,
      decision: adjudication.decision,
      options: { verifyCommit },
      generatedAt: panelStartedAt,
    })
    // Saved BEFORE publishing so a crash still leaves a record — that record
    // is honestly unpublished (`published: null`). When publishing succeeds
    // the SAME receipt (same filename: pr + head + generatedAt) is written
    // again, now carrying the publication metadata, so the receipt on disk
    // never understates a status that really was published. Nothing here ever
    // reads a receipt back in: publishing is always from the in-memory run.
    let receiptPath = save({ receipt, repoRoot })

    let published = null
    if (publish) {
      published = await publishRunStatus({ run: ghRun, prInfo, reviews, receipt, comment })
      receipt.published = { ...published, at: panelClock().toISOString() }
      receiptPath = save({ receipt, repoRoot })
    }

    return {
      decision: adjudication.decision,
      ok: adjudication.ok,
      reasons: adjudication.reasons,
      reviews,
      receipt,
      receiptPath,
      published,
    }
  } finally {
    await removeReviewWorktree({ path: worktree.path, repoRoot, runGit })
  }
}
