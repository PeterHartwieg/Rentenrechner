// Per-CLI adapters: command-line construction + native output parsing.
//
// Argument shapes are pinned to the CLIs' own --help output (checked against
// claude 2.1.263, grok 1.0.4, codex-cli 0.153.4):
//
//   claude -p --output-format json --model <m> --tools "Read,Grep,Glob"
//          --strict-mcp-config --mcp-config '{"mcpServers":{}}'   (stdin: prompt)
//   grok   --prompt-file <f> --output-format json -m <m> --max-turns <n>
//          --disable-web-search                                    (prompt file)
//   codex  exec --json -s read-only -m <m> --output-last-message <f> -
//                                                                 (stdin: prompt)
//
// All parsers fail closed: any missing field, non-success status, unknown
// shape, model mismatch, or truncation marker voids the review instead of
// being interpreted generously.

export const CLAUDE_READONLY_TOOLS = 'Read,Grep,Glob'
export const EMPTY_MCP_CONFIG = '{"mcpServers":{}}'
export const GROK_MAX_TURNS = 60
export const GROK_ALLOWED_THOUGHT_NEVER_FIELDS = [
  'thought',
  'thinking',
  'draft',
  'reasoning',
  'analysis',
  'scratchpad',
]

// Fields a Grok native JSON verdict may be read from. Everything else — in
// particular the thought/draft fields above — is ignored for verdict purposes.
export const GROK_RESULT_TEXT_FIELDS = ['result', 'response', 'content', 'final', 'text', 'output']

const COMPLETION_FAILURE_MARKERS =
  /(max[_ -]?turns|turn[_ -]?limit|truncat|length[_ -]?limit|aborted|cancelled|canceled)/i

const CODEX_STDERR_FAILURE_MARKERS =
  /(stream disconnected|unexpected status|rate limit|unauthorized|forbidden|context window)/i

// --- Argument builders ------------------------------------------------------

// Single place that assembles the final argv per reviewer kind so tests can
// pin the exact shapes against the CLIs' documented flags.
export function buildReviewerInvocation({ reviewer, model, promptFile, outputLastMessageFile }) {
  switch (reviewer) {
    case 'claude':
      return {
        args: [
          '-p',
          '--output-format',
          'json',
          '--model',
          model,
          '--tools',
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
        ],
        inputMode: 'prompt-file',
      }
    case 'codex':
      return {
        args: ['exec', '--json', '-s', 'read-only', '-m', model, '--output-last-message', outputLastMessageFile, '-'],
        inputMode: 'stdin',
      }
    default:
      throw new Error(`unknown reviewer kind: ${reviewer}`)
  }
}

// --- Model identity ---------------------------------------------------------

export function normalizeModelToken(model) {
  return String(model ?? '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // e.g. "claude-fable-5-1[1m]" context suffixes
    .trim()
}

export function modelMatches(reported, requested) {
  const a = normalizeModelToken(reported)
  const b = normalizeModelToken(requested)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

// Walks a parsed object and collects every string value stored under a "model"
// key. Deterministic, depth-limited, and never follows arrays beyond a sane
// bound — used to read the PROVIDER-reported identity, never to extract the
// verdict itself.
export function collectReportedModels(node, results = [], depth = 0) {
  if (results.length > 32 || depth > 8 || node === null || typeof node !== 'object') return results
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 64)) collectReportedModels(item, results, depth + 1)
    return results
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'model' && typeof value === 'string') results.push(value)
    else if (value !== null && typeof value === 'object') collectReportedModels(value, results, depth + 1)
  }
  return results
}

// --- Claude parser ----------------------------------------------------------

export function parseClaudeReviewerOutput({ stdout, exitCode, requestedModel }) {
  if (exitCode !== 0) return fail(`claude exited with code ${exitCode}`)
  let json
  try {
    json = JSON.parse(stdout)
  } catch {
    return fail('claude output is not valid JSON (possible truncation or non-JSON error text)')
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return fail('claude output JSON is not an object')
  }
  if (json.type !== 'result') {
    return fail(`claude output has unexpected type "${json.type}" — treating as incomplete`)
  }
  if (json.subtype !== 'success') {
    return fail(`claude did not complete successfully (subtype: ${json.subtype}; turn limit or error)`)
  }
  if (json.is_error === true) {
    return fail('claude reported is_error=true despite success subtype')
  }
  if (typeof json.result !== 'string' || json.result.trim().length === 0) {
    return fail('claude result text is missing or empty')
  }
  const reportedModels = collectReportedModels(json)
  if (!reportedModels.some((reported) => modelMatches(reported, requestedModel))) {
    return fail(
      `claude model identity mismatch: requested "${requestedModel}", provider reported ${JSON.stringify(reportedModels)}`,
      { reportedModels },
    )
  }
  return { ok: true, text: json.result, reportedModels, meta: { subtype: json.subtype, numTurns: json.num_turns } }
}

