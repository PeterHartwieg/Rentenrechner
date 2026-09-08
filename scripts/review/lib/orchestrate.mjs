// Review pipeline orchestration used by review-run.mjs.
//
// All external effects are injectable (gh runner, spawn, git status, clock,
// file reads) so tests drive the full pipeline with fakes and never touch
// the network or a real model CLI.

import { existsSync, readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

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
import { executeReviewer } from './runner.mjs'
import { adjudicatePanel, extractVerdictBlock, validateVerdict } from './verdicts.mjs'
import { buildReceipt, saveReceipt } from './receipts.mjs'

export const DEFAULT_REVIEWER_TIMEOUT_MS = 30 * 60 * 1000

const PARSERS = {
  claude: parseClaudeReviewerOutput,
  grok: parseGrokReviewerOutput,
  codex: parseCodexReviewerOutput,
}

function defaultGhRun(command, args) {
  return promisify(execFile)(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function defaultRunGitStatus() {
  return promisify(execFile)('git', ['status', '--porcelain'], { encoding: 'utf8' })
}

function repoPath(repoRoot, path) {
  return join(repoRoot, path)
}

// Builds the full review plan WITHOUT running any reviewer. Shared by
// review-plan.mjs (display) and executeReview (execution).
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
  repoRoot = process.cwd(),
  verifyCommit = null,
  timeoutMs = DEFAULT_REVIEWER_TIMEOUT_MS,
  ghRun = defaultGhRun,
  spawnImpl,
  runGitStatus = defaultRunGitStatus,
  readText,
  now = new Date(),
  save = saveReceipt,
}) {
  const { prInfo, impact, panel, contextPaths } = await planReview({ pr, complex, repoRoot, ghRun })

  const excerpts = collectContextExcerpts({
    paths: contextPaths,
    readText: readText ?? ((path) => readFileSync(repoPath(repoRoot, path), 'utf8')),
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
      repoRoot,
      timeoutMs,
      buildInvocation: buildReviewerInvocation,
      parseOutput: PARSERS[entry.reviewer],
      spawnImpl,
      runGitStatus,
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

  return {
    decision: adjudication.decision,
    ok: adjudication.ok,
    reasons: adjudication.reasons,
    reviews,
    receipt,
    receiptPath,
  }
}
