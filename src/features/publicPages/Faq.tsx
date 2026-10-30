import { validateFaq, type FaqItem } from '../../content/faq'

/** Import a neighbouring .faq.json in MDX and pass it as `items`. */
export function Faq({ items }: { items: readonly FaqItem[] }) {
  return (
    <section className="faq" aria-label="Häufige Fragen">
      <h2>Häufige Fragen</h2>
      {validateFaq(items).map(({ q, a, sources }) => (
        <div className="faq-item" key={q}>
          <h3>{q}</h3>
          <p className="faq-answer">{a}</p>
          {sources.length > 0 && (
            <div className="faq-sources">
              <span>Quellen:</span>
              <ul>
                {sources.map((url) => <li key={url}><a href={url}>{url}</a></li>)}
              </ul>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
