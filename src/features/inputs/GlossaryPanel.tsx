import './GlossaryPanel.css'
import { useMemo, useState } from 'react'
import { CATEGORY_LABELS, TERMS_LIST, type Term, type TermCategory } from '../../content/terms'

const CATEGORY_ORDER: TermCategory[] = [
  'profile',
  'grv',
  'bav',
  'insurance',
  'basisrente',
  'foerderung',
  'auszahlung',
  'kosten',
  'steuer-sv',
]

export function GlossaryPanel() {
  const [filter, setFilter] = useState('')

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const matches = (t: Term) =>
      !q ||
      t.plainLabel.toLowerCase().includes(q) ||
      t.expertLabel.toLowerCase().includes(q) ||
      t.shortHelp.toLowerCase().includes(q)

    const map = new Map<TermCategory, Term[]>()
    for (const t of TERMS_LIST) {
      if (!matches(t)) continue
      const list = map.get(t.category) ?? []
      list.push(t)
      map.set(t.category, list)
    }
    return CATEGORY_ORDER
      .map((cat) => ({ cat, terms: map.get(cat) ?? [] }))
      .filter((g) => g.terms.length > 0)
  }, [filter])

  const totalMatches = grouped.reduce((sum, g) => sum + g.terms.length, 0)

  return (
    <details className="glossary-panel">
      <summary>
        Glossar
        <span className="glossary-count">{TERMS_LIST.length} Begriffe</span>
      </summary>
      <p className="glossary-intro">
        Erklärungen aller Fach­begriffe in einfacher Sprache. Nutze die Suche, um einen Begriff schnell zu finden.
      </p>
      <input
        type="search"
        className="glossary-search"
        placeholder="Begriff oder Stichwort suchen…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Glossar durchsuchen"
      />
      {filter && (
        <p className="glossary-result-count">
          {totalMatches === 0
            ? 'Keine Treffer'
            : `${totalMatches} Treffer`}
        </p>
      )}
      <div className="glossary-groups">
        {grouped.map(({ cat, terms }) => (
          <section key={cat} className="glossary-group">
            <h4 className="glossary-group-title">{CATEGORY_LABELS[cat]}</h4>
            <dl className="glossary-list">
              {terms.map((t) => (
                <div key={t.id} className="glossary-entry">
                  <dt>
                    <span className="glossary-plain">{t.plainLabel}</span>
                    {t.expertLabel !== t.plainLabel && (
                      <span className="glossary-expert">{t.expertLabel}</span>
                    )}
                  </dt>
                  <dd>
                    {t.shortHelp}
                    {t.legalReference && (
                      <span className="glossary-ref"> · {t.legalReference}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </details>
  )
}
