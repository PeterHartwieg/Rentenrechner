import { describe, expect, it } from 'vitest'
import {
  classifyClaudeReview,
  classifyCodexReview,
  computeReviewLoopDecision,
  extractLinkedIssue,
  isRetryableCommandError,
} from './review-loop-decision.mjs'

const headSha = 'abc123'

function review(overrides = {}) {
  return {
    user: { login: 'claude[bot]' },
    state: 'COMMENTED',
    body: '[Claude Review]\n\nVerdict: Approve',
    commit_id: headSha,
    ...overrides,
  }
}

describe('review-loop-decision', () => {
  it('accepts canonical and heading-style Claude approval', () => {
    expect(classifyClaudeReview('[Claude Review]\n\nVerdict: Approve')).toBe('satisfied')
    expect(classifyClaudeReview('[Claude Review]\n\n**Approve.**')).toBe('satisfied')
  })

  it('treats Claude request changes as a fix signal', () => {
    expect(classifyClaudeReview('[Claude Review]\n\nVerdict: Request changes')).toBe('needs_fix')
  })

  it('treats routine Codex comments as satisfied but P0 comments as blocking', () => {
    expect(classifyCodexReview({ state: 'COMMENTED', body: 'nit: optional cleanup' })).toBe(
      'satisfied',
    )
    expect(classifyCodexReview({ state: 'COMMENTED', body: '[P1] must preserve disclaimer' })).toBe(
      'needs_fix',
    )
  })

  it('routes to merge when Claude and Codex are satisfied on head', () => {
    const result = computeReviewLoopDecision({
      headSha,
      commitCount: 1,
      reviews: [
        review(),
        review({
          user: { login: 'openai-codex[bot]' },
          state: 'APPROVED',
          body: 'No findings',
        }),
      ],
    })

    expect(result.decision).toBe('merge')
  })

  it('routes to fix when Codex leaves a P1 inline review comment', () => {
    const codexReviewId = 42
    const result = computeReviewLoopDecision({
      headSha,
      commitCount: 1,
      reviews: [
        review(),
        review({
          id: codexReviewId,
          user: { login: 'chatgpt-codex-connector[bot]' },
          state: 'COMMENTED',
          body: '### Codex Review\n\nHere are some automated review suggestions.',
        }),
      ],
      reviewComments: [
        {
          user: { login: 'chatgpt-codex-connector[bot]' },
          commit_id: headSha,
          pull_request_review_id: codexReviewId,
          body: '**P1** Clamp surrender-year age before deriving tax mode',
        },
      ],
    })

    expect(result.decision).toBe('fix')
    expect(result.codexStatus).toBe('needs_fix')
  })

  it('ignores stale Codex inline blockers superseded by a later clean Codex review', () => {
    const result = computeReviewLoopDecision({
      headSha,
      commitCount: 1,
      reviews: [
        review(),
        review({
          id: 1,
          user: { login: 'chatgpt-codex-connector[bot]' },
          state: 'COMMENTED',
          body: '### Codex Review\n\nHere are some automated review suggestions.',
        }),
        review({
          id: 2,
          user: { login: 'chatgpt-codex-connector[bot]' },
          state: 'COMMENTED',
          body: '### Codex Review\n\nNo findings.',
        }),
      ],
      reviewComments: [
        {
          user: { login: 'chatgpt-codex-connector[bot]' },
          commit_id: headSha,
          pull_request_review_id: 1,
          body: '**P1** Fail closed when the API secret is unset',
        },
        {
          user: { login: 'chatgpt-codex-connector[bot]' },
          commit_id: headSha,
          pull_request_review_id: 2,
          body: '**P2** Optional hardening',
        },
      ],
    })

    expect(result.decision).toBe('merge')
    expect(result.codexStatus).toBe('satisfied')
    expect(result.codexBlockingInlineCommentCount).toBe(0)
  })

  it('routes to wait while Codex is silent', () => {
    const result = computeReviewLoopDecision({
      headSha,
      commitCount: 1,
      reviews: [review()],
    })

    expect(result.decision).toBe('wait')
  })

  it('allows ten commits before the runaway threshold', () => {
    const result = computeReviewLoopDecision({
      headSha,
      commitCount: 10,
      reviews: [review()],
    })

    expect(result.decision).toBe('wait')
  })

  it('routes to cap above the runaway commit threshold', () => {
    const result = computeReviewLoopDecision({
      headSha,
      commitCount: 11,
      reviews: [review()],
    })

    expect(result.decision).toBe('cap')
  })

  it('extracts the linked issue closing marker', () => {
    expect(extractLinkedIssue('Summary\n\nCloses #203')).toBe('203')
  })

  it('classifies transient GitHub API failures as retryable', () => {
    expect(
      isRetryableCommandError({
        stderr:
          "HTTP 504: We couldn't respond to your request in time. Sorry about that. Please try resubmitting your request.",
      }),
    ).toBe(true)
  })

  it('does not retry deterministic command failures', () => {
    expect(isRetryableCommandError({ stderr: 'unknown flag: --json' })).toBe(false)
  })
})
