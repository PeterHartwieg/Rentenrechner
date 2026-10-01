// Reviewer executable resolution.
//
// Executable paths are configurable so the toolchain survives CLI reinstalls
// and works on other machines. Every path can be overridden via an env var;
// when a binary is missing we name the env var and the expected default
// instead of failing with a bare ENOENT.
//
// No credential handling happens here: we never read, copy, or print auth
// files. Each CLI uses its own existing login state in place.

import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const REVIEWER_BIN_DEFAULTS = {
  claude: join(homedir(), '.local', 'bin', 'claude'),
  grok: join(homedir(), '.grok', 'bin', 'grok'),
  codex: 'codex',
}

export const REVIEWER_BIN_ENV = {
  claude: 'REVIEW_CLAUDE_BIN',
  grok: 'REVIEW_GROK_BIN',
  codex: 'REVIEW_CODEX_BIN',
}

// Plain string (no path separator) means "resolve via PATH" and cannot be
// probed with the filesystem; those resolve at spawn time.
export function resolveReviewerBin(kind, env = process.env) {
  const fallback = REVIEWER_BIN_DEFAULTS[kind]
  if (!fallback) throw new Error(`unknown reviewer kind: ${kind}`)
  const override = env[REVIEWER_BIN_ENV[kind]]
  const resolved = override && override.trim() ? override.trim() : fallback
  return { command: resolved, source: override ? 'env' : 'default', envVar: REVIEWER_BIN_ENV[kind] }
}

export function describeReviewerBin(kind, env = process.env) {
  const { command, source, envVar } = resolveReviewerBin(kind, env)
  const onPath = !command.includes('/')
  const available = onPath ? null : isExecutable(command)
  return { kind, command, source, envVar, onPath, available }
}

// Human-oriented check used before any reviewer spawn. PATH-resolved commands
// are surfaced with their own hint because we cannot probe them cheaply.
export function assertReviewerBinAvailable(kind, env = process.env) {
  const info = describeReviewerBin(kind, env)
  if (info.onPath || info.available) return info
  throw new Error(
    `Reviewer executable for "${kind}" not found at ${info.command}. ` +
      `Install the ${kind} CLI or point ${info.envVar} at the binary. ` +
      `Default location: ${REVIEWER_BIN_DEFAULTS[kind]}.`,
  )
}

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}
