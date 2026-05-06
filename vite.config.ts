import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'

// Static-host SPA fallback — Cloudflare Pages serves dist/404.html for any
// unmatched path. The legacy `copyFileSync('dist/index.html', 'dist/404.html')`
// plugin is replaced by `scripts/prerender.mjs`, which writes a real 404 page
// alongside the prerendered topic and homepage routes (issue #02).
//
// MDX is used by public discovery pages (e.g. /rentenluecke-rechner). The
// `.tsx` page wrapper imports its `.mdx` body; registry registration stays
// in the `.tsx` (locked decision in issue #02).

export default defineConfig({
  plugins: [
    // MDX must run before the React plugin so JSX inside `.mdx` is processed
    // through `@vitejs/plugin-react`'s fast-refresh transform.
    { enforce: 'pre', ...mdx() },
    react({ include: /\.(jsx|tsx|mdx)$/ }),
  ],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
})
