import { describe, expect, it } from 'vitest'

import {
  assertNoMcpServersEnabled,
  buildCodexMcpDisableArgs,
  extractCodexSessionMetadata,
  findCodexRolloutFile,
  parseCodexMcpList,
  parseCodexRolloutFilename,
  verifyCodexIdentity,
} from './lib/codexSession.mjs'
import { identityAccepts } from './lib/adapters.mjs'

const THREAD = '01a082a3-fc89-74c3-8171-be21bf04c4c7'
const OTHER_THREAD = '01a082a3-fd98-7e01-8ce1-f5f12d14499b'

// Builds a rollout filename from a Date's LOCAL wall clock — the way the codex
// CLI names its session files.
function rolloutNameFor(date, sessionId = THREAD) {
  const pad = (n) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const mo = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const mi = pad(date.getMinutes())
  const s = pad(date.getSeconds())
  return `rollout-${y}-${mo}-${d}T${h}-${mi}-${s}-${sessionId}.jsonl`
}

describe('parseCodexRolloutFilename', () => {
  it('parses the local timestamp and session id', () => {
    const date = new Date(2026, 8, 8, 14, 30, 5)
    const parsed = parseCodexRolloutFilename(rolloutNameFor(date))
    expect(parsed.sessionId).toBe(THREAD)
    expect(parsed.wallClockMs).toBe(Date.UTC(2026, 8, 8, 14, 30, 5))
  })

  it('rejects files that are not rollout transcripts', () => {
    expect(parseCodexRolloutFilename('sessions.jsonl')).toBeNull()
    expect(parseCodexRolloutFilename('rollout-not-a-date-x.jsonl')).toBeNull()
  })
})

describe('findCodexRolloutFile', () => {
  const startedAt = new Date(2026, 8, 8, 12, 0, 0)

  function fakeTree(paths) {
    return {
      listDir: (dir) => {
        const entry = Object.entries(paths).find(([path]) => path === dir)
        if (!entry) throw new Error(`no such dir ${dir}`)
        return entry[1]
      },
      exists: (dir) => Object.hasOwn(paths, dir),
    }
  }

  it('finds exactly the file whose name ends with the run thread id', () => {
    const dir = `sessions/2026/09/08`
    const other = `rollout-2026-09-08T11-59-00-${OTHER_THREAD}.jsonl`
    const tree = fakeTree({ [dir]: [other, rolloutNameFor(startedAt)] })
    const found = findCodexRolloutFile({ sessionsDir: 'sessions', sessionId: THREAD, startedAt, ...tree })
    expect(found.path).toBe(`${dir}/${rolloutNameFor(startedAt)}`)
  })

  it('searches the neighbouring days for a run crossing midnight', () => {
    const dayBefore = new Date(2026, 8, 7, 23, 59, 0)
    const dir = 'sessions/2026/09/07'
    const tree = fakeTree({ [dir]: [rolloutNameFor(dayBefore)] })
    const found = findCodexRolloutFile({ sessionsDir: 'sessions', sessionId: THREAD, startedAt: new Date(2026, 8, 8, 0, 1, 0), ...tree })
    expect(found).not.toBeNull()
  })

  it('never reads or matches unrelated threads', () => {
    const dir = 'sessions/2026/09/08'
    const tree = fakeTree({ [dir]: [rolloutNameFor(startedAt, OTHER_THREAD)] })
    expect(findCodexRolloutFile({ sessionsDir: 'sessions', sessionId: THREAD, startedAt, ...tree })).toBeNull()
  })
})

describe('extractCodexSessionMetadata', () => {
  const rolloutText = [
    JSON.stringify({ timestamp: 'x', type: 'session_meta', payload: { id: THREAD, model_provider: 'openai', cwd: '/tmp/review' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'reasoning', text: 'SECRET REASONING' } }),
    JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1', model: 'gpt-6-astra', cwd: '/tmp/review' } }),
    'not json at all',
    JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', text: 'SECRET CONTENT' } }),
  ].join('\n')

  it('reads only session_meta and turn_context — never message or reasoning content', () => {
    const { session, turns } = extractCodexSessionMetadata(rolloutText)
    expect(session).toEqual({ id: THREAD, modelProvider: 'openai', cwd: '/tmp/review' })
    expect(turns).toEqual([{ turnId: 'turn-1', model: 'gpt-6-astra', cwd: '/tmp/review' }])
    expect(JSON.stringify({ session, turns })).not.toContain('SECRET')
  })
})

