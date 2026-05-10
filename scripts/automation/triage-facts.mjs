import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const QA_TITLE_RE = /^\[(BLOCKER|Major|Minor|Nit)\] qa\((copy|layout|flow|interaction|value|a11y|other)\): (.+)$/

export function parseMarkdownTableValue(body, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^\\|\\s*${escaped}\\s*\\|\\s*(.*?)\\s*\\|\\s*$`, 'im').exec(body)
  return match ? cleanMarkdownCell(match[1]) : ''
}

export function extractSection(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^##\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=^##\\s+|\\z)`, 'im').exec(body)
  return match ? match[1].trim() : ''
}

export function classifyIssueSource({ title, body, labelNames }) {
  const qaTitle = QA_TITLE_RE.exec(title)
  const hasQaHeader =
    Boolean(parseMarkdownTableValue(body, 'Target id')) &&
    Boolean(parseMarkdownTableValue(body, 'Precision')) &&
    Boolean(parseMarkdownTableValue(body, 'Route')) &&
    Boolean(parseMarkdownTableValue(body, 'Viewport')) &&
    Boolean(parseMarkdownTableValue(body, 'Browser')) &&
    Boolean(parseMarkdownTableValue(body, 'App build')) &&
    Boolean(parseMarkdownTableValue(body, 'Timestamp')) &&
    /^##\s+Privacy flags/im.test(body)

  if (qaTitle && hasQaHeader) {
    return labelNames.includes('from-maintainer') ? 'QA-maintainer' : 'QA-anonymous'
  }

  if (/Source:\s*(code-review session|ultrareview)/i.test(body)) return 'Non-QA pre-reviewed'
  if (
    /-\s+\[[ xX]\]/.test(body) ||
    (/^##\s+What to change/im.test(body) && /^##\s+Acceptance criteria/im.test(body)) ||
    /\bdocs\/(?:adr\/|.*\.md\b)/i.test(body)
  ) {
    return 'Non-QA pre-curated'
  }
  return 'Non-QA plain'
}

export function extractQaFacts({ title, body }) {
  const match = QA_TITLE_RE.exec(title)
  return {
    titleSeverity: match?.[1] ?? '',
    titleType: match?.[2] ?? '',
    titleTarget: match?.[3] ?? '',
    targetId: parseMarkdownTableValue(body, 'Target id'),
    precision: parseMarkdownTableValue(body, 'Precision'),
    route: parseMarkdownTableValue(body, 'Route'),
    testerComment: extractSection(body, 'Tester comment'),
  }
}

export function suggestedAreaLabel(type) {
  if (type === 'copy') return 'area:copy'
  if (type === 'layout') return 'area:ui-only'
  return ''
}

export function buildTriageFacts(issue) {
  const title = issue.title ?? ''
  const body = issue.body ?? ''
  const labelNames = (issue.labels ?? []).map((label) => label.name ?? label)
  const qa = extractQaFacts({ title, body })
  const source = classifyIssueSource({ title, body, labelNames })
  const qaCommentSubstance = qa.testerComment.replace(/[_*()`\s]/g, '')

  return {
    issue: {
      number: issue.number,
      title,
      author: issue.author?.login ?? '',
      labels: labelNames,
      bodyLength: body.trim().length,
      commentCount: issue.comments?.length ?? 0,
    },
    source,
    qa,
    suggestions: {
      areaLabelFromTitleType: suggestedAreaLabel(qa.titleType),
      qaAutoPromoteShape:
        (source === 'QA-anonymous' || source === 'QA-maintainer') &&
        ['Major', 'Minor', 'Nit'].includes(qa.titleSeverity) &&
        ['copy', 'layout', 'a11y', 'value'].includes(qa.titleType) &&
        ['exact', 'nested'].includes(qa.precision) &&
        qa.targetId.length > 0 &&
        qaCommentSubstance.length > 10,
      singleStageShape:
        ['copy', 'layout'].includes(qa.titleType) &&
        qa.precision === 'exact',
    },
  }
}

function cleanMarkdownCell(value) {
  return value.trim().replace(/^`|`$/g, '').replace(/\\`/g, '`')
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function main() {
  const issueNumber = process.env.ISSUE_NUMBER
  const outputPath = process.env.TRIAGE_FACTS_PATH ?? '.automation-triage-facts.json'
  if (!issueNumber) throw new Error('ISSUE_NUMBER is required')

  const raw = run('gh', [
    'issue',
    'view',
    issueNumber,
    '--json',
    'number,title,body,labels,comments,author',
  ])
  const facts = buildTriageFacts(JSON.parse(raw))
  writeFileSync(outputPath, `${JSON.stringify(facts, null, 2)}\n`)
  console.log(`Wrote ${outputPath}`)
  console.log(JSON.stringify(facts.suggestions))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
