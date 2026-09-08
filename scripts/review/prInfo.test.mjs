import { describe, expect, it } from 'vitest'

import { collectPrInfo, diffDigest, fetchCurrentHeadSha } from './lib/prInfo.mjs'

const VIEW_JSON = JSON.stringify({
  number: 42,
  headRefOid: 'a'.repeat(40),
  headRefName: 'codex/some-fix',
  baseRefName: 'main',
  title: 'Fix BBG cap',
  url: 'https://github.com/PeterHartwieg/Rentenrechner/pull/42',
})

function fakeGh({ view = VIEW_JSON, names = 'src/engine/tax.ts\nsrc/rules/de2026.ts\n', diff = 'diff --git a/src/engine/tax.ts\n+changed' } = {}) {
  return async (command, args) => {
    expect(command).toBe('gh')
    if (args[0] === 'pr' && args[1] === 'view') return view
    if (args[0] === 'pr' && args[1] === 'diff' && args.includes('--name-only')) return names
    if (args[0] === 'pr' && args[1] === 'diff') return diff
    throw new Error(`unexpected gh invocation: ${args.join(' ')}`)
  }
}

describe('collectPrInfo', () => {
  it('captures the exact head SHA, changed files, and a stable diff digest', async () => {
    const info = await collectPrInfo({ pr: 42, run: fakeGh() })
    expect(info.headSha).toBe('a'.repeat(40))
    expect(info.files).toEqual(['src/engine/tax.ts', 'src/rules/de2026.ts'])
    expect(info.diffDigest).toBe(diffDigest('diff --git a/src/engine/tax.ts\n+changed'))
    expect(info.diffDigest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a non-integer PR number before touching gh', async () => {
    await expect(collectPrInfo({ pr: '42', run: fakeGh() })).rejects.toThrow(/--pr must be a positive integer/)
  })

  it('fails closed when the view is missing the head SHA', async () => {
    const partial = JSON.stringify({ number: 42, headRefName: 'x', baseRefName: 'main', title: 't' })
    await expect(collectPrInfo({ pr: 42, run: fakeGh({ view: partial }) })).rejects.toThrow(/missing "headRefOid"/)
  })

  it('fails closed on malformed view JSON', async () => {
    await expect(collectPrInfo({ pr: 42, run: fakeGh({ view: 'not json' }) })).rejects.toThrow(/malformed JSON/)
  })

  it('fails closed when the PR reports no changed files', async () => {
    await expect(collectPrInfo({ pr: 42, run: fakeGh({ names: '' }) })).rejects.toThrow(/no changed files/)
  })

  it('wraps gh failures with the failing command', async () => {
    const failing = async () => {
      throw new Error('exit status 1')
    }
    await expect(collectPrInfo({ pr: 42, run: failing })).rejects.toThrow(/gh pr view failed for PR #42/)
  })
})

describe('fetchCurrentHeadSha', () => {
  it('returns the current head SHA', async () => {
    const sha = await fetchCurrentHeadSha({ pr: 42, run: fakeGh() })
    expect(sha).toBe('a'.repeat(40))
  })

  it('fails closed on a malformed head SHA', async () => {
    const bad = JSON.stringify({ headRefOid: 'short' })
    await expect(fetchCurrentHeadSha({ pr: 42, run: fakeGh({ view: bad }) })).rejects.toThrow(/no usable headRefOid/)
  })
})
