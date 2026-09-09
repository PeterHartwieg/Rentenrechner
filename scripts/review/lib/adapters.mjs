// Per-CLI adapters: command-line construction + native output parsing.
//
// Argument shapes are pinned to the CLIs' own --help output and to the
// parent's verified working invocations (checked against claude 2.1.263,
// grok 1.0.4, codex-cli 0.153.4):
//
//   claude -p --output-format stream-json --verbose --model <m> --max-turns 35
//          --tools Read,Grep,Glob --permission-mode dontAsk
//          --allowedTools Read,Grep,Glob
//          --strict-mcp-config --mcp-config '{"mcpServers":{}}'  (stdin: prompt)
//          (--max-turns works in this build even though --help omits it;
//           --verbose is required for stream-json to emit the final result
//           event at all)
//   grok   --prompt-file <f> --output-format json -m <m> --max-turns 60
//          --disable-web-search --no-subagents
//          --tools read_file,grep,list_dir --deny MCPTool
//          --permission-mode dontAsk --allow Read --allow Grep   (prompt file)
//          (--disable-web-search alone leaves mutating tools available —
//           the explicit tool allowlist + MCPTool deny are required)
//   codex  exec --json -s read-only -m <m> --output-last-message <f>
//          --disable plugins --disable apps --disable hooks
//          --ignore-user-config --ignore-rules
//          [-c mcp_servers.<n>.enabled=false
//           -c mcp_servers.<n>.command="/usr/bin/false" | .url="http://127.0.0.1:9"] -
//                                                                 (stdin: prompt)
//          (`--ignore-user-config` drops the original server definitions, so
//           each override must be a COMPLETE inert definition of the same
//           transport type — `enabled=false` alone leaves a transport-less
//           table and the CLI fails config parsing before the model call)
//
// Provider-reported model identity comes from each CLI's OWN native
// metadata, never from the reviewer's text. For claude it is the `model`
// field of every native assistant message in the `stream-json --verbose`
// event stream (verified live against the sanitized parent log
// /tmp/rentenwiki-assurance-orchestration/scenarios-opus-native-identity.json:
// every assistant message `claude-opus-5`, while the final result's
// `modelUsage` map additionally carries `claude-haiku-4-5-20251001` —
// auxiliary usage for side requests, NOT the reviewer). Those usage keys are
// recorded separately and never satisfy identity by themselves. For grok the
// identity is the result envelope's `modelUsage` OBJECT KEYS (verified live:
// "grok-4.6-build"). Codex stdout has no model identity at all — its
// identity comes from the CLI rollout session file, see codexSession.mjs.
//
// All parsers fail closed and read POSITIVE completion evidence only. Any
// missing field, non-success status, unknown shape, or model mismatch voids
// the review. Thought/draft/reasoning fields in reviewer output are never
// read — not even for failure detection — so they can never become a verdict.

import { classifyCodexNativeFailure, parseCodexExecEvents } from './codexSession.mjs'

export const CLAUDE_READONLY_TOOLS = 'Read,Grep,Glob'
export const CLAUDE_MAX_TURNS = 35
export const EMPTY_MCP_CONFIG = '{"mcpServers":{}}'
export const GROK_READONLY_TOOLS = 'read_file,grep,list_dir'
export const GROK_MAX_TURNS = 60

// Explicit accept lists per requested model. There is deliberately NO
// substring/fuzzy fallback: a reported id is accepted only if it appears
// here, so the Opus slot can never be satisfied by a Fable or Sonnet id and
// vice versa. `claude-opus-*` is prefix-matched deliberately — it is the
// documented Opus family id shape ("claude-opus-5" observed live).
const IDENTITY_RULES = {
  opus: (reported) => reported.startsWith('claude-opus-'),
  'claude-fable-5-1': (reported) => reported === 'claude-fable-5-1',
  'grok-4.6': (reported) => reported === 'grok-4.6' || reported === 'grok-4.6-build',
  'gpt-6-astra': (reported) => reported === 'gpt-6-astra',
}

