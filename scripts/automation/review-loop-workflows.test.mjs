import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('review-loop workflow handoff', () => {
  it('runs verify and Claude review for agent and retro-curation PR branches', () => {
    const claudeReview = readFileSync('.github/workflows/claude-review.yml', 'utf8')
    const prVerify = readFileSync('.github/workflows/pr-verify.yml', 'utf8')

    for (const workflow of [claudeReview, prVerify]) {
      expect(workflow).toContain("startsWith(github.event.pull_request.head.ref || inputs.head_ref, 'agent/issue-')")
      expect(workflow).toContain(
        "startsWith(github.event.pull_request.head.ref || inputs.head_ref, 'automation/retro-curate-')",
      )
    }
  })

  it('runs the review loop and sweep for agent and retro-curation PR branches', () => {
    const reviewLoop = readFileSync('.github/workflows/review-loop.yml', 'utf8')
    const sweep = readFileSync('.github/workflows/review-loop-sweep.yml', 'utf8')

    expect(reviewLoop).toContain("startsWith(github.event.pull_request.head.ref, 'agent/issue-')")
    expect(reviewLoop).toContain("startsWith(github.event.pull_request.head.ref, 'automation/retro-curate-')")
    expect(sweep).toContain('startswith("agent/issue-") or startswith("automation/retro-curate-")')
  })

  it('can manually re-run Claude review for a post-fix head SHA', () => {
    const workflow = readFileSync('.github/workflows/claude-review.yml', 'utf8')

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('pr_number:')
    expect(workflow).toContain('head_sha:')
    expect(workflow).toContain('head_ref:')
    expect(workflow).toContain('ref: ${{ github.event.pull_request.head.sha || inputs.head_sha }}')
  })

  it('fails Claude review runs that do not post a parseable review artifact', () => {
    const workflow = readFileSync('.github/workflows/claude-review.yml', 'utf8')

    expect(workflow).toContain('name: Assert Claude review was posted')
    expect(workflow).toContain('select(.commit_id == "\'"$PR_HEAD_SHA"\'")')
    expect(workflow).toContain('startswith("[Claude Review]")')
    expect(workflow).toContain('review_count')
  })

  it('can manually re-run PR verify for a post-fix head SHA', () => {
    const workflow = readFileSync('.github/workflows/pr-verify.yml', 'utf8')

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('pr_number:')
    expect(workflow).toContain('head_sha:')
    expect(workflow).toContain('head_ref:')
    expect(workflow).toContain('ref: ${{ github.event.pull_request.head.sha || inputs.head_sha }}')
  })

  it('dispatches fresh verify and Claude review after the review-fix agent pushes', () => {
    const workflow = readFileSync('.github/workflows/review-loop.yml', 'utf8')

    expect(workflow).toContain('name: Dispatch post-fix checks')
    expect(workflow).toContain('gh workflow run pr-verify.yml')
    expect(workflow).toContain('gh workflow run claude-review.yml')
    expect(workflow).toContain('head_sha="$new_head_sha"')
  })

  it('dispatches a conflict repair workflow when sweep finds a dirty PR', () => {
    const sweep = readFileSync('.github/workflows/review-loop-sweep.yml', 'utf8')
    const reviewLoop = readFileSync('.github/workflows/review-loop.yml', 'utf8')
    const conflictWorkflow = readFileSync('.github/workflows/resolve-merge-conflict.yml', 'utf8')

    expect(sweep).toContain('if [ "$mergeable_state" = "DIRTY" ]; then')
    expect(sweep).toContain('gh workflow run resolve-merge-conflict.yml')
    expect(sweep).toContain('actions: write')
    expect(reviewLoop).toContain('if [ "$mergeable_state" = "DIRTY" ]; then')
    expect(reviewLoop).toContain('gh workflow run resolve-merge-conflict.yml')
    expect(conflictWorkflow).toContain('workflow_dispatch:')
    expect(conflictWorkflow).toContain('git merge --no-ff --no-commit origin/main')
    expect(conflictWorkflow).toContain('Resolves merge conflict on PR #$PR_NUMBER')
    expect(conflictWorkflow).toContain('gh workflow run pr-verify.yml')
    expect(conflictWorkflow).toContain('gh workflow run claude-review.yml')
  })
})
