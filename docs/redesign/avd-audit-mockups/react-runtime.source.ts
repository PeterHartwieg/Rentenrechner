/*
 * Local-only React runtime for the adjacent design mockups.
 *
 * Rebuild from the repository root:
 *   npx esbuild docs/redesign/avd-audit-mockups/react-runtime.source.ts \
 *     --bundle --minify --format=iife --platform=browser \
 *     --outfile=docs/redesign/avd-audit-mockups/react-runtime.js
 *
 * React and ReactDOM are MIT licensed; see the installed packages' LICENSE
 * files and https://github.com/facebook/react.
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'

Object.assign(globalThis, {
  React,
  ReactDOM: { createRoot },
})
