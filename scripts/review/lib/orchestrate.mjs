// Review pipeline orchestration used by review-run.mjs.
//
// All external effects are injectable (gh runner, spawn, git, clock, file
// reads) so tests drive the full pipeline with fakes and never touch the
// network or a real model CLI.
//
// Execution shape: capture PR head+base atomically → map impact → create a
// clean detached worktree at the exact head SHA → read mapped context FROM
// THAT SHA → run the panel inside the worktree → validate verdicts →
// adjudicate → save a local receipt → optionally publish (in-memory only).

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
  createReviewWorktree,
  executeReviewer,
  removeReviewWorktree,
} from './runner.mjs'
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
  now = new Date(),
  save = saveReceipt,
  makeWorktreeDir,
}) {
  const { prInfo, impact, panel, contextPaths } = await planReview({ pr, complex, repoRoot, ghRun })

  // Reviewers work in a clean detached worktree pinned to the exact head SHA.
  const worktree = await createReviewWorktree({
    repoRoot,
    headSha: prInfo.headSha,
    runGit,
    ...(makeWorktreeDir ? { makeTempDir: makeWorktreeDir } : {}),
  })
  try {
    const excerpts = collectContextExcerpts({
      paths: contextPaths,
      readText: (path) => readFileSync(join(worktree.path, path), 'utf8'),
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
        startedAt: now,
        now,
      })

      let verdict = null
      if (parsed.ok) {
        const extracted = extractVerdictBlock(parsed.text)
        verdict = extracted.ok
          ? validateVerdict({ verdict: extracted.verdict, pr: prInfo.pr, headSha: prInfo.headSha })
          : { ok: false, reason: extracted.reason }
      }

      reviews.push({ reviewer: entry.reviewer, model: entry.model, command: bin.command, parse: parsed, verdict })
    }

    const adjudication = adjudicatePanel(reviews)

    const receipt = buildReceipt({
      prInfo,
      impact,
      panel,
      reviews,
      decision: adjudication.decision,
      options: { verifyCommit },
      generatedAt: now,
    })
    const receiptPath = save({ receipt, repoRoot })

    let published = null
    if (publish) {
      published = await publishRunStatus({ run: ghRun, prInfo, reviews, receipt, comment })
      receipt.published = { ...published, at: now.toISOString() }
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
