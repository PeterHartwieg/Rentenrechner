import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyShareStateNoindex } from './seo/dynamicRobots'

// Issue #02 (SEO/GEO discovery): when a user opens a share-URL (`?s=<base64>`),
// the prerendered `<meta name="robots" content="index,follow">` is overwritten
// with `noindex,follow` before the search engine has a chance to re-render the
// page. Canonical stripping + this dynamic injection together implement the
// share-state mitigation pinned in PRD line 103.
applyShareStateNoindex()

const rootEl = document.getElementById('root')!
const tree = (
  <StrictMode>
    <App />
  </StrictMode>
)

// `data-rentenwiki-prerendered="1"` on the root element marks SSG-emitted HTML.
// Hydrate that tree (preserves prerendered DOM); fall back to client-only
// rendering when the marker is absent (e.g., during dev server runs).
if (rootEl.dataset.rentenwikiPrerendered === '1') {
  hydrateRoot(rootEl, tree)
} else {
  createRoot(rootEl).render(tree)
}
