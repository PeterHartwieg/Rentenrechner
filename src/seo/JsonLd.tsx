import type { Thing, WithContext } from 'schema-dts'

/**
 * Minimal React component that emits a `<script type="application/ld+json">`
 * block with the provided structured-data object inline so it lands in the
 * prerendered HTML (the SSG pass calls `renderToString` on this).
 *
 * Decision pinned in issue #02: typed via `schema-dts`, hand-rolled (no
 * `react-schemaorg` runtime dependency). The component is intentionally tiny —
 * the safety comes from the typed `data` argument.
 *
 * The output uses `JSON.stringify` with a 2-space indent for human-readable
 * View-Source. We escape `</` to `<\/` to avoid script-tag breakouts even
 * though `JSON.stringify` already escapes the dangerous characters; the extra
 * `</` -> `<\/` rewrite is defense-in-depth recommended by Google's
 * structured-data guidelines.
 */
export interface JsonLdProps<T extends Thing> {
  data: WithContext<T>
}

export function JsonLd<T extends Thing>({ data }: JsonLdProps<T>) {
  const serialized = JSON.stringify(data, null, 2).replace(/<\/(?=script)/gi, '<\\/')
  return (
    <script
      type="application/ld+json"
      // The serialized string is JSON.stringified data we authored, not user
      // input — `dangerouslySetInnerHTML` is the only way to keep the JSON
      // unescaped in the rendered HTML (text children would HTML-escape `"`).
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
  )
}
