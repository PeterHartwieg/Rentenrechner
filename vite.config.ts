import { copyFileSync } from 'fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      // Cloudflare Pages SPA fallback: serves 404.html for any unmatched path.
      // Avoids the "/* /index.html 200" _redirects rule that triggers CF error 10021.
      name: 'copy-index-to-404',
      closeBundle() {
        copyFileSync('dist/index.html', 'dist/404.html')
      },
    },
  ],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
})
