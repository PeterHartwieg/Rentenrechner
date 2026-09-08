import { describe, expect, it } from 'vitest'

import {
  buildReviewerInvocation,
  collectReportedModels,
  extractGrokResultText,
  modelMatches,
  parseClaudeReviewerOutput,
  parseCodexReviewerOutput,
  parseGrokReviewerOutput,
} from './lib/adapters.mjs'

describe('argument builders (pinned to CLI --help)', () => {
  it('claude: print mode, JSON output, exact model, read-only tools, no MCP servers', () => {
    const invocation = buildReviewerInvocation({ reviewer: 'claude', model: 'opus', promptFile: '/tmp/p.md' })
    expect(invocation.args).toEqual([
      '-p',
      '--output-format',
      'json',
      '--model',
      'opus',
      '--tools',
      'Read,Grep,Glob',
      '--strict-mcp-config',
      '--mcp-config',
      '{"mcpServers":{}}',
    ])
    expect(invocation.inputMode).toBe('stdin')
  })

  it('claude: complex panel uses the exact fable model id', () => {
    const invocation = buildReviewerInvocation({ reviewer: 'claude', model: 'claude-fable-5-1', promptFile: '/tmp/p.md' })
    expect(invocation.args[invocation.args.indexOf('--model') + 1]).toBe('claude-fable-5-1')
  })

  it('grok: prompt file (never argv), JSON output, turn cap, no web tools', () => {
    const invocation = buildReviewerInvocation({ reviewer: 'grok', model: 'grok-4.6', promptFile: '/tmp/p.md' })
    expect(invocation.args).toEqual([
      '--prompt-file',
      '/tmp/p.md',
      '--output-format',
      'json',
      '-m',
      'grok-4.6',
      '--max-turns',
      '60',
      '--disable-web-search',
    ])
    expect(invocation.inputMode).toBe('prompt-file')
  })

  it('codex: exec, read-only sandbox, JSONL events, last-message file, prompt from stdin', () => {
    const invocation = buildReviewerInvocation({
      reviewer: 'codex',
      model: 'gpt-6-astra',
      promptFile: '/tmp/p.md',
      outputLastMessageFile: '/tmp/last.txt',
    })
    expect(invocation.args).toEqual([
      'exec',
      '--json',
      '-s',
      'read-only',
      '-m',
      'gpt-6-astra',
      '--output-last-message',
      '/tmp/last.txt',
      '-',
    ])
    expect(invocation.inputMode).toBe('stdin')
  })

  it('rejects unknown reviewer kinds instead of guessing an argv', () => {
    expect(() => buildReviewerInvocation({ reviewer: 'gpt', model: 'x' })).toThrow(/unknown reviewer kind/)
  })
})

describe('model identity matching', () => {
  it('matches aliases and bracketed context suffixes', () => {
    expect(modelMatches('claude-opus-4-6-20260101', 'opus')).toBe(true)
    expect(modelMatches('claude-fable-5-1[1m]', 'claude-fable-5-1')).toBe(true)
    expect(modelMatches('grok-4.6', 'grok-4.6')).toBe(true)
    expect(modelMatches('gpt-6-astra', 'gpt-6-astra')).toBe(true)
  })

  it('never matches a different model', () => {
    expect(modelMatches('claude-sonnet-5', 'opus')).toBe(false)
    expect(modelMatches('grok-3', 'grok-4.6')).toBe(false)
    expect(modelMatches('', 'opus')).toBe(false)
  })

  it('collects every provider-reported model from nested metadata', () => {
    const models = collectReportedModels({
      modelUsage: { 'claude-opus-4-6': { model: 'claude-opus-4-6', tokens: 5 } },
      nested: [{ model: 'claude-opus-4-6' }],
    })
    expect(models).toContain('claude-opus-4-6')
  })
})

describe('claude parser', () => {
  const success = (overrides = {}) =>
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, model: 'claude-opus-4-6', result: 'text', ...overrides })

  it('accepts a completed, model-matching result', () => {
    const parsed = parseClaudeReviewerOutput({ stdout: success(), exitCode: 0, requestedModel: 'opus' })
    expect(parsed.ok).toBe(true)
    expect(parsed.text).toBe('text')
  })

  it('fails closed on turn limit / error subtypes', () => {
    const parsed = parseClaudeReviewerOutput({
      stdout: success({ subtype: 'error_max_turns', is_error: true }),
      exitCode: 0,
      requestedModel: 'opus',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/error_max_turns/)
  })

  it('fails closed on malformed JSON (possible truncation)', () => {
    const parsed = parseClaudeReviewerOutput({ stdout: '{"type":"result",', exitCode: 0, requestedModel: 'opus' })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/not valid JSON/)
  })

  it('fails closed on a truncated JSON envelope that happens to parse', () => {
    const parsed = parseClaudeReviewerOutput({
      stdout: success({ result: undefined, subtype: 'error_during_execution' }),
      exitCode: 0,
      requestedModel: 'opus',
    })
    expect(parsed.ok).toBe(false)
  })

  it('fails closed on model mismatch', () => {
    const parsed = parseClaudeReviewerOutput({
      stdout: success({ model: 'claude-sonnet-5' }),
      exitCode: 0,
      requestedModel: 'opus',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/model identity mismatch/)
  })

  it('fails closed on non-zero exit', () => {
    const parsed = parseClaudeReviewerOutput({ stdout: success(), exitCode: 1, requestedModel: 'opus' })
    expect(parsed.ok).toBe(false)
  })
})

