#!/usr/bin/env node
// Fake reviewer CLI for tests. NEVER contacts a model or the network.
//
// Driven by two env vars:
//   FAKE_REVIEW_CLI  = claude | grok | codex   (output shape to emit)
//   FAKE_REVIEW_MODE = success | wrong-sha | wrong-model | reject |
//                      blocker-approve | malformed | truncated |
//                      exit-1 | timeout | write-worktree |
//                      grok-thought-only
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
    uncertainty: 'none',
    ...partial,
  }
}

const REPORT_MODES = new Set(['success', 'wrong-sha', 'wrong-model', 'reject', 'blocker-approve', 'grok-thought-only'])

function reportText(prompt) {
  const anchor = anchorFromPrompt(prompt)
  let verdict
  switch (mode) {
    case 'wrong-sha':
      verdict = verdictJson({ ...anchor, sha: 'f'.repeat(40) })
      break
    case 'reject':
      verdict = verdictJson(anchor, { verdict: 'reject', findings: [finding()] })
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

function emitClaude(prompt) {
  if (mode === 'malformed') {
    process.stdout.write('this is not json')
    return
  }
  if (mode === 'truncated') {
    process.stdout.write('{"type":"result","subtype":"success","is_error":false,"result":"partial')
    return
  }
  // Echo the requested model back with a context-window suffix, the way the
  // real CLI reports it — the parser must normalize that away.
  const model = mode === 'wrong-model' ? 'claude-sonnet-5' : `${requestedModel('claude-opus-4-6')}-reported[1m]`
  const payload = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 3,
    model,
    result: REPORT_MODES.has(mode) ? reportText(prompt) : 'no structured reply',
  }
  process.stdout.write(JSON.stringify(payload))
}

function emitGrok(prompt) {
  if (mode === 'malformed') {
    process.stdout.write('{"model":"grok-4.6","response":')
    return
  }
  if (mode === 'grok-thought-only') {
    const anchor = anchorFromPrompt(prompt)
    process.stdout.write(
      JSON.stringify({
        model: 'grok-4.6',
        thought: `Internal draft. Verdict: approve. ${JSON.stringify(verdictJson(anchor))}`,
        usage: { turns: 2 },
      }),
    )
    return
  }
  const payload = {
    model: mode === 'wrong-model' ? 'grok-3' : requestedModel('grok-4.6'),
    response: REPORT_MODES.has(mode) ? reportText(prompt) : 'no structured reply',
    thought: 'Draft thoughts that must never be read as the verdict.',
    usage: { turns: 2 },
  }
  process.stdout.write(JSON.stringify(payload))
}

function emitCodex(prompt) {
  const lastMessageFile = argValue('--output-last-message')
  if (mode === 'write-worktree' && lastMessageFile) {
    writeFileSync('fake-reviewer-artifact.txt', 'the reviewer must never do this')
  }
  const model = mode === 'wrong-model' ? 'gpt-5' : requestedModel('gpt-6-astra')
  process.stdout.write(`${JSON.stringify({ type: 'session_configured', model })}\n`)
  process.stdout.write(`${JSON.stringify({ type: 'task_complete' })}\n`)
  if (lastMessageFile && REPORT_MODES.has(mode)) {
    writeFileSync(lastMessageFile, reportText(prompt), 'utf8')
  }
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
