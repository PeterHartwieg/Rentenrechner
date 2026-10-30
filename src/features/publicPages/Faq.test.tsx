// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { Faq } from './Faq'
import { AltersvorsorgedepotRechnerPage } from './AltersvorsorgedepotRechnerPage'
import { renderRouteHeadHtml } from '../../seo/renderRouteHead'
import faq from './altersvorsorgedepot-rechner.faq.json'

describe('FAQ prerender', () => {
  it('renders exactly five Questions matching the visible FAQ and its sources', () => {
    const html = `<html><head>${renderRouteHeadHtml('/altersvorsorgedepot-rechner')}</head><body>${renderToString(<AltersvorsorgedepotRechnerPage />)}</body></html>`
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => JSON.parse(script.textContent!))
    const faqs = blocks.filter((block) => block['@type'] === 'FAQPage')
    expect(faqs).toHaveLength(1)
    expect(faqs[0].mainEntity).toHaveLength(5)
    const visible = [...doc.querySelectorAll('.faq-item')]
    expect(visible).toHaveLength(5)
    visible.forEach((item, index) => {
      const question = faqs[0].mainEntity[index]
      expect(question['@type']).toBe('Question')
      expect(question.name).toBe(item.querySelector('h3')?.textContent)
      expect(question.acceptedAnswer.text).toBe(item.querySelector('.faq-answer')?.textContent)
      expect(question.acceptedAnswer.text).toBe(faq[index].a)
      expect([...item.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(faq[index].sources)
      expect(question.acceptedAnswer).toEqual({ '@type': 'Answer', text: faq[index].a })
    })
  })

  it('renders answers as literal text', () => {
    const answer = '<script>alert("x")</script> **literal** [text](https://example.com)'
    const doc = new DOMParser().parseFromString(renderToString(
      <Faq items={[{ q: 'Question?', a: answer, sources: ['https://example.com'] }]} />,
    ), 'text/html')
    expect(doc.querySelector('.faq-answer')?.textContent).toBe(answer)
    expect(doc.querySelector('script')).toBeNull()
    expect(doc.querySelectorAll('a')).toHaveLength(1)
  })
})
