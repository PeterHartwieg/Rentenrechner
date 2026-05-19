import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'

import { cloudflare } from "@cloudflare/vite-plugin";

// Static-host SPA fallback — Cloudflare Workers serves dist/404.html for any
// unmatched path. The legacy `copyFileSync('dist/index.html', 'dist/404.html')`
// plugin is replaced by `scripts/prerender.mjs`, which writes a real 404 page
// alongside the prerendered topic and homepage routes (issue #02).
//
// MDX is used by public discovery pages (e.g. /rentenluecke-rechner). The
// `.tsx` page wrapper imports its `.mdx` body; registry registration stays
// in the `.tsx` (locked decision in issue #02).
//
// remark-gfm enables GitHub-Flavored Markdown: pipe tables, task lists,
// strikethrough — required by topic pages that use comparison tables (issue #04).

// Build-time constant injected into client + SSR bundles. Used by the
// StatusBar to display the build date; evaluated once at build time so the
// prerendered HTML and the hydrated client agree (otherwise the value
// drifts across UTC midnight on long-lived prerenders).
const BUILD_DATE_ISO = new Date().toISOString().slice(0, 10)

export default defineConfig({
  define: {
    __RW_BUILD_DATE__: JSON.stringify(BUILD_DATE_ISO),
  },
  plugins: [
    // MDX must run before the React plugin so JSX inside `.mdx` is processed
    // through `@vitejs/plugin-react`'s fast-refresh transform.
    // remarkPlugins: remark-gfm enables pipe tables used in topic-page
    // comparison tables (issue #04 and onwards).
    { enforce: 'pre', ...mdx({ remarkPlugins: [remarkGfm] }) },
    react({ include: /\.(jsx|tsx|mdx)$/ }),
    cloudflare(),
  ],
  build: {
    // The lazy `Calculator` chunk (compare-mode + combine-mode dashboard,
    // engine, charts, recommender, inventory) is intentionally large at
    // ~840 kB raw / ~220 kB gzipped. It only loads on `/` when the App
    // resolves to a non-`landing` view, so its size never impacts first
    // paint of static-content routes (homepage landing, topic pages,
    // legal pages, /404). The default 500 kB warning is for code-splitting
    // candidates; we have already split, so raising the limit here is the
    // documented decision rather than further fragmenting the dashboard.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
    setupFiles: ['./src/vitest.setup.ts'],
  },
})