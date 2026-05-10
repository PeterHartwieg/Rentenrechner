import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DEFAULT_MAX_COMMITS = 3

export function classifyClaudeReview(body = '') {
  if (!body.startsWith('[Claude Review]')) return 'wait'
  if (/Verdict:\s*Request changes/i.test(body) || /^\*+\s*Request changes\b/im.test(body)) {
    return 'needs_fix'
  }
  if (/Verdict:\s*Approve/i.test(body) || /^\*+\s*(Verdict:\s*)?Approve\b/im.test(body)) {
    return 'satisfied'
  }
  return 'wait'
}

export function classifyCodexReview(review) {
  const state = String(review?.state ?? '').toUpperCase()
  const body = String(review?.body ?? '')
  if (state === 'APPROVED') return 'satisfied'
  if (state === 'CHANGES_REQUESTED') return 'needs_fix'
  if (state === 'COMMENTED') {
    return /\bP[01]\b|\bmust\b|\bblocking\b|\brequest changes\b/i.test(body)
      ? 'needs_fix'
      : 'satisfied'
  }
  return 'wait'
}

export function isClaudeReview(review) {
  return String(review?.body ?? '').startsWith('[Claude Review]')
}

export function isCodexReview(review) {
  const login = String(review?.user?.login ?? '')
  return /codex|openai|chatgpt/i.test(login) && !isClaudeReview(review)
}

export function latestReview(reviews, predicate) {
  return reviews.filter(predicate).at(-1) ?? null
}

export function extractLinkedIssue(body = '') {
  const match = /\b(?:closes|fixes|resolves)\s+#(\d+)/i.exec(body)
  return match?.[1] ?? ''
}

export function computeReviewLoopDecision({
  reviews,
  headSha,
  commitCount,
  maxCommits = DEFAULT_MAX_COMMITS,
}) {
  const headReviews = reviews.filter((review) => review.commit_id === headSha)
  const humanBlocking = headReviews.filter((review) => {
    const login = String(review?.user?.login ?? '')
    return !login.endsWith('[bot]') && String(review?.state ?? '').toUpperCase() === 'CHANGES_REQUESTED'
  })
  const claude = latestReview(headReviews, isClaudeReview)
  const codex = latestReview(headReviews, isCodexReview)
  const claudeStatus = claude ? classifyClaudeReview(claude.body) : 'wait'
  const codexStatus = codex ? classifyCodexReview(codex) : 'wait'

  if (commitCount > maxCommits) {
    return {
      decision: 'cap',
      reason: `branch has ${commitCount} commits beyond main`,
      claudeStatus,
      codexStatus,
      humanBlockingCount: humanBlocking.length,
    }
  }

  if (humanBlocking.length > 0 || claudeStatus === 'needs_fix' || codexStatus === 'needs_fix') {
    return {
      decision: 'fix',
      reason: 'blocking review feedback exists on the head commit',
      claudeStatus,
      codexStatus,
      humanBlockingCount: humanBlocking.length,
    }
  }

  if (claudeStatus === 'satisfied' && codexStatus === 'satisfied') {
    return {
      decision: 'merge',
      reason: 'both automated reviewers are satisfied on the head commit',
      claudeStatus,
      codexStatus,
      humanBlockingCount: humanBlocking.length,
    }
  }

  return {
    decision: 'wait',
    reason: 'waiting for a clear reviewer signal on the head commit',
    claudeStatus,
    codexStatus,
    humanBlockingCount: humanBlocking.length,
  }
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
}

function writeOutputs(values) {
  const target = process.env.GITHUB_OUTPUT
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, ' ')}`)
  if (target) appendFileSync(target, `${lines.join('\n')}\n`)
  for (const line of lines) console.log(line)
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY
  const prNumber = process.env.PR_NUMBER
  const headSha = process.env.PR_HEAD_SHA
  const maxCommits = Number(process.env.MAX_REVIEW_LOOP_COMMITS ?? DEFAULT_MAX_COMMITS)

  if (!repo || !prNumber || !headSha) {
    throw new Error('GITHUB_REPOSITORY, PR_NUMBER, and PR_HEAD_SHA are required')
  }

  const commitCount = Number(run('git', ['rev-list', '--count', 'origin/main..HEAD']).trim())
  const reviews = JSON.parse(run('gh', ['api', `repos/${repo}/pulls/${prNumber}/reviews`]))
  const body = run('gh', ['pr', 'view', prNumber, '--repo', repo, '--json', 'body', '--jq', '.body'])
  const result = computeReviewLoopDecision({ reviews, headSha, commitCount, maxCommits })

  writeOutputs({
    decision: result.decision,
    reason: result.reason,
    claude_status: result.claudeStatus,
    codex_status: result.codexStatus,
    human_blocking_count: result.humanBlockingCount,
    commit_count: commitCount,
    issue_number: extractLinkedIssue(body),
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
