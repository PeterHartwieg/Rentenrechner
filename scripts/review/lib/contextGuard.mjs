// Fail-closed file containment for the review worktree.
//
// A PR controls the content of the review checkout — including which paths
// are symlinks. Git tracks symlinks, so a diff can carry
// `AGENTS.md -> ../../../../private/notes.md`; reading that file to build
// reviewer context would follow the link OUTSIDE the checkout and hand
// operator-private text to a model. Two independent guards, both fail
// closed:
//
// 1. `assertNoSymlinksUnder` — walks the review tree BEFORE any context read
//    or reviewer spawn and refuses to review at all if the checkout carries
//    a single symlink. Nothing in this repo needs one (no tracked symlink
//    exists), so the simple rule is the safe rule: a reviewer can then never
//    follow a link out of the tree, no matter which tool reads which path.
// 2. `containedReadText` — reads context only through canonical paths that
//    are proven to resolve inside the worktree root. Defense in depth for
//    the window the walk does not cover (e.g. a symlink planted after the
//    scan) and for plain `..` escapes, which need no symlink at all.
//
// Every rejection names the offending path. Tests exercise this with
// harmless synthetic files in temp dirs — never real private data.

import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

export const UNSAFE_REVIEW_TREE = 'UNSAFE_REVIEW_TREE'

export class UnsafeReviewTreeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UnsafeReviewTreeError'
    this.code = UNSAFE_REVIEW_TREE
  }
}

function isSymbolicLink(entry, lstat) {
  try {
    return lstat(entry).isSymbolicLink()
  } catch (error) {
    throw new UnsafeReviewTreeError(`could not stat ${entry}: ${error.message}`)
  }
}

// Walks the tree and rejects the review if ANY path — file or directory — is
// a symlink. `.git` is skipped: a worktree's `.git` is a plain pointer file
// and its target directory lives outside the checkout by design. Entries that
// disappear mid-walk are re-checked through lstat failures and fail closed.
export function assertNoSymlinksUnder(rootPath, { lstat = lstatSync, listDir = readdirSync } = {}) {
  const offenders = []
  const walk = (dir) => {
    let names
    try {
      names = listDir(dir)
    } catch (error) {
      throw new UnsafeReviewTreeError(`could not list ${dir}: ${error.message}`)
    }
    for (const name of names) {
      const entry = join(dir, name)
      if (isSymbolicLink(entry, lstat)) {
        offenders.push(entry)
        continue
      }
      let stats
      try {
        stats = lstat(entry)
      } catch {
        continue // vanished between listDir and lstat — nothing to descend into
      }
      if (stats.isDirectory()) walk(entry)
    }
  }

  walk(rootPath)
  if (offenders.length > 0) {
    throw new UnsafeReviewTreeError(
      'review checkout contains symlinked path(s) — a tracked symlink can point outside the ' +
        `checkout and must never be read into reviewer context or followed by a reviewer: ` +
        offenders.map((path) => path.slice(rootPath.length + 1)).join(', '),
    )
  }
}

// Reads one context file with canonical-path containment. The requested path
// must be relative, must not escape the root lexically (`..`), and — after
// resolving every symlink on the way — must still land inside the canonical
// root. Returns the file text; throws UnsafeReviewTreeError on any violation.
export function containedReadText({
  rootPath,
  path,
  readText = (p) => readFileSync(p, 'utf8'),
  lstat = lstatSync,
  realpath = realpathSync,
  resolvePath = resolve,
}) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new UnsafeReviewTreeError(`context path must be a non-empty string, got: ${JSON.stringify(path)}`)
  }
  if (isAbsolute(path)) {
    throw new UnsafeReviewTreeError(`context path must be relative to the review checkout: ${path}`)
  }

  const root = resolvePath(rootPath)
  const joined = resolvePath(root, path)
  const rootPrefix = root.endsWith(sep) ? root : root + sep
  if (joined !== root && !joined.startsWith(rootPrefix)) {
    throw new UnsafeReviewTreeError(`context path escapes the review checkout: ${path}`)
  }

  // Every component strictly BELOW the root — including the file itself —
  // must be a real entry, never a symlink. The root itself is exempt: on
  // macOS the operator's path can legitimately sit behind a symlinked
  // prefix (/var -> /private/var), and a canonicalized root cannot escape
  // the containment check that follows anyway.
  let cursor = joined
  for (;;) {
    if (cursor === root) break
    if (isSymbolicLink(cursor, lstat)) {
      throw new UnsafeReviewTreeError(`context path traverses a symlink: ${path}`)
    }
    const parent = dirname(cursor)
    if (parent === cursor || parent.length < root.length) break
    cursor = parent
  }

  let canonicalRoot
  let canonicalFile
  try {
    canonicalRoot = realpath(root)
    canonicalFile = realpath(joined)
  } catch (error) {
    throw new UnsafeReviewTreeError(`could not resolve ${path} inside the review checkout: ${error.message}`)
  }
  const canonicalPrefix = canonicalRoot.endsWith(sep) ? canonicalRoot : canonicalRoot + sep
  if (canonicalFile !== canonicalRoot && !canonicalFile.startsWith(canonicalPrefix)) {
    throw new UnsafeReviewTreeError(
      `context path resolves outside the review checkout: ${path} -> ${canonicalFile}`,
    )
  }

  return readText(canonicalFile)
}
