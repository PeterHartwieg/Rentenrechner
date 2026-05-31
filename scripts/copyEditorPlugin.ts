/**
 * Dev-only Vite plugin: a local copy editor.
 *
 * `apply: 'serve'` — this plugin runs ONLY under the dev server. It is never
 * part of a production build, so the editor page and its file-write endpoint
 * cannot leak into `dist/`. In a production build `/__copy-editor/` simply
 * 404s ("clearly unavailable").
 *
 * Launch with `npm run copy:editor` (opens /__copy-editor/). It has no auth, no
 * cookies, and no remote calls — it talks only to the local dev server and
 * writes the catalog JSON files on disk via `fs`, producing normal repo diffs.
 *
 * Reuses the real validators (`validate.ts`) and the canonical serializer
 * (`editorFormat.ts`) so the editor, the CLI, and the app never drift.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { CopyEntry } from '../src/content/copy/types'
import { structuralIssues, policyIssues } from '../src/content/copy/validate'
import {
  serializeEntries,
  parseEntriesFile,
  isAllowedEntryFile,
} from '../src/content/copy/editorFormat'

const ROUTE = '/__copy-editor'
const ENTRIES_DIR = 'src/content/copy/entries'
const HTML_FILE = 'scripts/copy-editor.html'

interface FileBlock {
  file: string
  entries: CopyEntry[]
}

/** Discover the catalog entry files, as repo-root-relative paths. */
async function listEntryFiles(root: string): Promise<string[]> {
  const names = await readdir(resolve(root, ENTRIES_DIR))
  return names
    .filter((name) => name.endsWith('.copy.json'))
    .sort()
    .map((name) => `${ENTRIES_DIR}/${name}`)
}

async function readAllSources(root: string): Promise<FileBlock[]> {
  const files = await listEntryFiles(root)
  const blocks: FileBlock[] = []
  for (const file of files) {
    const text = await readFile(resolve(root, file), 'utf8')
    blocks.push({ file, entries: parseEntriesFile(text) })
  }
  return blocks
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => resolveBody(data))
    req.on('error', rejectBody)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * Same-origin guard for the write endpoint. Browsers attach an `Origin` header
 * to cross-origin requests, so rejecting a mismatching Origin stops a drive-by
 * page from rewriting catalog files while the dev server is running. Requests
 * with no Origin (curl, same-origin navigations) are allowed.
 */
function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

export function copyEditorPlugin(): Plugin {
  return {
    name: 'rentenwiki:copy-editor',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith(ROUTE)) return next()

        try {
          // Editor page.
          if (req.method === 'GET' && (url === ROUTE || url === `${ROUTE}/`)) {
            const html = await readFile(resolve(root, HTML_FILE), 'utf8')
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(html)
            return
          }

          // Read the whole catalog + current validation issues.
          if (req.method === 'GET' && url.startsWith(`${ROUTE}/api/catalog`)) {
            const sources = await readAllSources(root)
            const all = sources.flatMap((block) => block.entries)
            const issues = [...structuralIssues(all), ...policyIssues(all)]
            sendJson(res, 200, { sources, issues })
            return
          }

          // Save one file back to disk.
          if (req.method === 'POST' && url.startsWith(`${ROUTE}/api/save`)) {
            // Reject cross-origin writes (drive-by CSRF): a page on another
            // origin must not be able to rewrite catalog files via this endpoint.
            if (!isSameOrigin(req)) {
              sendJson(res, 403, { ok: false, error: 'Cross-origin save rejected.' })
              return
            }
            const payload = JSON.parse(await readBody(req)) as {
              file?: string
              entries?: CopyEntry[]
            }
            const file = payload.file ?? ''
            const entries = payload.entries ?? []
            const allowed = await listEntryFiles(root)
            if (!isAllowedEntryFile(file, allowed)) {
              sendJson(res, 400, { ok: false, error: `Not an allowed entry file: ${file}` })
              return
            }
            const errors = structuralIssues(entries).filter((issue) => issue.level === 'error')
            if (errors.length > 0) {
              sendJson(res, 400, { ok: false, errors })
              return
            }
            // Block brand-drift ("Rentenrechner" in public copy) — the public
            // brand is RentenWiki.de. Other policy warnings (e.g. missing en)
            // stay non-fatal so migration can save work-in-progress.
            const brandDrift = policyIssues(entries).filter((issue) => issue.code === 'brand-drift')
            if (brandDrift.length > 0) {
              sendJson(res, 400, { ok: false, errors: brandDrift })
              return
            }
            await writeFile(resolve(root, file), serializeEntries(entries), 'utf8')
            sendJson(res, 200, { ok: true })
            return
          }

          next()
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error) })
        }
      })

      server.config.logger.info(`  ➜  copy editor:  ${ROUTE}/  (dev only)`)
    },
  }
}