// --- Grok parser ------------------------------------------------------------

// Reads the review text from allowed fields ONLY. Thought/draft fields are
// never consulted — a verdict that exists solely inside them does not exist.
export function extractGrokResultText(json) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null

  if (Array.isArray(json.messages)) {
    const assistantMessages = json.messages.filter(
      (m) => m && typeof m === 'object' && m.role === 'assistant' && typeof m.content === 'string',
    )
    const last = assistantMessages[assistantMessages.length - 1]
    if (last && last.content.trim()) return last.content
  }

  for (const field of GROK_RESULT_TEXT_FIELDS) {
    const value = json[field]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function hasPresentThoughtFields(json) {
  return GROK_ALLOWED_THOUGHT_NEVER_FIELDS.filter((field) => {
    const value = json?.[field]
    return (typeof value === 'string' && value.trim().length > 0) || (value && typeof value === 'object')
  })
}

// Metadata projection: everything EXCEPT the result text and the thought
// fields. Failure markers are only trusted from metadata, never from review
// content (a reviewer may legitimately quote the word "truncation" in a
// finding about the code).
function grokMetadataProjection(json) {
  const skip = new Set([...GROK_RESULT_TEXT_FIELDS, ...GROK_ALLOWED_THOUGHT_NEVER_FIELDS, 'messages'])
  const projection = {}
  for (const [key, value] of Object.entries(json)) {
    if (!skip.has(key)) projection[key] = value
  }
  return JSON.stringify(projection)
}

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

  const presentThoughtFields = hasPresentThoughtFields(json)
  const text = extractGrokResultText(json)
  if (!text) {
    return fail(
      presentThoughtFields.length > 0
        ? `grok produced no verdict-bearing result text (only ${presentThoughtFields.join(', ')} fields — thought/draft text is never used as a verdict)`
        : 'grok produced no result text in any known result field',
    )
  }

  if (json.error) {
    const detail = typeof json.error === 'string' ? json.error : JSON.stringify(json.error)
    return fail(`grok reported an error: ${detail}`)
  }
  const metadata = grokMetadataProjection(json)
  const marker = metadata.match(COMPLETION_FAILURE_MARKERS)
  if (marker) {
    return fail(`grok metadata indicates incomplete run ("${marker[0]}") — refusing to treat as a completed review`)
  }

  const reportedModels = collectReportedModels(json)
  if (!reportedModels.some((reported) => modelMatches(reported, requestedModel))) {
    return fail(
      `grok model identity mismatch: requested "${requestedModel}", provider reported ${JSON.stringify(reportedModels)}`,
      { reportedModels },
    )
  }

  return { ok: true, text, reportedModels, meta: { thoughtFieldsPresent: presentThoughtFields } }
}

// --- Codex parser -----------------------------------------------------------

export function parseCodexReviewerOutput({ stdout, stderr = '', lastMessage, exitCode, requestedModel }) {
  if (exitCode !== 0) return fail(`codex exited with code ${exitCode}`)

  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean)
  const events = []
  for (const line of lines) {
    try {
      events.push(JSON.parse(line))
    } catch {
      return fail('codex event stream contains a non-JSON line (possible truncation)')
    }
  }
  if (events.length === 0) {
    return fail('codex event stream is empty — cannot prove the run happened')
  }

  const reportedModels = events.flatMap((event) => collectReportedModels(event))
  if (reportedModels.length === 0) {
    return fail('codex event stream carries no provider model identity — refusing to attribute the review')
  }
  if (!reportedModels.some((reported) => modelMatches(reported, requestedModel))) {
    return fail(
      `codex model identity mismatch: requested "${requestedModel}", provider reported ${JSON.stringify(reportedModels)}`,
      { reportedModels },
    )
  }

  if (typeof lastMessage !== 'string' || lastMessage.trim().length === 0) {
    return fail('codex final message file is empty or missing (possible truncation or turn limit)')
  }

  const stderrMarker = stderr.match(CODEX_STDERR_FAILURE_MARKERS)
  if (stderrMarker) {
    return fail(`codex stderr indicates a provider failure ("${stderrMarker[0]}")`)
  }

  return { ok: true, text: lastMessage, reportedModels, meta: { eventCount: events.length } }
}

function fail(reason, extra = {}) {
  return { ok: false, reason, ...extra }
}
