#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

export async function checkDist({ distDir, publicRouteRegistry, buildCanonicalUrl }) {
  const sitemap = new JSDOM(await readFile(join(distDir, 'sitemap.xml'), 'utf8'), {
    contentType: 'application/xml',
  })
  let urls
  try {
    urls = [...sitemap.window.document.querySelectorAll('url > loc')].map((loc) => loc.textContent)
  } finally {
    sitemap.window.close()
  }
  const routesByUrl = new Map(Object.entries(publicRouteRegistry)
    .filter(([, entry]) => entry.inSitemap)
    .map(([id, entry]) => [buildCanonicalUrl(id), entry]))
  assert.deepEqual([...urls].sort(), [...routesByUrl.keys()].sort(), 'sitemap URLs must match the registry')

  for (const url of urls) {
    const entry = routesByUrl.get(url)
    const file = join(distDir, new URL(url).pathname.replace(/^\//, ''), 'index.html')
    const dom = new JSDOM(await readFile(file, 'utf8'))
    try {
      const doc = dom.window.document
      assert.ok(doc.querySelector('[data-rentenwiki-prerendered="1"]'), `${url}: missing prerender marker`)
      const canonicals = doc.querySelectorAll('link[rel~="canonical"]')
      assert.equal(canonicals.length, 1, `${url}: expected exactly one canonical`)
      assert.equal(canonicals[0].getAttribute('href'), url, `${url}: canonical differs from sitemap`)
      assert.equal(doc.querySelectorAll('title').length, 1, `${url}: expected exactly one title`)
      assert.equal(doc.title, entry.title, `${url}: title differs from registry`)
      const jsonLd = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((script) => {
        try {
          return JSON.parse(script.textContent)
        } catch (cause) {
          throw new Error(`${url}: invalid JSON-LD`, { cause })
        }
      })
      // The homepage also emits Organization and WebApplication blocks.
      assert.ok(jsonLd.some((data) => data?.['@type'] === entry.jsonLdType),
        `${url}: missing JSON-LD @type ${entry.jsonLdType}`)
    } finally {
      dom.window.close()
    }
  }

  for (const file of ['404.html', 'app-shell/index.html']) {
    const dom = new JSDOM(await readFile(join(distDir, file), 'utf8'))
    try {
      const robots = [...dom.window.document.querySelectorAll('meta[name="robots"]')]
      assert.ok(robots.some((meta) => meta.content.split(/\s*,\s*/).includes('noindex')),
        `${file}: missing noindex`)
    } finally {
      dom.window.close()
    }
  }
  return urls.length
}

async function main() {
  // Metadata only: no React/MDX or Cloudflare plugins are needed here.
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })
  try {
    const registry = await server.ssrLoadModule('/src/seo/publicRouteRegistry.ts')
    const count = await checkDist({ distDir: join(projectRoot, 'dist'), ...registry })
    console.log(`[check-dist] ${count} sitemap pages + 404 and app shell passed`)
  } finally {
    await server.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[check-dist] failed:', error)
    process.exitCode = 1
  })
}
