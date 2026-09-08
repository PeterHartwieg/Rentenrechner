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
 * staged, or untracked inside the source directories mark the state dirty.
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

  const dirtyPaths = new Set<string>()
  try {
    const porcelain = execSync('git status --porcelain', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    for (const line of porcelain.split('\n')) {
      if (line.length < 4) continue
      const path = line.slice(3).trim().replace(/^"|"$/g, '')
      if (ENGINE_SOURCE_DIRS.some((dir) => path === dir || path.startsWith(`${dir}/`))) {
        dirtyPaths.add(path)
      }
    }
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
