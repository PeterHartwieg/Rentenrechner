// Codex CLI session identity + MCP server preflight.
//
// `codex exec --json` stdout (verified against codex-cli 0.153.4, probe
// 2026-09-08) carries thread.started / turn.started / item.completed /
// turn.completed but NO model identity. The model is recorded only in the
// CLI's own rollout file for the returned thread:
//
//   $CODEX_HOME/sessions/<YYYY>/<MM>/<DD>/rollout-<localtime>-<thread_id>.jsonl
//
// with `session_meta` (id, model_provider, cwd) and `turn_context`
// (turn_id, model, cwd) lines. This module reads ONLY the file whose name
// ends with the thread id returned by the run being verified — it never
// scans the contents of unrelated sessions.
//
// The resulting evidence is honestly labelled "cli-session-turn-context":
// it ties the review to the local CLI session that ran, not to a
// server-side cryptographic attestation.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const CODEX_IDENTITY_EVIDENCE = 'cli-session-turn-context'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ROLLOUT_FILENAME_RE =
  /^rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-([0-9a-f-]+)\.jsonl$/

// Rollout files are written near invocation time; search the invocation day
// plus its neighbours so a run crossing midnight (or a timezone offset
// between caller clock and CLI local time) still finds exactly its thread.
const DAY_MS = 24 * 60 * 60 * 1000
const FILENAME_TIME_TOLERANCE_MS = 10 * 60 * 1000
const MTIME_SKEW_MS = 5_000

// --- exec stdout event parsing ----------------------------------------------

// Positive completion evidence only: a thread id, at least one started turn,
// and a turn.completed carrying usage. Absence of failure markers is NOT
// completion — the positives are required outright.
export function parseCodexExecEvents(stdout) {
  const events = []
  for (const line of String(stdout ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {
      return { ok: false, reason: 'codex event stream contains a non-JSON line (possible truncation)' }
    }
  }
  if (events.length === 0) {
    return { ok: false, reason: 'codex event stream is empty — cannot prove the run happened' }
  }

  const threadStarted = events.find((event) => event?.type === 'thread.started')
  const threadId = typeof threadStarted?.thread_id === 'string' ? threadStarted.thread_id : null
  if (!threadId || !UUID_RE.test(threadId)) {
    return { ok: false, reason: 'codex event stream carries no usable thread id' }
  }

  const turnStartedCount = events.filter((event) => event?.type === 'turn.started').length
  if (turnStartedCount === 0) {
    return { ok: false, reason: 'codex event stream shows no started turn' }
  }

  const turnCompleted = events.find((event) => event?.type === 'turn.completed')
  if (!turnCompleted || turnCompleted.usage === null || typeof turnCompleted.usage !== 'object') {
    return { ok: false, reason: 'codex event stream shows no completed turn with usage — run did not finish' }
  }

  return { ok: true, threadId, turnStartedCount, turnCompleted, eventCount: events.length }
}

// --- rollout file location + metadata extraction -----------------------------

// Parses `rollout-YYYY-MM-DDTHH-MM-SS-<sessionId>.jsonl` into its local
// timestamp and session id. Anything else is not a rollout file.
export function parseCodexRolloutFilename(name) {
  const match = ROLLOUT_FILENAME_RE.exec(name)
  if (!match) return null
  const [, y, mo, d, h, mi, s, sessionId] = match
  // The filename timestamp is written in local time; construct it as a plain
  // wall-clock value so the comparison with the caller's local-time day
  // window stays exact.
  const wallClock = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
  return { wallClockMs: wallClock, sessionId }
}

function localDayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return { key: `${y}-${m}-${d}`, wallClock: Date.UTC(y, date.getMonth(), date.getDate()) }
}

// Local wall-clock time encoded as UTC ms. Filename timestamps are written in
// local time, so both sides of the recency comparison must use the same
// encoding — comparing against the epoch value would false-fail in any
// non-UTC timezone.
function localWallClockMs(date) {
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  )
}

// Finds the rollout file for exactly this session id by listing (never
// reading) the session date directories around the invocation day. Returns
// { path, wallClockMs } or null. Only files whose parsed session id matches
// are considered.
export function findCodexRolloutFile({ sessionsDir, sessionId, startedAt, listDir = readdirSync, exists = existsSync }) {
  if (!UUID_RE.test(sessionId)) {
    throw new Error(`codex session id is not a UUID: ${sessionId}`)
  }
  const start = localDayKey(startedAt)
  const startWall = new Date(start.wallClock)
  for (let offset = -1; offset <= 1; offset += 1) {
    const day = new Date(startWall.getTime() + offset * DAY_MS)
    const { key } = localDayKey(day)
    const [y, m, d] = key.split('-')
    const dir = join(sessionsDir, y, m, d)
    if (!exists(dir)) continue
    let names
    try {
      names = listDir(dir)
    } catch {
      continue
    }
    const matches = []
    for (const name of names) {
      const parsed = parseCodexRolloutFilename(name)
      if (parsed && parsed.sessionId === sessionId) matches.push({ name, ...parsed })
    }
    // One thread id must map to exactly one rollout file per day.
    if (matches.length > 1) {
      throw new Error(`multiple rollout files found for session ${sessionId} under ${dir}`)
    }
    if (matches.length === 1) {
      return { path: join(dir, matches[0].name), wallClockMs: matches[0].wallClockMs }
    }
  }
  return null
}

