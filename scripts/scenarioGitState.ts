/**
 * Engine-identity helpers for the scenario-suite scripts (issue #377).
 *
 * A capture or evaluation must be attributable to a precise engine state. The
 * git HEAD alone is not enough — an uncommitted patch to `src/engine/` would
 * silently capture or validate against different math than the commit claims.
 * Every provenance record therefore carries, in addition to HEAD:
 *
 *   - a content digest over the calculation-source directories, and
 *   - the exact list of files in those directories that differ from the
 *     committed state (dirty paths).
 *
 * Capture (`scenario-update-baseline.ts`) refuses to run against dirty
 * calculation sources unless `--allow-dirty-reason "..."` is passed; the
 * override is recorded verbatim in provenance.json together with the digest.
 */

import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Directories whose contents fully determine engine/simulation output. */
export const ENGINE_SOURCE_DIRS = [
  'src/engine',
  'src/rules',
  'src/domain',
  'src/app',
  'src/utils',
  'src/data',
] as const

function listFilesRecursively(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursively(full))
    } else if (/\.(ts|tsx|json)$/.test(entry)) {
      out.push(full)
    }
  }
  return out.sort()
}

export interface EngineSourceState {
  digestSha: string
  dirty: boolean
  paths: string[]
}

/**
 * Digests every calculation-source file (path + bytes) and compares the file
 * list against git's committed state. Files that git reports as modified,
 * staged, untracked, or renamed inside the source directories mark the state
 * dirty.
 */
export function engineSourceState(): EngineSourceState {
  const hash = createHash('sha256')
  for (const dir of ENGINE_SOURCE_DIRS) {
    for (const file of listFilesRecursively(join(REPO_ROOT, dir))) {
      hash.update(relative(REPO_ROOT, file))
      hash.update('\0')
      hash.update(readFileSync(file))
      hash.update('\0')
    }
  }

  let dirtyPaths = new Set<string>()
  try {
    // -z: NUL-separated records, paths NOT quoted — the only machine-safe
    // format. Renames/copies (`R`, `C`) carry the ORIGINAL path as an
    // additional record after the entry, which a line-based `--porcelain`
    // parse (`old -> new`) cannot split reliably.
    const porcelain = execSync('git status --porcelain=v1 -z', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    dirtyPaths = new Set(dirtyCalculationPaths(porcelain.split('\0')))
  } catch {
    // Not a git checkout — the digest still identifies the content.
    dirtyPaths.add('(git status unavailable)')
  }

  return {
    digestSha: createHash('sha256').update(hash.digest('hex')).digest('hex').slice(0, 16),
    dirty: dirtyPaths.size > 0,
    paths: [...dirtyPaths].sort(),
  }
}

/**
 * Extracts the calculation-source paths from `git status --porcelain=v1 -z`
 * records. Each record is `XY <path>`; rename/copy records (`R`, `C` in
 * either column) are followed by one extra record holding the ORIGINAL path —
 * both endpoints are checked, since a rename in or out of a source directory
 * changes the committed-state comparison either way.
 */
export function dirtyCalculationPaths(records: readonly string[]): string[] {
  const dirty = new Set<string>()
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record.length < 4) continue
    const status = record.slice(0, 2)
    const paths = [record.slice(3).trim()]
    if (status.includes('R') || status.includes('C')) {
      paths.push((records[++i] ?? '').trim())
    }
    for (const path of paths) {
      if (ENGINE_SOURCE_DIRS.some((dir) => path === dir || path.startsWith(`${dir}/`))) {
        dirty.add(path)
      }
    }
  }
  return [...dirty].sort()
}

export function gitHeadSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return '(unknown — not a git checkout?)'
  }
}

export function shortSha(sha: string): string {
  return sha.length > 12 ? sha.slice(0, 12) : sha
}

export function contentSha256(json: string): string {
  return createHash('sha256').update(json).digest('hex').slice(0, 16)
}

/** Prints the git diff of the dirty calculation sources (for the capture log). */
export function printEngineSourceDiff(): void {
  try {
    const diff = execSync(
      `git diff HEAD -- ${ENGINE_SOURCE_DIRS.join(' ')}`,
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
    if (diff.trim().length > 0) {
      console.error('--- git diff of calculation sources (truncated to 200 lines) ---')
      for (const line of diff.split('\n').slice(0, 200)) console.error(line)
    }
    const untracked = execSync(
      `git ls-files --others --exclude-standard -- ${ENGINE_SOURCE_DIRS.join(' ')}`,
      { cwd: REPO_ROOT, encoding: 'utf8' },
    ).trim()
    if (untracked) {
      console.error('--- untracked calculation-source files ---')
      console.error(untracked)
    }
  } catch {
    console.error('(diff unavailable)')
  }
}
