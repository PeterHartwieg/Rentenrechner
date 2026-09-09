// Resolves the repo root for the source report: the nearest ancestor of the
// script location that contains package.json, unless --repo-root is given.

import { dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function repoRootFromArgv(args) {
  const flagIndex = args.indexOf('--repo-root')
  if (flagIndex !== -1 && typeof args[flagIndex + 1] === 'string') {
    return resolve(args[flagIndex + 1])
  }

  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}