// Reads ONLY session_meta and turn_context lines from a rollout transcript.
// Everything else (reasoning, tool calls, message contents, world state) is
// ignored outright.
export function extractCodexSessionMetadata(rolloutText) {
  const session = {}
  const turns = []
  for (const line of String(rolloutText ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let event
    try {
      event = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (event?.type === 'session_meta') {
      const p = event.payload ?? event
      if (typeof p.id === 'string') session.id = p.id
      if (typeof p.model_provider === 'string') session.modelProvider = p.model_provider
      if (typeof p.cwd === 'string') session.cwd = p.cwd
    } else if (event?.type === 'turn_context') {
      const p = event.payload ?? event
      const turn = {
        turnId: typeof p.turn_id === 'string' ? p.turn_id : null,
        model: typeof p.model === 'string' ? p.model : null,
        cwd: typeof p.cwd === 'string' ? p.cwd : null,
      }
      if (turn.turnId || turn.model || turn.cwd) turns.push(turn)
    }
  }
  return { session, turns }
}

// Full identity check for one codex review. `expectedCwdCanonical` must be
// the realpath of the review worktree (the CLI records canonical paths, e.g.
// /private/tmp on macOS). Throws only on tooling misuse; identity failures
// come back as { ok: false, reason }.
export function verifyCodexIdentity({
  requestedModel,
  threadId,
  rolloutText,
  rolloutPath,
  rolloutWallClockMs,
  expectedCwdCanonical,
  startedAt,
  now = new Date(),
  identityAccepts,
  realpath = (p) => p,
  mtimeMs = null,
}) {
  const { session, turns } = extractCodexSessionMetadata(rolloutText)

  if (!session.id || session.id !== threadId) {
    return fail(`rollout session id ${session.id ?? '(none)'} does not match the run's thread id ${threadId}`)
  }
  if (turns.length === 0 || turns.every((turn) => !turn.model)) {
    return fail('rollout records no turn_context model — cannot attribute the review to a model')
  }
  for (const turn of turns) {
    if (!turn.model || !identityAccepts(requestedModel, turn.model)) {
      return fail(
        `codex model identity mismatch: requested "${requestedModel}", session recorded ${JSON.stringify(
          turns.map((t) => t.model),
        )}`,
      )
    }
  }

  const sessionCwd = session.cwd ?? turns[turns.length - 1].cwd
  if (!sessionCwd || realpath(sessionCwd) !== expectedCwdCanonical) {
    return fail(
      `codex session cwd ${sessionCwd ?? '(none)'} does not match the review worktree ${expectedCwdCanonical}`,
    )
  }

  const startedMs = startedAt.getTime()
  if (Math.abs(rolloutWallClockMs - localWallClockMs(startedAt)) > FILENAME_TIME_TOLERANCE_MS) {
    return fail('rollout file timestamp is not within the review invocation window — session may be from another run')
  }
  if (mtimeMs !== null && mtimeMs < startedMs - MTIME_SKEW_MS) {
    return fail('rollout file was last modified before the review started — session may be from another run')
  }
  if (now.getTime() < startedMs) {
    return fail('clock inconsistency: review finished before it started')
  }

  return {
    ok: true,
    models: turns.map((turn) => turn.model),
    evidence: CODEX_IDENTITY_EVIDENCE,
    rolloutPath,
  }
}

function fail(reason) {
  return { ok: false, reason }
}

// --- MCP server preflight -----------------------------------------------------

// Base argv for inspecting/disabling MCP servers as the parent verified them:
// plugins, apps, and hooks are prevented from loading. Project/user configs
// may still register MCP servers, so the enabled set is read and each
// configured server is disabled explicitly.
export const CODEX_MCP_LIST_BASE_ARGS = [
  'mcp',
  'list',
  '--json',
  '--disable',
  'plugins',
  '--disable',
  'apps',
  '--disable',
  'hooks',
]

// Only strict JSON objects [{name, enabled}] are accepted (the observed
// native shape). Anything else fails closed rather than being guessed at.
export function parseCodexMcpList(stdout) {
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error('codex mcp list returned malformed JSON')
  }
  const list = Array.isArray(parsed) ? parsed : null
  if (!list) {
    throw new Error('codex mcp list output has an unexpected shape (expected a JSON array)')
  }
  return list.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('codex mcp list contains a non-object entry')
    }
    if (typeof entry.name !== 'string' || entry.name.length === 0 || typeof entry.enabled !== 'boolean') {
      throw new Error(`codex mcp list entry is missing usable "name"/"enabled": ${JSON.stringify(entry)}`)
    }
    return { name: entry.name, enabled: entry.enabled }
  })
}

const SAFE_CONFIG_NAME_RE = /^[A-Za-z0-9_-]+$/

// Builds `-c mcp_servers.<name>.enabled=false` overrides for every configured
// server. Names that are not plain TOML bare keys are REJECTED — never
// interpolated — so a hostile server name cannot inject config.
export function buildCodexMcpDisableArgs(configuredServers) {
  const args = []
  for (const server of configuredServers) {
    if (!SAFE_CONFIG_NAME_RE.test(server.name)) {
      throw new Error(
        `configured codex MCP server name ${JSON.stringify(server.name)} is not a safe config key; ` +
          'refusing to build a disable override — disable it manually in codex config',
      )
    }
    args.push('-c', `mcp_servers.${server.name}.enabled=false`)
  }
  return args
}

export function assertNoMcpServersEnabled(list) {
  const enabled = list.filter((server) => server.enabled)
  if (enabled.length > 0) {
    throw new Error(
      `codex MCP servers still enabled after disable overrides: ${enabled.map((s) => s.name).join(', ')}`,
    )
  }
}

export function rolloutMtimeMs(path, stat = statSync) {
  return stat(path).mtimeMs
}
