import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkDist } from './check-dist.mjs'

const publicRouteRegistry = {
  '/': { inSitemap: true, title: 'Home & tools', jsonLdType: 'WebSite' },
  '/nested/page': { inSitemap: true, title: 'Nested page', jsonLdType: 'Article' },
}
const buildCanonicalUrl = (id) => `https://rentenwiki.de${id === '/' ? '/' : `${id}/`}`
const pageHtml = (id) => `<html data-rentenwiki-prerendered="1"><head>
  <title>${publicRouteRegistry[id].title.replaceAll('&', '&amp;')}</title>
  <link href="${buildCanonicalUrl(id)}" rel="canonical">
  <script type="application/ld+json">{"@type":"${publicRouteRegistry[id].jsonLdType}"}</script>
  </head><body><div id="root"><main>Rendered page</main></div></body></html>`

let distDir
async function put(file, content) {
  const path = join(distDir, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}
const check = () => checkDist({ distDir, publicRouteRegistry, buildCanonicalUrl })

beforeEach(async () => {
  distDir = await mkdtemp(join(tmpdir(), 'rentenwiki-dist-'))
  await put('sitemap.xml', `<urlset>${Object.keys(publicRouteRegistry).map((id) =>
    `<url><loc>${buildCanonicalUrl(id)}</loc></url>`).join('')}</urlset>`)
  await put('index.html', pageHtml('/'))
  await put('nested/page/index.html', pageHtml('/nested/page'))
  for (const file of ['404.html', 'app-shell/index.html']) {
    await put(file, '<meta name="robots" content="noindex,follow">')
  }
})

afterEach(async () => {
  await rm(distDir, { recursive: true, force: true })
})

describe('check-dist', () => {
  it('accepts nested routes, escaped titles and extra homepage JSON-LD blocks', async () => {
    await put('index.html', pageHtml('/').replace('</body>',
      '<script type="application/ld+json">{"@type":"Organization"}</script></body>'))
    await expect(check()).resolves.toBe(2)
  })

  it.each([
    ['missing marker', (html) => html.replace('data-rentenwiki-prerendered="1"', ''), 'missing prerender marker'],
    ['missing root', (html) => html.replace('<div id="root"><main>Rendered page</main></div>', ''), 'missing prerendered content in #root'],
    ['empty root', (html) => html.replace('<main>Rendered page</main>', ''), 'missing prerendered content in #root'],
    ['whitespace-only root', (html) => html.replace('<main>Rendered page</main>', ' \n '), 'missing prerendered content in #root'],
    ['duplicate canonical', (html) => html.replace('</head>', '<link rel="canonical" href="https://rentenwiki.de/"></head>'), 'exactly one canonical'],
    ['missing canonical', (html) => html.replace(/<link[^>]+>/, ''), 'exactly one canonical'],
    ['wrong canonical', (html) => html.replace('href="https://rentenwiki.de/"', 'href="https://rentenwiki.de/wrong/"'), 'canonical differs'],
    ['wrong title', (html) => html.replace('Home &amp; tools', 'Wrong title'), 'title differs'],
    ['invalid JSON-LD', (html) => html.replace('{"@type":"WebSite"}', '{broken'), 'invalid JSON-LD'],
    ['wrong JSON-LD type', (html) => html.replace('WebSite', 'Article'), 'missing JSON-LD @type WebSite'],
    ['missing JSON-LD', (html) => html.replace(/<script[\s\S]*?<\/script>/, ''), 'missing JSON-LD @type WebSite'],
  ])('rejects %s', async (_label, mutate, message) => {
    await put('index.html', mutate(pageHtml('/')))
    await expect(check()).rejects.toThrow(message)
  })

  it('rejects a sitemap missing a registry URL', async () => {
    await put('sitemap.xml', '<urlset/>')
    await expect(check()).rejects.toThrow('sitemap URLs must match the registry')
  })

  it.each(['nested/page/index.html', '404.html', 'app-shell/index.html'])('rejects a missing %s', async (file) => {
    await rm(join(distDir, file))
    await expect(check()).rejects.toThrow('ENOENT')
  })

  it.each(['404.html', 'app-shell/index.html'])('rejects indexable %s', async (file) => {
    await put(file, '<meta name="robots" content="index,follow">')
    await expect(check()).rejects.toThrow(`${file}: missing noindex`)
  })
})
