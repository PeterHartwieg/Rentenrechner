import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const main = readFileSync('.github/workflows/main-verify.yml', 'utf8').replace(/\r\n/g, '\n')
const sweep = readFileSync('.github/workflows/property-sweep.yml', 'utf8').replace(/\r\n/g, '\n')
const scripts = [...main.matchAll(/          script: \|\n((?:            .*\n|\n)+)/g)]
  .map((match) => match[1].replace(/^ {12}/gm, ''))
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

function mockGithub(issues = []) {
  const rest = {
    actions: { listJobsForWorkflowRun: vi.fn() },
    issues: Object.fromEntries(['listForRepo', 'createComment', 'getLabel', 'createLabel', 'create', 'update'].map((name) => [name, vi.fn()]))
  }
  return {
    rest,
    paginate: vi.fn(async (method) => method === rest.issues.listForRepo ? issues : [
      { name: 'Full verify', steps: [{ name: 'Run full verify', conclusion: 'failure' }, { name: 'Install deps', conclusion: 'success' }] }
    ])
  }
}

const context = { repo: { owner: 'PeterHartwieg', repo: 'Rentenrechner' }, sha: 'abc123', runId: 42, serverUrl: 'https://github.com' }
const run = (index, github) => new AsyncFunction('github', 'context', scripts[index])(github, context)

describe('main CI reporting', () => {
  it('opens an assigned ci-red issue with the SHA, run URL and failed step', async () => {
    expect(scripts).toHaveLength(2)
    const github = mockGithub()
    github.rest.issues.getLabel.mockRejectedValue({ status: 404 })
    await run(0, github)
    expect(github.rest.issues.createLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'ci-red' }))
    expect(github.rest.issues.create).toHaveBeenCalledWith(expect.objectContaining({
      title: '[ci-red] main full verify failed', assignees: ['PeterHartwieg'], labels: ['ci-red'],
      body: 'SHA: abc123\nRun: https://github.com/PeterHartwieg/Rentenrechner/actions/runs/42\nFailed steps: Run full verify'
    }))
  })

  it('deduplicates failures into the existing issue, excluding PRs', async () => {
    const github = mockGithub([{ number: 1, pull_request: {} }, { number: 2 }])
    await run(0, github)
    expect(github.rest.issues.create).not.toHaveBeenCalled()
    expect(github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 2 }))
  })

  it('comments and resolves all open alerts on a later green run', async () => {
    const github = mockGithub([{ number: 2 }, { number: 3 }, { number: 4, pull_request: {} }])
    await run(1, github)
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(2)
    expect(github.rest.issues.update).toHaveBeenCalledTimes(2)
    expect(github.rest.issues.update).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 2, state: 'closed', state_reason: 'completed' }))
  })

  it('does not turn API errors into missing-label assumptions', async () => {
    const github = mockGithub()
    github.rest.issues.getLabel.mockRejectedValue({ status: 500 })
    await expect(run(0, github)).rejects.toEqual({ status: 500 })
    expect(github.rest.issues.create).not.toHaveBeenCalled()
  })
})

describe('scheduled CI guards', () => {
  it('guards every heavy job through the gate output without status overrides', () => {
    for (const [workflow, jobs] of [[main, ['full']], [sweep, ['properties', 'mutation']]]) {
      for (const job of jobs) {
        const block = workflow.split(new RegExp(`^  ${job}:.*$`, 'm'))[1].split(/^  \S/m)[0]
        expect(block).toContain('needs: gate')
        expect(block).toContain("if: needs.gate.outputs.run == 'true'")
      }
    }
    expect(main).toContain('head_sha=$SHA&status=success')
    expect(main).not.toContain('--event schedule')
    expect(sweep).toContain('--event schedule --status success --limit 1 --json headSha')
  })
})
