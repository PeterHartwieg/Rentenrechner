#!/usr/bin/env node
// Fake reviewer CLI for tests. NEVER contacts a model or the network.
//
// Driven by two env vars:
//   FAKE_REVIEW_CLI  = claude | grok | codex | codex-mcp (output shape to emit)
//   FAKE_REVIEW_MODE = success | wrong-sha | wrong-model | reject |
//                      blocker-approve | malformed | truncated |
//                      no-result | mixed-assistants | no-assistant |
//                      usage-without-primary |
//                      exit-1 | timeout | write-worktree |
//                      grok-thought-only
//
// Output shapes mirror the sanitized live envelopes in
// /tmp/rentenwiki-assurance-orchestration/ci-{grok,opus}-adapter-envelope.json
// and the stream-json capture in scenarios-opus-native-identity.json:
//   claude → JSONL events (stream-json --verbose): system init, assistant
//            messages each carrying message.model, and a final
//            { type:"result", subtype:"success", is_error:false, num_turns,
//              modelUsage: { primary + auxiliary keys }, result }. The
//              auxiliary `claude-haiku-4-5-20251001` key is present in the
//              success mode exactly as observed live — it is usage
//              bookkeeping, never the reviewer's identity.
//   grok   → { stopReason:"end_turn", num_turns,
//              modelUsage: { "grok-4.6-build": {...} }, text }
//   codex  → JSONL thread.started/turn.started/item.completed/turn.completed
//            (NO model identity — the rollout session file carries it).
//   codex-mcp → the native `codex mcp list --json` shape
//            [{name, enabled}] — servers report enabled:true until the
//            invocation carries `-c mcp_servers.<name>.enabled=false`
//            overrides, then false, so the runner's re-verify loop is
//            exercised for real.
//
// Reads the prompt from --prompt-file (grok) or stdin (claude/codex) so the
// tests also exercise prompt delivery.

import { readFileSync, writeFileSync } from 'node:fs'

const mode = process.env.FAKE_REVIEW_MODE ?? 'success'
const cli = process.env.FAKE_REVIEW_CLI ?? 'claude'

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

function readPrompt() {
  const promptFile = argValue('--prompt-file')
  if (promptFile) return readFileSync(promptFile, 'utf8')
  return readFileSync(0, 'utf8')
}

