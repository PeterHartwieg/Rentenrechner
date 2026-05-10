import type { FeedbackType, ResolvedTarget } from './types'

interface InferFeedbackTypeArgs {
  comment: string
  suggestedText?: string
  target: ResolvedTarget
}

const KEYWORDS: Array<{ type: FeedbackType; words: RegExp[] }> = [
  {
    type: 'a11y',
    words: [
      /\baria\b/i,
      /\bfocus\b/i,
      /\bkeyboard\b/i,
      /\bscreen\s*reader\b/i,
      /\bcontrast\b/i,
      /\btab\b/i,
      /\btastatur\b/i,
      /\bfokus\b/i,
      /\bbarriere/i,
    ],
  },
  {
    type: 'copy',
    words: [
      /\btypo\b/i,
      /\bwording\b/i,
      /\bspelling\b/i,
      /\blabel\b/i,
      /\bheisst\b/i,
      /\bhei(?:ss|ß)t\b/i,
      /\brechtschreib/i,
      /\bformulierung\b/i,
      /\buebersetzung\b/i,
      /\bübersetzung\b/i,
      /\bsollte\b.*\bheissen\b/i,
      /\bsollte\b.*\bhei(?:ss|ß)en\b/i,
    ],
  },
  {
    type: 'layout',
    words: [
      /\blayout\b/i,
      /\bcss\b/i,
      /\boverlap/i,
      /\balign/i,
      /\bspacing\b/i,
      /\bmobile\b/i,
      /\bresponsive\b/i,
      /\babgeschnitten\b/i,
      /\bueberlap/i,
      /\büberlap/i,
      /\babstand\b/i,
    ],
  },
  {
    type: 'value',
    words: [
      /\bwrong\s+(number|value|amount|total)\b/i,
      /\bcalculation\b/i,
      /\btotal\b/i,
      /\bsum\b/i,
      /\bamount\b/i,
      /\beffektivkosten\b/i,
      /\bberechn/i,
      /\bwert\b/i,
      /\bbetrag\b/i,
      /\bsumme\b/i,
      /\bzahl\b/i,
      /\brechnet\b/i,
    ],
  },
  {
    type: 'flow',
    words: [
      /\bwizard\b/i,
      /\bstep\b/i,
      /\bnavigation\b/i,
      /\broute\b/i,
      /\bweiter\b/i,
      /\bzurueck\b/i,
      /\bzurück\b/i,
      /\bseite\b/i,
    ],
  },
  {
    type: 'interaction',
    words: [
      /\bbutton\b/i,
      /\bclick\b/i,
      /\bdropdown\b/i,
      /\bselect\b/i,
      /\bdoes(?:\s+not|n't)\s+(open|close|work)\b/i,
      /\bklick/i,
      /\boeffnet\b/i,
      /\böffnet\b/i,
    ],
  },
]

export function inferFeedbackType({
  comment,
  suggestedText,
  target,
}: InferFeedbackTypeArgs): FeedbackType {
  if (suggestedText?.trim()) return 'copy'

  const haystack = [
    comment,
    target.id,
    target.label ?? '',
    target.visibleText ?? '',
  ].join(' ')

  if (/\.(label|copy|text|heading|title)(\.|$)/i.test(target.id)) return 'copy'

  for (const candidate of KEYWORDS) {
    if (candidate.words.some((word) => word.test(haystack))) return candidate.type
  }

  return 'other'
}
