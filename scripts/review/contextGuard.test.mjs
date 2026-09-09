import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  UNSAFE_REVIEW_TREE,
  UnsafeReviewTreeError,
  assertNoSymlinksUnder,
  containedReadText,
} from './lib/contextGuard.mjs'

// Harmless synthetic stand-ins for operator-private files. Nothing here reads
// or probes real user data — each test builds its own temp tree.
const tempDirs = []

function makeTree() {
  const root = mkdtempSync(join(tmpdir(), 'review-context-guard-'))
  tempDirs.push(root)
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'engine.ts'), 'export const inTree = true\n', 'utf8')
  writeFileSync(join(root, 'CONTEXT.md'), '# in-tree context\n', 'utf8')
  return root
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop(), { recursive: true, force: true })
})

describe('assertNoSymlinksUnder', () => {
  it('accepts a checkout of plain files and directories', () => {
    const root = makeTree()
    expect(() => assertNoSymlinksUnder(root)).not.toThrow()
  })

  it('rejects the review when a tracked-style symlink file points outside the tree', () => {
    const root = makeTree()
    rmSync(join(root, 'src', 'engine.ts'))
    symlinkSync('/etc/hostname', join(root, 'src', 'engine.ts'))
    try {
      expect(() => assertNoSymlinksUnder(root)).toThrow(UnsafeReviewTreeError)
      try {
        assertNoSymlinksUnder(root)
      } catch (error) {
        expect(error.code).toBe(UNSAFE_REVIEW_TREE)
        expect(error.message).toMatch(/src\/engine\.ts/)
      }
    } finally {
      rmSync(join(root, 'src', 'engine.ts'))
    }
  })

  it('rejects a symlinked directory too, and names every offender', () => {
    const root = makeTree()
    const outside = mkdtempSync(join(tmpdir(), 'review-guard-outside-'))
    tempDirs.push(outside)
    symlinkSync(outside, join(root, 'docs'))
    symlinkSync('/etc/hosts', join(root, 'README.md'))
    try {
      expect(() => assertNoSymlinksUnder(root)).toThrow(/docs.*README\.md|README\.md.*docs/s)
    } finally {
      rmSync(join(root, 'docs'))
      rmSync(join(root, 'README.md'))
    }
  })

  it('does not exempt .git: the plain worktree pointer file passes on its own merits', () => {
    const root = makeTree()
    writeFileSync(join(root, '.git'), 'gitdir: /somewhere/else/worktrees/demo\n', 'utf8')
    expect(() => assertNoSymlinksUnder(root)).not.toThrow()
  })

  it('reports a SYMLINKED .git as an offender — there is no name-based escape hatch', () => {
    // The comment and the doc previously advertised a `.git` exemption the
    // walk never implemented. The honest rule is: nothing is exempt.
    const root = makeTree()
    symlinkSync('/etc/hostname', join(root, '.git'))
    try {
      expect(() => assertNoSymlinksUnder(root)).toThrow(/\.git/)
    } finally {
      rmSync(join(root, '.git'))
    }
  })
})

describe('containedReadText', () => {
  it('reads an ordinary in-tree file through its canonical path', () => {
    const root = makeTree()
    expect(containedReadText({ rootPath: root, path: 'src/engine.ts' })).toBe('export const inTree = true\n')
  })

  it('rejects empty and absolute context paths', () => {
    const root = makeTree()
    for (const path of ['', '/etc/passwd']) {
      try {
        containedReadText({ rootPath: root, path })
        expect.unreachable(`expected ${JSON.stringify(path)} to be rejected`)
      } catch (error) {
        expect(error).toBeInstanceOf(UnsafeReviewTreeError)
      }
    }
  })

  it('rejects a lexical .. escape — no symlink needed', () => {
    const root = makeTree()
    const outside = join(tmpdir(), 'guard-outside-target.txt')
    writeFileSync(outside, 'operator-private\n', 'utf8')
    try {
      expect(() => containedReadText({ rootPath: root, path: `../${outside.split('/').pop()}` })).toThrow(
        /escapes the review checkout/,
      )
    } finally {
      rmSync(outside)
    }
  })

  it('rejects a context file that is itself a symlink out of the tree', () => {
    const root = makeTree()
    const outside = join(tmpdir(), 'guard-outside-notes.txt')
    writeFileSync(outside, 'operator-private\n', 'utf8')
    rmSync(join(root, 'CONTEXT.md'))
    symlinkSync(outside, join(root, 'CONTEXT.md'))
    try {
      expect(() => containedReadText({ rootPath: root, path: 'CONTEXT.md' })).toThrow(/traverses a symlink/)
    } finally {
      rmSync(join(root, 'CONTEXT.md'))
    }
  })

  it('rejects a symlinked PARENT directory even when the file name is innocent', () => {
    const root = makeTree()
    const outside = mkdtempSync(join(tmpdir(), 'review-guard-outside-'))
    tempDirs.push(outside)
    writeFileSync(join(outside, 'engine.ts'), 'planted\n', 'utf8')
    rmSync(join(root, 'src'), { recursive: true })
    symlinkSync(outside, join(root, 'src'))
    try {
      expect(() => containedReadText({ rootPath: root, path: 'src/engine.ts' })).toThrow(/traverses a symlink/)
    } finally {
      rmSync(join(root, 'src'))
    }
  })

  it('fails closed on a missing file instead of letting the caller retry elsewhere', () => {
    const root = makeTree()
    expect(() => containedReadText({ rootPath: root, path: 'src/missing.ts' })).toThrow(UnsafeReviewTreeError)
  })

  it('canonicalizes the root itself, so a symlinked review root still cannot leak', () => {
    // Defense in depth: the caller normally passes the real worktree path,
    // but if it arrives via a symlinked temp dir the canonical containment
    // must still hold.
    const root = makeTree()
    const link = join(mkdtempSync(join(tmpdir(), 'review-guard-link-')), 'root-link')
    tempDirs.push(link.split('/').slice(0, -1).join('/'))
    symlinkSync(root, link)
    expect(containedReadText({ rootPath: link, path: 'CONTEXT.md' })).toBe('# in-tree context\n')
  })

  it('reads through the canonical file path it verified', () => {
    const root = makeTree()
    const seen = []
    containedReadText({
      rootPath: root,
      path: 'src/engine.ts',
      readText: (p) => {
        seen.push(p)
        return 'x'
      },
    })
    // The read must use the realpath, not the possibly-symlinked join —
    // otherwise a race could swap the target after the checks.
    expect(seen).toEqual([join(realpathSync(root), 'src', 'engine.ts')])
  })
})
