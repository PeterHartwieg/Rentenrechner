import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const ARCHIVE_PATH = 'docs/automation/retro-archive.md'

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
}

function runInherit(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options })
}

function hasChanges() {
  return run('git', ['status', '--porcelain']).trim().length > 0
}

export function normalizeRetroEntry(raw) {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('retro entry is empty')
  return `\n\n${trimmed}\n`
}

export function appendRetroEntry({ entryPath, stage, issueNumber }) {
  if (!entryPath || !existsSync(entryPath)) {
    throw new Error(`retro entry file not found: ${entryPath || '(missing)'}`)
  }
  if (!stage || !issueNumber) {
    throw new Error('stage and issueNumber are required')
  }

  const tempEntry = join(tmpdir(), `retro-entry-${stage}-${issueNumber}.md`)
  copyFileSync(entryPath, tempEntry)

  if (hasChanges()) {
    runInherit('git', ['stash', 'push', '-u', '-m', `pre-retro-${stage}-${issueNumber}`])
  }

  runInherit('git', ['checkout', 'main'])
  runInherit('git', ['pull', '--rebase', 'origin', 'main'])

  const entry = normalizeRetroEntry(readFileSync(tempEntry, 'utf8'))
  const archiveBefore = readFileSync(ARCHIVE_PATH, 'utf8')
  const archiveNext = `${archiveBefore.trimEnd()}${entry}`
  writeFileSync(ARCHIVE_PATH, archiveNext)

  runInherit('git', ['add', ARCHIVE_PATH])
  runInherit('git', ['commit', '-m', `retro: ${stage} #${issueNumber}`])

  try {
    runInherit('git', ['push', 'origin', 'main'])
  } catch {
    runInherit('git', ['pull', '--rebase', 'origin', 'main'])
    runInherit('git', ['push', 'origin', 'main'])
  } finally {
    rmSync(tempEntry, { force: true })
  }
}

async function main() {
  const entryPath = process.env.RETRO_ENTRY_PATH ?? '.automation-retro-entry.md'
  const stage = process.env.RETRO_STAGE
  const issueNumber = process.env.ISSUE_NUMBER
  appendRetroEntry({ entryPath, stage, issueNumber })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
