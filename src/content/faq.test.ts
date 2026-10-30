import { describe, expect, it } from 'vitest'
import { validateFaq } from './faq'

describe('page FAQ files', () => {
  const files = import.meta.glob('../features/publicPages/*.faq.json', { eager: true, import: 'default' })
  it.each(Object.entries(files))('validates %s', (filename, data) => {
    expect(() => validateFaq(data, filename)).not.toThrow()
  })

  it.each([
    { q: 'Question?', a: '', sources: [] },
    { q: 'Question?', a: 'Answer.', sources: ['not-a-url'] },
    { q: 'Question?', a: 'Answer.', sources: ['http://example.com'] },
    { q: 'Question?', a: 'Answer.', sources: ['https://'] },
    { q: ' ', a: 'Answer.', sources: [] },
    { q: 'Question?', a: 'Answer.', sources: null },
    { q: 'Question?', a: 'Answer.' },
    null,
  ])('rejects an invalid faq.json item: %j', (item) => {
    expect(() => validateFaq([item], 'invalid.faq.json')).toThrow('invalid.faq.json[0]')
  })

  it('rejects an object instead of an array', () => {
    expect(() => validateFaq({})).toThrow('expected an FAQ array')
  })
})