describe('verifyCodexIdentity', () => {
  const startedAt = new Date(2026, 8, 8, 12, 0, 0)
  const base = {
    requestedModel: 'gpt-6-astra',
    threadId: THREAD,
    expectedCwdCanonical: '/private/tmp/review',
    startedAt,
    identityAccepts,
  }

  const metadata = ({ id = THREAD, model = 'gpt-6-astra', cwd = '/private/tmp/review' } = {}) =>
    [
      JSON.stringify({ type: 'session_meta', payload: { id, model_provider: 'openai', cwd } }),
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1', model, cwd } }),
    ].join('\n')

  const options = (overrides = {}) => ({
    rolloutText: metadata(),
    rolloutPath: `/sessions/2026/09/08/${rolloutNameFor(startedAt)}`,
    rolloutWallClockMs: parseCodexRolloutFilename(rolloutNameFor(startedAt)).wallClockMs,
    mtimeMs: startedAt.getTime() + 1000,
    ...overrides,
  })

  it('accepts a session that matches id, model, cwd, and the invocation window', () => {
    const result = verifyCodexIdentity({ ...base, ...options() })
    expect(result.ok).toBe(true)
    expect(result.models).toEqual(['gpt-6-astra'])
    expect(result.evidence).toBe('cli-session-turn-context')
  })

  it('fails when the rollout session id does not match the run thread id', () => {
    const result = verifyCodexIdentity({ ...base, ...options(), rolloutText: metadata({ id: OTHER_THREAD }) })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/does not match the run's thread id/)
  })

  it('fails when the recorded model is a different model — no guessing', () => {
    const result = verifyCodexIdentity({ ...base, ...options(), rolloutText: metadata({ model: 'gpt-5.6-sol' }) })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/model identity mismatch/)
  })

  it('fails when the session cwd is not the review worktree', () => {
    const result = verifyCodexIdentity({
      ...base,
      ...options(),
      rolloutText: metadata({ cwd: '/Users/someone/elsewhere' }),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/does not match the review worktree/)
  })

  it('fails when the rollout timestamp is outside the invocation window', () => {
    const stale = new Date(startedAt.getTime() - 60 * 60 * 1000)
    const result = verifyCodexIdentity({
      ...base,
      ...options({
        rolloutWallClockMs: parseCodexRolloutFilename(rolloutNameFor(stale)).wallClockMs,
      }),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/not within the review invocation window/)
  })

  it('fails when the rollout file was last written before the run started', () => {
    const result = verifyCodexIdentity({
      ...base,
      ...options({ mtimeMs: startedAt.getTime() - 60_000 }),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/modified before the review started/)
  })

  it('fails when no turn_context model exists at all', () => {
    const result = verifyCodexIdentity({
      ...base,
      ...options({
        rolloutText: JSON.stringify({ type: 'session_meta', payload: { id: THREAD, cwd: '/private/tmp/review' } }),
      }),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/no turn_context model/)
  })
})

describe('codex MCP preflight parsing (parent-verified shapes)', () => {
  it('parses the observed native list output', () => {
    expect(parseCodexMcpList('[{"name":"computer-use","enabled":false},{"name":"node_repl","enabled":true}]')).toEqual([
      { name: 'computer-use', enabled: false },
      { name: 'node_repl', enabled: true },
    ])
  })

  it('fails closed on unexpected shapes', () => {
    expect(() => parseCodexMcpList('{"servers":[]}')).toThrow(/unexpected shape/)
    expect(() => parseCodexMcpList('not json')).toThrow(/malformed/)
    expect(() => parseCodexMcpList('[{"name":"x"}]')).toThrow(/missing usable/)
    expect(() => parseCodexMcpList('[{"name":"x","enabled":"yes"}]')).toThrow(/missing usable/)
  })

  it('builds TOML-safe disable overrides for every configured server', () => {
    expect(buildCodexMcpDisableArgs([{ name: 'node_repl', enabled: true }, { name: 'computer-use', enabled: false }])).toEqual([
      '-c',
      'mcp_servers.node_repl.enabled=false',
      '-c',
      'mcp_servers.computer-use.enabled=false',
    ])
  })

  it('rejects unsafe server names instead of interpolating them into config', () => {
    expect(() => buildCodexMcpDisableArgs([{ name: 'x.enabled=true\r\n[other]', enabled: true }])).toThrow(
      /not a safe config key/,
    )
    expect(() => buildCodexMcpDisableArgs([{ name: '', enabled: true }])).toThrow(/not a safe config key/)
  })

  it('asserts the post-disable list has nothing enabled', () => {
    expect(() => assertNoMcpServersEnabled([{ name: 'a', enabled: false }, { name: 'b', enabled: false }])).not.toThrow()
    expect(() => assertNoMcpServersEnabled([])).not.toThrow()
    expect(() => assertNoMcpServersEnabled([{ name: 'node_repl', enabled: true }])).toThrow(/still enabled/)
  })
})