export function normalizeModelToken(model) {
  return String(model ?? '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // e.g. "claude-fable-5-1[1m]" context suffixes
    .trim()
}

export function identityAccepts(requested, reported) {
  const rule = IDENTITY_RULES[normalizeModelToken(requested)]
  if (!rule) return false
  return rule(normalizeModelToken(reported))
}

// Reads the modelUsage OBJECT KEYS from a native result envelope — the
// verified location of provider-reported identity. Returns [] when the
// envelope has no usable modelUsage map.
export function collectModelUsageKeys(json) {
  const usage = json?.modelUsage
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) return []
  return Object.keys(usage).filter((key) => key.length > 0)
}

// --- Argument builders ------------------------------------------------------

// Single place that assembles the final argv per reviewer kind so tests can
// pin the exact shapes against the CLIs' documented flags. `codexMcpArgs`
// carries the complete inert disabled definitions produced by the MCP
// preflight (adapters stays pure — the preflight itself spawns in runner.mjs).
export function buildReviewerInvocation({ reviewer, model, promptFile, outputLastMessageFile, codexMcpArgs = [] }) {
  switch (reviewer) {
    case 'claude':
      return {
        args: [
          '-p',
          '--output-format',
          'stream-json',
          // stream-json only emits the final result event together with
          // --verbose; without it the stream would end after the last
          // assistant message and every run would look truncated.
          '--verbose',
          '--model',
          model,
          '--max-turns',
          String(CLAUDE_MAX_TURNS),
          // --safe-mode disables every customization surface a PR could plant
          // (CLAUDE.md, skills, plugins, hooks, MCP, custom agents); auth and
          // model selection still work. --restricted additionally ignores
          // user/project/local settings files, confines file tools to the
          // review worktree, and refuses bypassPermissions.
          '--safe-mode',
          '--restricted',
          '--tools',
          CLAUDE_READONLY_TOOLS,
          '--permission-mode',
          'dontAsk',
          '--allowedTools',
          CLAUDE_READONLY_TOOLS,
          '--strict-mcp-config',
          '--mcp-config',
          EMPTY_MCP_CONFIG,
        ],
        inputMode: 'stdin',
      }
    case 'grok':
      return {
        args: [
          '--prompt-file',
          promptFile,
          '--output-format',
          'json',
          '-m',
          model,
          '--max-turns',
          String(GROK_MAX_TURNS),
          '--disable-web-search',
          '--no-subagents',
          '--no-memory',
          '--tools',
          GROK_READONLY_TOOLS,
          '--deny',
          'MCPTool',
          '--permission-mode',
          'dontAsk',
          '--allow',
          'Read',
          '--allow',
          'Grep',
        ],
        inputMode: 'prompt-file',
      }
    case 'codex':
      return {
        args: [
          'exec',
          '--json',
          '-s',
          'read-only',
          '-m',
          model,
          '--output-last-message',
          outputLastMessageFile,
          '--disable',
          'plugins',
          '--disable',
          'apps',
          '--disable',
          'hooks',
          '--ignore-user-config',
          '--ignore-rules',
          ...codexMcpArgs,
          '-',
        ],
        inputMode: 'stdin',
      }
    default:
      throw new Error(`unknown reviewer kind: ${reviewer}`)
  }
}

// --- Claude parser -----------------------------------------------------------
// Verified live shape (stream-json + verbose, claude 2.1.263): one JSON event
// per line — a `system` init line, `assistant` lines each carrying
// `message.model` plus the message content, `user` tool-result lines, and a
// final `{ type: "result", subtype: "success", is_error: false, num_turns,
// modelUsage: {...}, result: "..." }` event.
//
// Identity: EVERY assistant event must carry `message.model`; one that omits
// it fails the run rather than being filtered out of the check. The models
// present must all agree and all match the requested model. The result's
// `modelUsage` keys are a separate bookkeeping fact: keys that do not match
// the requested model (auxiliary models such as Haiku handling side requests)
// are recorded as `auxiliaryModels` and are NOT an identity failure — but the
// primary model must still appear among them, or the usage map contradicts
// the assistant stream. Anything missing, partial, contradictory, or
// truncated fails closed. Reviewer text is never treated as identity.

