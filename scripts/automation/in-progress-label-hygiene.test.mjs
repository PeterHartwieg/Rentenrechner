import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflowPath = '.github/workflows/clear-in-progress-on-close.yml'

describe('in-progress-by-agent label hygiene', () => {
  it('clears in-progress-by-agent when an issue is closed', () => {
    expect(existsSync(workflowPath)).toBe(true)

    const workflow = readFileSync(workflowPath, 'utf8')

    expect(workflow).toMatch(/issues:\s*\n\s*types:\s*\[\s*closed\s*\]/)
    expect(workflow).toContain('issues: write')
    expect(workflow).toMatch(/gh issue edit .*--remove-label in-progress-by-agent/s)
  })
})
