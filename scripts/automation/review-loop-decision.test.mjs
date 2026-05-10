import { describe, expect, it } from 'vitest'
import {
  classifyClaudeReview,
  classifyCodexReview,
  computeReviewLoopDecision,
  extractLinkedIssue,
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

  it('routes to wait while Codex is silent', () => {
    const result = computeReviewLoopDecision({
      headSha,
      commitCount: 1,
      reviews: [review()],
    })

    expect(result.decision).toBe('wait')
  })

  it('routes to cap above the runaway commit threshold', () => {
    const result = computeReviewLoopDecision({
      headSha,
      commitCount: 4,
      reviews: [review()],
    })

    expect(result.decision).toBe('cap')
  })

  it('extracts the linked issue closing marker', () => {
    expect(extractLinkedIssue('Summary\n\nCloses #203')).toBe('203')
  })
})
