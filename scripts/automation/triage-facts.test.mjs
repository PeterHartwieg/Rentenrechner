import { describe, expect, it } from 'vitest'
import {
  buildTriageFacts,
  classifyIssueSource,
  extractQaFacts,
  parseMarkdownTableValue,
} from './triage-facts.mjs'

const qaBody = `
| Field | Value |
| --- | --- |
| Target id | \`inputs.bav.label\` |
| Precision | exact |
| Route | / |
| Viewport | 1440x900 |
| Browser | Chrome |
| App build | dev |
| Timestamp | 2026-05-10T12:00:00Z |

## Tester comment

Bitte Label korrigieren.

## Privacy flags

- Screenshot included: **yes**
`

describe('triage-facts', () => {
  it('parses QA header table values', () => {
    expect(parseMarkdownTableValue(qaBody, 'Target id')).toBe('inputs.bav.label')
  })

  it('extracts QA facts from title and body', () => {
    const facts = extractQaFacts({ title: '[Minor] qa(copy): inputs.bav.label', body: qaBody })

    expect(facts.titleSeverity).toBe('Minor')
    expect(facts.titleType).toBe('copy')
    expect(facts.targetId).toBe('inputs.bav.label')
    expect(facts.testerComment).toContain('Label')
  })

  it('classifies maintainer QA issues by label', () => {
    const source = classifyIssueSource({
      title: '[Minor] qa(copy): inputs.bav.label',
      body: qaBody,
      labelNames: ['from-maintainer'],
    })

    expect(source).toBe('QA-maintainer')
  })

  it('computes auto-promote and single-stage shape from structured QA facts', () => {
    const facts = buildTriageFacts({
      number: 1,
      title: '[Minor] qa(copy): inputs.bav.label',
      body: qaBody,
      labels: [],
      comments: [],
      author: { login: 'tester' },
    })

    expect(facts.source).toBe('QA-anonymous')
    expect(facts.suggestions.qaAutoPromoteShape).toBe(true)
    expect(facts.suggestions.singleStageShape).toBe(true)
  })
})