describe('grok parser', () => {
  const grokJson = (overrides = {}) =>
    JSON.stringify({ model: 'grok-4.6', response: 'verdict text', thought: 'draft', usage: { turns: 2 }, ...overrides })

  it('reads the verdict from result fields only', () => {
    expect(extractGrokResultText(JSON.parse(grokJson()))).toBe('verdict text')
    expect(extractGrokResultText(JSON.parse(grokJson({ response: undefined, result: 'fallback' })))).toBe('fallback')
    expect(
      extractGrokResultText(JSON.parse(grokJson({ response: undefined, messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a' },
      ] }))),
    ).toBe('a')
  })

  it('NEVER uses thought/draft text as the verdict', () => {
    const onlyInThought = JSON.stringify({ model: 'grok-4.6', thought: '{"verdict":"approve"}' })
    const parsed = parseGrokReviewerOutput({ stdout: onlyInThought, exitCode: 0, requestedModel: 'grok-4.6' })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/thought\/draft text is never used/)
  })

  it('accepts a completed run while ignoring the thought field', () => {
    const parsed = parseGrokReviewerOutput({ stdout: grokJson(), exitCode: 0, requestedModel: 'grok-4.6' })
    expect(parsed.ok).toBe(true)
    expect(parsed.text).toBe('verdict text')
  })

  it('fails closed when metadata reports a turn limit', () => {
    const parsed = parseGrokReviewerOutput({
      stdout: grokJson({ max_turns_reached: true }),
      exitCode: 0,
      requestedModel: 'grok-4.6',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/incomplete run/)
  })

  it('fails closed on explicit provider errors', () => {
    const parsed = parseGrokReviewerOutput({
      stdout: grokJson({ error: 'rate limited' }),
      exitCode: 0,
      requestedModel: 'grok-4.6',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/rate limited/)
  })

  it('fails closed on truncated JSON', () => {
    const parsed = parseGrokReviewerOutput({ stdout: '{"model":"grok-4.6","response":"cut', exitCode: 0, requestedModel: 'grok-4.6' })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/not valid JSON/)
  })

  it('fails closed on model mismatch', () => {
    const parsed = parseGrokReviewerOutput({ stdout: grokJson({ model: 'grok-3' }), exitCode: 0, requestedModel: 'grok-4.6' })
    expect(parsed.ok).toBe(false)
  })
})

describe('codex parser', () => {
  const events = (model = 'gpt-6-astra') =>
    [`${JSON.stringify({ type: 'session_configured', model })}`, `${JSON.stringify({ type: 'task_complete' })}`].join('\n')

  it('accepts events + non-empty final message', () => {
    const parsed = parseCodexReviewerOutput({
      stdout: events(),
      lastMessage: 'final verdict text',
      stderr: '',
      exitCode: 0,
      requestedModel: 'gpt-6-astra',
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.text).toBe('final verdict text')
  })

  it('fails closed when the event stream is empty (run cannot be proven)', () => {
    const parsed = parseCodexReviewerOutput({
      stdout: '',
      lastMessage: 'final verdict text',
      stderr: '',
      exitCode: 0,
      requestedModel: 'gpt-6-astra',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/event stream is empty/)
  })

  it('fails closed when no provider model identity is present', () => {
    const parsed = parseCodexReviewerOutput({
      stdout: JSON.stringify({ type: 'task_complete' }),
      lastMessage: 'text',
      stderr: '',
      exitCode: 0,
      requestedModel: 'gpt-6-astra',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/no provider model identity/)
  })

  it('fails closed on empty final message (possible truncation)', () => {
    const parsed = parseCodexReviewerOutput({
      stdout: events(),
      lastMessage: '',
      stderr: '',
      exitCode: 0,
      requestedModel: 'gpt-6-astra',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/empty or missing/)
  })

  it('fails closed on provider failure markers in stderr', () => {
    const parsed = parseCodexReviewerOutput({
      stdout: events(),
      lastMessage: 'text',
      stderr: 'stream disconnected before completion',
      exitCode: 0,
      requestedModel: 'gpt-6-astra',
    })
    expect(parsed.ok).toBe(false)
  })

  it('fails closed on a non-JSON event line', () => {
    const parsed = parseCodexReviewerOutput({
      stdout: `${events()}\nnot json`,
      lastMessage: 'text',
      stderr: '',
      exitCode: 0,
      requestedModel: 'gpt-6-astra',
    })
    expect(parsed.ok).toBe(false)
  })
})