function anchorFromPrompt(prompt) {
  const sha = prompt.match(/`([0-9a-f]{40})`/)?.[1] ?? '0'.repeat(40)
  const pr = Number(prompt.match(/PR: #(\d+)/)?.[1] ?? 1)
  return { sha, pr }
}

function verdictJson({ sha, pr }, overrides = {}) {
  return {
    pr,
    headSha: sha,
    verdict: 'approve',
    confidence: 'high',
    findings: [],
    unresolved: [],
    ...overrides,
  }
}

function finding(partial = {}) {
  return {
    title: 'Example finding',
    severity: 'major',
    source: '§ 34d EStG, https://www.gesetze-im-internet.de/estg/__34d.html',
    applicableDate: '2026-01-01',
    interpretation: 'The statute means X; the code computes Y.',
    counterexampleOrTest: 'Salary 100000, age 67 -> expect 42000, engine returns 41000. Test: …',
    uncertainty: 'Riester Kinderzuschlag opt-out behavior for 2027 is unresolved.',
    ...partial,
  }
}

const REPORT_MODES = new Set(['success', 'wrong-sha', 'wrong-model', 'reject', 'blocker-approve'])

function reportText(prompt) {
  const anchor = anchorFromPrompt(prompt)
  let verdict
  switch (mode) {
    case 'wrong-sha':
      verdict = verdictJson({ ...anchor, sha: 'f'.repeat(40) })
      break
    case 'reject':
      verdict = verdictJson(anchor, {
        verdict: 'reject',
        findings: [finding()],
        unresolved: ['Whether the §10 Abs. 3 cap applies before or after the employer subsidy.'],
      })
      break
    case 'blocker-approve':
      verdict = verdictJson(anchor, { findings: [finding({ severity: 'blocker' })] })
      break
    default:
      verdict = verdictJson(anchor)
  }
  return `Review narrative before the block.\n\n\`\`\`json\n${JSON.stringify(verdict, null, 2)}\n\`\`\`\n`
}

function requestedModel(fallback) {
  const longIndex = process.argv.indexOf('--model')
  if (longIndex !== -1 && process.argv[longIndex + 1] !== undefined) return process.argv[longIndex + 1]
  const shortIndex = process.argv.indexOf('-m')
  if (shortIndex !== -1 && process.argv[shortIndex + 1] !== undefined) return process.argv[shortIndex + 1]
  return fallback
}

// The provider never reports the alias back verbatim: claude returns a family
// id (optionally with a context suffix), so the alias map must translate.
function claudeReportedModel(requested) {
  const model = requested === 'opus' ? 'claude-opus-5' : requested
  return `${model}[1m]`
}

const CLAUDE_AUXILIARY_MODEL = 'claude-haiku-4-5-20251001'

function emitClaudeLine(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`)
}

// Native stream-json --verbose shape: one JSON object per line. Assistant
// messages carry the actual reviewer model; the final result event carries a
// modelUsage map that ALSO lists auxiliary models used for side requests.
function emitClaude(prompt) {
  if (mode === 'malformed') {
    process.stdout.write('this is not json')
    return
  }
  if (mode === 'truncated') {
    process.stdout.write('{"type":"result","subtype":"success","is_error":false,"result":"partial')
    return
  }
  emitClaudeLine({ type: 'system', subtype: 'init', model: claudeReportedModel(requestedModel('opus')) })
  if (mode === 'no-assistant') {
    // No assistant message at all: nothing to attribute the review to.
    emitClaudeLine({
      type: 'result',
      subtype: 'success',
      is_error: false,
      num_turns: 1,
      modelUsage: { [CLAUDE_AUXILIARY_MODEL]: {} },
      result: 'no structured reply',
    })
    return
  }
  if (mode === 'mixed-assistants') {
    emitClaudeLine({ type: 'assistant', message: { model: 'claude-opus-5' } })
    emitClaudeLine({ type: 'assistant', message: { model: 'claude-sonnet-5' } })
  } else {
    const assistantModel = mode === 'wrong-model' ? 'claude-sonnet-5[1m]' : claudeReportedModel(requestedModel('opus'))
    emitClaudeLine({ type: 'assistant', message: { model: assistantModel } })
  }
  if (mode === 'no-result') {
    // Stream ends after the assistant message — no result event, so the run
    // cannot be proven complete (this is what --verbose normally prevents).
    return
  }
  const usageModels =
    mode === 'usage-without-primary'
      ? { [CLAUDE_AUXILIARY_MODEL]: { input_tokens: 10, output_tokens: 5 } }
      : {
          [CLAUDE_AUXILIARY_MODEL]: { input_tokens: 10, output_tokens: 5 },
          [mode === 'wrong-model' ? 'claude-sonnet-5[1m]' : claudeReportedModel(requestedModel('opus'))]: {
            input_tokens: 10,
            output_tokens: 5,
          },
        }
  emitClaudeLine({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 3,
    modelUsage: usageModels,
    result: REPORT_MODES.has(mode) ? reportText(prompt) : 'no structured reply',
  })
}

function emitGrok(prompt) {
  if (mode === 'malformed') {
    process.stdout.write('{"stopReason":"end_turn","text":')
    return
  }
  const modelKey = mode === 'wrong-model' ? 'grok-3' : 'grok-4.6-build'
  if (mode === 'grok-thought-only') {
    const anchor = anchorFromPrompt(prompt)
    // A verdict that exists ONLY inside the thought field must not count:
    // no native `text`, so the parser must fail regardless of content.
    process.stdout.write(
      JSON.stringify({
        stopReason: 'end_turn',
        num_turns: 2,
        modelUsage: { [modelKey]: {} },
        thought: `Internal draft. Verdict: approve. ${JSON.stringify(verdictJson(anchor))}`,
      }),
    )
    return
  }
  const payload = {
    stopReason: 'end_turn',
    num_turns: 2,
    modelUsage: { [modelKey]: { input_tokens: 10, output_tokens: 5 } },
    text: REPORT_MODES.has(mode) ? reportText(prompt) : 'no structured reply',
    thought: 'Draft thoughts that must never be read as the verdict.',
  }
  process.stdout.write(JSON.stringify(payload))
}

function emitCodex(prompt) {
  const lastMessageFile = argValue('--output-last-message')
  if (mode === 'write-worktree' && lastMessageFile) {
    writeFileSync('fake-reviewer-artifact.txt', 'the reviewer must never do this')
  }
  const threadId = process.env.FAKE_CODEX_THREAD_ID ?? '01a082a3-fc89-74c3-8171-be21bf04c4c7'
  // Mirrors the verified live probe: no model identity on stdout at all.
  process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: threadId })}\n`)
  process.stdout.write(`${JSON.stringify({ type: 'turn.started' })}\n`)
  process.stdout.write(
    `${JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'working' } })}\n`,
  )
  process.stdout.write(
    `${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } })}\n`,
  )
  if (lastMessageFile && REPORT_MODES.has(mode)) {
    writeFileSync(lastMessageFile, reportText(prompt), 'utf8')
  }
}

// Native `codex mcp list --json` shape. Servers configured in project/user
// config appear enabled until the disable overrides are present in argv —
// exactly the two-step preflight the runner performs.
function emitCodexMcp() {
  const overridden = process.argv.some(
    (arg, index) => arg === '-c' && /^mcp_servers\..+\.enabled=false$/.test(process.argv[index + 1] ?? ''),
  )
  const servers = ['node_repl', 'computer-use'].map((name) => ({ name, enabled: !overridden }))
  process.stdout.write(JSON.stringify(servers))
}

// Native `grok inspect --json` discovery shape (abbreviated to the fields the
// preflight reads). FAKE_GROK_PROJECT_HOOK=1 plants a project-owned hook the
// way a hostile PR would, to exercise the fail-closed path.
function emitGrokInspect() {
  const hooks = [
    {
      event: 'session_start',
      hookType: 'command',
      target: '/Users/operator/.claude/setup/sync.sh',
      source: { type: 'user', path: '/Users/operator/.claude' },
    },
  ]
  if (process.env.FAKE_GROK_PROJECT_HOOK === '1') {
    hooks.push({
      event: 'pre_tool_use',
      hookType: 'command',
      target: './.grok/hooks/pwn.sh',
      source: { type: 'project', path: process.cwd() },
    })
  }
  process.stdout.write(
    JSON.stringify({
      grokVersion: '1.0.4',
      channel: 'stable',
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      projectTrusted: true,
      hooks,
      plugins: [],
      mcpServers: [],
      lspServers: [],
    }),
  )
}

const prompt = readPrompt()
if (mode === 'exit-1') {
  process.stderr.write('simulated provider failure\n')
  process.exit(1)
}
if (mode === 'timeout') {
  // Never exit; the test kills us via the runner timeout.
  setTimeout(() => {}, 60_000)
}

if (cli === 'claude') emitClaude(prompt)
else if (cli === 'grok') emitGrok(prompt)
else if (cli === 'codex') emitCodex(prompt)
else if (cli === 'codex-mcp') emitCodexMcp()
else if (cli === 'grok-inspect') emitGrokInspect()
