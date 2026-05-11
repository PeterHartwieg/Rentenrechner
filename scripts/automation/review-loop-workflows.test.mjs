import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('review-loop workflow handoff', () => {
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
})
