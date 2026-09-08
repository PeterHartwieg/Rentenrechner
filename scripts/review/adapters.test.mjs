import { describe, expect, it } from 'vitest'

import {
  buildReviewerInvocation,
  collectModelUsageKeys,
  identityAccepts,
  parseClaudeReviewerOutput,
  parseCodexReviewerOutput,
  parseGrokReviewerOutput,
} from './lib/adapters.mjs'

// Synthetic copies of the sanitized live envelopes (see
// /tmp/rentenwiki-assurance-orchestration/ci-{grok,opus}-adapter-envelope.json):
// the identity lives in the `modelUsage` OBJECT KEYS.
const CLAUDE_ENVELOPE = (modelKey, resultText = 'verdict text') =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 12,
    modelUsage: { [modelKey]: { input_tokens: 10, output_tokens: 5 } },
    result: resultText,
  })

const GROK_ENVELOPE = (modelKey, text = 'verdict text', extra = {}) =>
  JSON.stringify({
    stopReason: 'end_turn',
    num_turns: 8,
    modelUsage: { [modelKey]: {} },
    text,
    ...extra,
  })

describe('argument builders (pinned to CLI --help + verified working invocations)', () => {
  it('claude: print mode, JSON output, turn cap, safe-mode + restricted, read-only tools, dontAsk, no MCP servers', () => {
    const invocation = buildReviewerInvocation({ reviewer: 'claude', model: 'opus', promptFile: '/tmp/p.md' })
    expect(invocation.args).toEqual([
      '-p',
      '--output-format',
      'json',
      '--model',
      'opus',
      '--max-turns',
      '35',
      '--safe-mode',
      '--restricted',
      '--tools',
      'Read,Grep,Glob',
      '--permission-mode',
      'dontAsk',
      '--allowedTools',
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

  it('grok: prompt file, JSON output, turn cap, explicit read-only tool allowlist + MCP deny', () => {
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
      '--no-subagents',
      '--no-memory',
      '--tools',
      'read_file,grep,list_dir',
      '--deny',
      'MCPTool',
      '--permission-mode',
      'dontAsk',
      '--allow',
      'Read',
      '--allow',
      'Grep',
    ])
    expect(invocation.inputMode).toBe('prompt-file')
  })

  it('codex: exec, read-only sandbox, plugins/apps/hooks disabled, no user config or rules, MCP overrides, stdin prompt', () => {
    const invocation = buildReviewerInvocation({
      reviewer: 'codex',
      model: 'gpt-6-astra',
      promptFile: '/tmp/p.md',
      outputLastMessageFile: '/tmp/last.txt',
      codexMcpArgs: ['-c', 'mcp_servers.node_repl.enabled=false'],
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
      '--disable',
      'plugins',
      '--disable',
      'apps',
      '--disable',
      'hooks',
      '--ignore-user-config',
      '--ignore-rules',
      '-c',
      'mcp_servers.node_repl.enabled=false',
      '-',
    ])
    expect(invocation.inputMode).toBe('stdin')
  })

  it('rejects unknown reviewer kinds instead of guessing an argv', () => {
    expect(() => buildReviewerInvocation({ reviewer: 'gpt', model: 'x' })).toThrow(/unknown reviewer kind/)
  })
})

describe('model identity (strict map over modelUsage keys — no substring fallback)', () => {
  it('accepts the verified provider-reported ids', () => {
    expect(identityAccepts('opus', 'claude-opus-5')).toBe(true)
    expect(identityAccepts('opus', 'claude-opus-5[1m]')).toBe(true) // context suffix normalized away
    expect(identityAccepts('claude-fable-5-1', 'claude-fable-5-1')).toBe(true)
    expect(identityAccepts('grok-4.6', 'grok-4.6-build')).toBe(true) // observed live key
    expect(identityAccepts('grok-4.6', 'grok-4.6')).toBe(true)
    expect(identityAccepts('gpt-6-astra', 'gpt-6-astra')).toBe(true)
  })

  it('never lets another model satisfy a slot — not even a sibling Claude family', () => {
    expect(identityAccepts('opus', 'claude-fable-5-1')).toBe(false)
    expect(identityAccepts('opus', 'claude-sonnet-5')).toBe(false)
    expect(identityAccepts('opus', 'claude-opus')).toBe(false) // family prefix requires a version
    expect(identityAccepts('claude-fable-5-1', 'claude-opus-5')).toBe(false)
    expect(identityAccepts('grok-4.6', 'grok-3')).toBe(false)
    expect(identityAccepts('grok-4.6', 'grok-4.6-something-else')).toBe(false)
    expect(identityAccepts('gpt-6-astra', 'gpt-5.6-sol')).toBe(false)
    expect(identityAccepts('', 'claude-opus-5')).toBe(false)
    expect(identityAccepts('opus', '')).toBe(false)
  })

  it('collects model identity from modelUsage object keys only', () => {
    expect(collectModelUsageKeys({ modelUsage: { 'claude-opus-5': {} } })).toEqual(['claude-opus-5'])
    expect(collectModelUsageKeys({ modelUsage: { 'grok-4.6-build': {}, 'other-model': {} } })).toEqual([
      'grok-4.6-build',
      'other-model',
    ])
    expect(collectModelUsageKeys({ modelUsage: null })).toEqual([])
    expect(collectModelUsageKeys({ modelUsage: {} })).toEqual([])
    expect(collectModelUsageKeys({})).toEqual([])
    // a "model" string somewhere else in the envelope is NOT identity evidence
    expect(collectModelUsageKeys({ model: 'claude-opus-5', result: 'x' })).toEqual([])
  })
})

describe('claude parser (verified envelope shape)', () => {
  it('accepts the live envelope: result/success/is_error=false + modelUsage key matching opus', () => {
    const parsed = parseClaudeReviewerOutput({
      stdout: CLAUDE_ENVELOPE('claude-opus-5'),
      exitCode: 0,
      requestedModel: 'opus',
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.text).toBe('verdict text')
    expect(parsed.reportedModels).toEqual(['claude-opus-5'])
    expect(parsed.meta.identityEvidence).toBe('native-model-usage-keys')
  })

  it('accepts a bracketed context suffix on the reported key', () => {
    const parsed = parseClaudeReviewerOutput({
      stdout: CLAUDE_ENVELOPE('claude-opus-5[1m]'),
      exitCode: 0,
      requestedModel: 'opus',
    })
    expect(parsed.ok).toBe(true)
  })

  it('fails closed on turn limit / error subtypes', () => {
    const parsed = parseClaudeReviewerOutput({
      stdout: JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, result: 'x' }),
      exitCode: 0,
      requestedModel: 'opus',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/error_max_turns/)
  })

  it('fails closed on malformed or truncated JSON', () => {
    const cut = CLAUDE_ENVELOPE('claude-opus-5').slice(0, 40)
    for (const stdout of ['this is not json', cut]) {
      const parsed = parseClaudeReviewerOutput({ stdout, exitCode: 0, requestedModel: 'opus' })
      expect(parsed.ok).toBe(false)
    }
  })

  it('fails closed when the envelope has no modelUsage identity', () => {
    const parsed = parseClaudeReviewerOutput({
      stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, model: 'claude-opus-5', result: 'x' }),
      exitCode: 0,
      requestedModel: 'opus',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/no modelUsage identity/)
  })

  it('fails closed on model mismatch — the opus slot rejects a sonnet or fable key', () => {
    for (const modelKey of ['claude-sonnet-5', 'claude-fable-5-1']) {
      const parsed = parseClaudeReviewerOutput({ stdout: CLAUDE_ENVELOPE(modelKey), exitCode: 0, requestedModel: 'opus' })
      expect(parsed.ok).toBe(false)
      expect(parsed.reason).toMatch(/model identity mismatch/)
    }
  })

  it('fails closed on non-zero exit or empty result text', () => {
    expect(
      parseClaudeReviewerOutput({ stdout: CLAUDE_ENVELOPE('claude-opus-5'), exitCode: 1, requestedModel: 'opus' }).ok,
    ).toBe(false)
    expect(
      parseClaudeReviewerOutput({ stdout: CLAUDE_ENVELOPE('claude-opus-5', ''), exitCode: 0, requestedModel: 'opus' }).ok,
    ).toBe(false)
  })
})

describe('grok parser (verified envelope shape)', () => {
  it('accepts the live envelope: end_turn + modelUsage key + native text', () => {
    const parsed = parseGrokReviewerOutput({
      stdout: GROK_ENVELOPE('grok-4.6-build'),
      exitCode: 0,
      requestedModel: 'grok-4.6',
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.text).toBe('verdict text')
    expect(parsed.reportedModels).toEqual(['grok-4.6-build'])
    expect(parsed.meta.stopReason).toBe('end_turn')
    expect(parsed.meta.identityEvidence).toBe('native-model-usage-keys')
  })

  it('NEVER uses thought/draft text as the verdict — text is the only verdict-bearing field', () => {
    const onlyInThought = JSON.stringify({
      stopReason: 'end_turn',
      modelUsage: { 'grok-4.6-build': {} },
      thought: '{"verdict":"approve"}',
    })
    const parsed = parseGrokReviewerOutput({ stdout: onlyInThought, exitCode: 0, requestedModel: 'grok-4.6' })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/thought\/draft text is never used/)
  })

  it('requires a positive stopReason — absence is not completion', () => {
    const { stopReason, ...withoutStop } = JSON.parse(GROK_ENVELOPE('grok-4.6-build'))
    const missing = parseGrokReviewerOutput({ stdout: JSON.stringify(withoutStop), exitCode: 0, requestedModel: 'grok-4.6' })
    expect(missing.ok).toBe(false)
    expect(missing.reason).toMatch(/no stopReason/)

    const truncated = parseGrokReviewerOutput({
      stdout: GROK_ENVELOPE('grok-4.6-build', 'partial text', { stopReason: 'max_tokens' }),
      exitCode: 0,
      requestedModel: 'grok-4.6',
    })
    expect(truncated.ok).toBe(false)
    expect(truncated.reason).toMatch(/max_tokens/)
  })

  it('fails closed on explicit provider errors', () => {
    const parsed = parseGrokReviewerOutput({
      stdout: GROK_ENVELOPE('grok-4.6-build', 'x', { error: 'rate limited' }),
      exitCode: 0,
      requestedModel: 'grok-4.6',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/rate limited/)
  })

  it('fails closed on truncated JSON or a missing modelUsage identity', () => {
    expect(
      parseGrokReviewerOutput({ stdout: '{"stopReason":"end_turn","text":"cut', exitCode: 0, requestedModel: 'grok-4.6' }).ok,
    ).toBe(false)
    const { modelUsage, ...noUsage } = JSON.parse(GROK_ENVELOPE('grok-4.6-build'))
    const parsed = parseGrokReviewerOutput({ stdout: JSON.stringify(noUsage), exitCode: 0, requestedModel: 'grok-4.6' })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/no modelUsage identity/)
  })

  it('fails closed on model mismatch', () => {
    const parsed = parseGrokReviewerOutput({
      stdout: GROK_ENVELOPE('grok-3'),
      exitCode: 0,
      requestedModel: 'grok-4.6',
    })
    expect(parsed.ok).toBe(false)
  })
})

describe('codex parser (verified stdout: no model identity, positives required)', () => {
  const probeStdout = [
    '{"type":"thread.started","thread_id":"01a082a3-fc89-74c3-8171-be21bf04c4c7"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\\"ready\\":true}"}}',
    '{"type":"turn.completed","usage":{"input_tokens":18083,"output_tokens":9}}',
  ].join('\n')

  it('accepts thread.started + turn.started + turn.completed(usage) + non-empty final message', () => {
    const parsed = parseCodexReviewerOutput({
      stdout: probeStdout,
      lastMessage: 'final verdict text',
      exitCode: 0,
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.text).toBe('final verdict text')
    expect(parsed.meta.threadId).toBe('01a082a3-fc89-74c3-8171-be21bf04c4c7')
    // stdout carries NO model identity — the rollout check fills it in runner.mjs
    expect(parsed.reportedModels).toEqual([])
    expect(parsed.meta.identityEvidence).toBe('pending-rollout-check')
  })

  it('fails closed when turn.completed is missing (run did not finish)', () => {
    const incomplete = probeStdout.split('\n').slice(0, 3).join('\n')
    const parsed = parseCodexReviewerOutput({ stdout: incomplete, lastMessage: 'text', exitCode: 0 })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/no completed turn/)
  })

  it('fails closed when the event stream is empty or has no thread id', () => {
    expect(parseCodexReviewerOutput({ stdout: '', lastMessage: 't', exitCode: 0 }).ok).toBe(false)
    const noThread = probeStdout.split('\n').slice(1).join('\n')
    const parsed = parseCodexReviewerOutput({ stdout: noThread, lastMessage: 't', exitCode: 0 })
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toMatch(/no usable thread id/)
  })

  it('fails closed on empty final message (possible truncation) or a non-JSON event line', () => {
    expect(parseCodexReviewerOutput({ stdout: probeStdout, lastMessage: '', exitCode: 0 }).ok).toBe(false)
    expect(parseCodexReviewerOutput({ stdout: `${probeStdout}\nnot json`, lastMessage: 't', exitCode: 0 }).ok).toBe(
      false,
    )
  })

  it('fails closed on non-zero exit', () => {
    expect(parseCodexReviewerOutput({ stdout: probeStdout, lastMessage: 't', exitCode: 1 }).ok).toBe(false)
  })
})
