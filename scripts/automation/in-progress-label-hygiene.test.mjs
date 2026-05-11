import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('in-progress-by-agent label hygiene', () => {
  it('clears in-progress-by-agent when an issue is closed', () => {
    const workflow = readFileSync('.github/workflows/clear-in-progress-on-close.yml', 'utf8')

    expect(workflow).toContain('issues:')
    expect(workflow).toContain('types: [closed]')
    expect(workflow).toContain('issues: write')
    expect(workflow).toContain('--remove-label in-progress-by-agent')
  })

  it('allows implementer workflow pushes that add or update workflow files', () => {
    const workflow = readFileSync('.github/workflows/implement.yml', 'utf8')

    expect(workflow).toMatch(/\r?\npermissions:\r?\n(?:  .+\r?\n)*  workflows: write\r?\n/)
  })
})
