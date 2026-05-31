/**
 * Typed copy-catalog entry shapes.
 *
 * The catalog is the single, stable home for public-facing UI strings. Keys are
 * hand-authored and stable — never derived from the German text — so that copy
 * can be edited, translated, and reviewed without breaking call sites.
 *
 * Storage-format note: catalog *data* lives in `entries/*.copy.json` (plain JSON
 * so the planned local editor and inventory CLI can read / write it with clean
 * Git diffs). This module supplies the *types*; `catalog.ts` loads + validates
 * the JSON and exposes the typed `copy` accessor.
 *
 * Kept under `src/content/` (React-free) so microcopy edits never touch engine
 * or feature code — same convention as `terms.ts` / `productFocus.ts`.
 */

/**
 * Review-risk classification for a copy entry. Drives how carefully a change is
 * reviewed and which validation rules apply.
 *
 * - `normal`     — ordinary UI microcopy; low review risk.
 * - `brand`      — brand-sensitive: must say `RentenWiki.de`, never a new
 *                  `Rentenrechner` public reference (CLAUDE.md guardrail).
 * - `legal`      — Impressum / Datenschutz / license-posture text.
 * - `disclaimer` — the not-advice disclaimer (a publication-blocking contract).
 * - `export`     — text embedded in CSV / PDF exports.
 *
 * Slice 1 migrates only `normal` copy. The higher tiers are defined up front so
 * later slices add validation rules + markers without a breaking type change.
 */
export type CopyRisk = 'normal' | 'brand' | 'legal' | 'disclaimer' | 'export'

/** Languages the catalog can carry. German is the source / default language. */
export type CopyLang = 'de' | 'en'

/**
 * Surface a string belongs to (e.g. `'landing'`, `'vergleich'`). Free-form by
 * design so adding a surface never requires a type edit; the convention is a
 * short lowercase id that matches the first segment of the entry's key.
 */
export type CopySurface = string

/** One catalog entry: a stable key plus its German text and metadata. */
export interface CopyEntry {
  /** Stable dot-separated key, e.g. `landing.hero.kicker`. Never the German text. */
  key: string
  /** German source text (required — German is the default language). */
  de: string
  /** Optional English translation (added incrementally; see Slice 5). */
  en?: string
  /** Surface this string appears on. */
  surface: CopySurface
  /** Human context for translators / reviewers. Required for high-risk tiers. */
  description?: string
  /** Review-risk classification. */
  risk: CopyRisk
}
