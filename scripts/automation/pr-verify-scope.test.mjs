import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const prVerify = readFileSync('.github/workflows/pr-verify.yml', 'utf8')
const claudeReview = readFileSync('.github/workflows/claude-review.yml', 'utf8')

/** Slice one top-level job block (two-space-indented key) out of a workflow. */
function jobBlock(workflow, jobKey) {
  const lines = workflow.split('\n')
  const start = lines.findIndex((line) => line === `  ${jobKey}:`)
  if (start === -1) throw new Error(`job "${jobKey}" not found`)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  \S/.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/** Slice the top-level `on:` trigger block out of a workflow. */
function triggerBlock(workflow) {
  return topLevelBlock(workflow, 'on')
}

/** Slice a top-level block (column-0 key) out of a workflow. */
function topLevelBlock(workflow, key) {
  const lines = workflow.split('\n')
  const start = lines.findIndex((line) => line === `${key}:`)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/**
 * Decide whether a pull_request from `branch` passes the job's `if:` gate.
 * Supports only this repo's shape — an OR of startsWith('prefix') predicates,
 * optionally wrapped in ${{ }}. Throws on compound conditions so a newly
 * added `&&`/`!` fails loudly instead of being mis-evaluated to true.
 */
function jobRunsForBranch(workflow, jobKey, branch) {
  const block = jobBlock(workflow, jobKey)
  const condition = block.split('\n').find((line) => line.trim().startsWith('if:'))
  if (condition === undefined) return true // no gate: every branch runs
  const expr = condition.trim().replace(/^if:\s*/, '').replace(/\$\{\{|\}\}/g, '')
  if (expr.includes('&&') || expr.includes('!')) {
    throw new Error(`unsupported compound condition: ${expr.trim()}`)
  }
  const prefixes = [...expr.matchAll(/startsWith\([^,]+,\s*'([^']+)'\)/g)].map((m) => m[1])
  if (prefixes.length === 0) {
    throw new Error(`no startsWith predicates found in: ${expr.trim()}`)
  }
  return prefixes.some((prefix) => branch.startsWith(prefix))
}

/** Workflow text with comment lines stripped, so prose can't trip code guards. */
function withoutComments(workflow) {
  return workflow
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
}

describe('pr-verify runs for every pull request (issue #375)', () => {
  it('runs the verify job for arbitrary branches, agent and non-agent alike', () => {
    for (const branch of [
      'codex/universal-verification',
      'feat/export-projection-layer',
      'renovate/vite-8.x',
      'docs/typo-fix',
      'agent/issue-12',
      'automation/retro-curate-2026-09-08',
    ]) {
      expect(jobRunsForBranch(prVerify, 'verify', branch)).toBe(true)
    }
  })

  it('keeps the branch evaluator honest by re-detecting claude-review scoping', () => {
    // Guard the guard: the evaluator must distinguish gated from ungated
    // jobs, not just answer true unconditionally.
    expect(jobRunsForBranch(claudeReview, 'review', 'agent/issue-12')).toBe(true)
    expect(jobRunsForBranch(claudeReview, 'review', 'automation/retro-curate-2026-09-08')).toBe(true)
    expect(jobRunsForBranch(claudeReview, 'review', 'codex/universal-verification')).toBe(false)
  })

  it('triggers on pull_request for all branches and paths, so fork PRs run too', () => {
    const trigger = triggerBlock(prVerify)

    expect(trigger).toContain('pull_request:')
    expect(trigger).toContain('types: [opened, synchronize, reopened]')
    // No `branches:` filter (which would gate on the BASE branch) and no
    // `paths:` filter — a fork PR to any base branch must still verify.
    expect(trigger).not.toMatch(/^\s+(branches|branches-ignore|paths|paths-ignore):/m)
  })

  it('stays safe for untrusted fork code: pull_request event, read-only token, no secrets', () => {
    const executable = withoutComments(prVerify)
    const permissions = topLevelBlock(prVerify, 'permissions')

    expect(executable).not.toContain('pull_request_target')
    expect(executable).not.toContain('secrets.')
    expect(permissions).toContain('contents: read')
    expect(permissions).not.toContain(': write')
  })

  it('still checks out the exact PR head SHA it verifies', () => {
    const job = jobBlock(prVerify, 'verify')

    expect(job).toContain('ref: ${{ github.event.pull_request.head.sha || inputs.head_sha }}')
  })

  it('still supports manual re-verification of a specific head SHA', () => {
    const trigger = triggerBlock(prVerify)

    expect(trigger).toContain('workflow_dispatch:')
    expect(trigger).toContain('pr_number:')
    expect(trigger).toContain('head_sha:')
    expect(trigger).toContain('head_ref:')
  })
})
