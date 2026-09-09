// Real gh/git subprocess runner for the CLI entrypoints. Tests inject fakes
// instead of using this module.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

export function makeSubprocessRun() {
  return (command, args) =>
    execFileP(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).then((r) => r.stdout)
}

export function makeGitStatusRun() {
  return async () => {
    const { stdout } = await execFileP('git', ['status', '--porcelain'], { encoding: 'utf8' })
    return stdout
  }
}