function splitStreamJsonEvents(stdout, { onFail }) {
  const events = []
  for (const line of String(stdout ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let event
    try {
      event = JSON.parse(trimmed)
    } catch {
      return onFail('claude event stream contains a non-JSON line (possible truncation or non-JSON error text)')
    }
    if (event === null || typeof event !== 'object' || Array.isArray(event)) {
      return onFail('claude event stream contains a non-object JSON line')
    }
    events.push(event)
  }
  return events
}

export function parseClaudeReviewerOutput({ stdout, exitCode, requestedModel }) {
  if (exitCode !== 0) return fail(`claude exited with code ${exitCode}`)

  const events = splitStreamJsonEvents(stdout, {
    onFail: (reason) => fail(reason),
  })
  if (!Array.isArray(events)) return events

  // EVERY assistant event must carry its own message.model. Dropping the ones
  // that omit it would let a stream with a single opus-tagged message vouch
  // for an arbitrary number of unattributed assistant turns.
  const assistantEvents = events.filter((event) => event.type === 'assistant')
  const unattributed = assistantEvents.filter((event) => typeof event.message?.model !== 'string')
  if (unattributed.length > 0) {
    return fail(
      `claude stream contains ${unattributed.length} assistant message(s) without message.model — ` +
        'every assistant turn must carry its own model identity',
    )
  }
  const assistantModels = assistantEvents.map((event) => event.message.model)
  if (assistantModels.length === 0) {
    return fail('claude stream records no assistant message model — cannot attribute the review to a model')
  }
  for (const reported of assistantModels) {
    if (typeof reported !== 'string' || !identityAccepts(requestedModel, reported)) {
      return fail(
        `claude model identity mismatch: requested "${requestedModel}", assistant messages reported ${JSON.stringify(assistantModels)}`,
        { reportedModels: [String(reported)] },
      )
    }
  }
  const primaryModels = [...new Set(assistantModels.map((model) => normalizeModelToken(model)))]
  if (primaryModels.length > 1) {
    return fail(
      `claude assistant messages contradict each other about the reviewing model: ${JSON.stringify(primaryModels)}`,
      { reportedModels: primaryModels },
    )
  }

  const result = events.at(-1)
  if (result?.type !== 'result') {
    return fail(
      `claude stream ends with "${result?.type ?? 'nothing'}" instead of a result event — run did not complete (possible truncation)`,
    )
  }
  if (result.subtype !== 'success') {
    return fail(`claude did not complete successfully (subtype: ${result.subtype}; turn limit or error)`)
  }
  if (result.is_error === true) {
    return fail('claude reported is_error=true despite success subtype')
  }
  if (typeof result.result !== 'string' || result.result.trim().length === 0) {
    return fail('claude result text is missing or empty')
  }

  const usageModels = collectModelUsageKeys(result)
  if (usageModels.length === 0) {
    return fail('claude result carries no modelUsage map — refusing a review without usage metadata')
  }
  if (!usageModels.some((key) => identityAccepts(requestedModel, key))) {
    return fail(
      `claude modelUsage map ${JSON.stringify(usageModels)} contradicts the assistant stream ` +
        `(no entry for requested "${requestedModel}")`,
      { reportedModels: primaryModels },
    )
  }
  const auxiliaryModels = usageModels.filter((key) => !identityAccepts(requestedModel, key))

  return {
    ok: true,
    text: result.result,
    reportedModels: primaryModels,
    auxiliaryModels,
    meta: {
      subtype: result.subtype,
      numTurns: result.num_turns,
      identityEvidence: 'native-assistant-message-models',
      assistantMessageCount: assistantModels.length,
      usageModels,
      auxiliaryModels,
    },
  }
}

// --- Grok parser --------------------------------------------------------------
// Verified live envelope: { stopReason: "end_turn", num_turns: N, modelUsage:
// { "grok-4.6-build": {...} }, text: "..." }. The review text is read ONLY
// from the native `text` field; thought/draft/reasoning-style fields are
// never consulted, so a verdict that exists only inside them does not exist.
// `stopReason === "end_turn"` is REQUIRED: absence of failure markers alone
// is not completion.

export function parseGrokReviewerOutput({ stdout, exitCode, requestedModel }) {
  if (exitCode !== 0) return fail(`grok exited with code ${exitCode}`)
  let json
  try {
    json = JSON.parse(stdout)
  } catch {
    return fail('grok output is not valid JSON (possible truncation or non-JSON error text)')
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return fail('grok output JSON is not an object')
  }
  if (json.error) {
    const detail = typeof json.error === 'string' ? json.error : JSON.stringify(json.error)
    return fail(`grok reported an error: ${detail}`)
  }
  if (typeof json.text !== 'string' || json.text.trim().length === 0) {
    return fail('grok native result text is missing or empty — thought/draft text is never used as a verdict')
  }
  if (json.stopReason !== 'end_turn') {
    return fail(
      json.stopReason === undefined || json.stopReason === null
        ? 'grok result carries no stopReason — cannot prove the turn ended normally'
        : `grok stopReason "${json.stopReason}" is not a normal end_turn — run did not complete`,
    )
  }
  const reportedModels = collectModelUsageKeys(json)
  if (reportedModels.length === 0) {
    return fail('grok result envelope carries no modelUsage identity — refusing to attribute the review')
  }
  if (!reportedModels.every((reported) => identityAccepts(requestedModel, reported))) {
    return fail(
      `grok model identity mismatch: requested "${requestedModel}", provider reported ${JSON.stringify(reportedModels)}`,
      { reportedModels },
    )
  }
  return {
    ok: true,
    text: json.text,
    reportedModels,
    meta: { stopReason: json.stopReason, numTurns: json.num_turns ?? null, identityEvidence: 'native-model-usage-keys' },
  }
}

// --- Codex parser ---------------------------------------------------------------
// Verified live stdout: thread.started(thread_id) → turn.started →
// item.completed(agent_message) → turn.completed(usage). NO model identity in
// stdout — identity is verified against the CLI rollout session file in
// runner.mjs via codexSession.verifyCodexIdentity; this parser only proves
// the run completed and carries the thread id that pins that session.

export function parseCodexReviewerOutput({ stdout, stderr, exitCode, lastMessage }) {
  if (exitCode !== 0) {
    // The one recognised native failure gets a FIXED, payload-free
    // explanation (the MCP overrides must declare complete inert transports
    // because `--ignore-user-config` drops the originals). Native stderr is
    // never quoted — it can carry MCP command lines, env values, and auth
    // payloads — and every other failure stays generic.
    const diagnosed = classifyCodexNativeFailure(stderr)
    if (diagnosed) {
      return fail(`codex exited with code ${exitCode}: ${diagnosed.message}`, {
        meta: { failureCategory: diagnosed.category },
      })
    }
    return fail(`codex exited with code ${exitCode}`)
  }

  const events = parseCodexExecEvents(stdout)
  if (!events.ok) return fail(events.reason)

  if (typeof lastMessage !== 'string' || lastMessage.trim().length === 0) {
    return fail('codex final message file is empty or missing (possible truncation or turn limit)')
  }

  return {
    ok: true,
    text: lastMessage,
    reportedModels: [], // filled by the rollout identity check — stdout has none
    meta: {
      threadId: events.threadId,
      turnStartedCount: events.turnStartedCount,
      eventCount: events.eventCount,
      identityEvidence: 'pending-rollout-check',
    },
  }
}

function fail(reason, extra = {}) {
  return { ok: false, reason, ...extra }
}
