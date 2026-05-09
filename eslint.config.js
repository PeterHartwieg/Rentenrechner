import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.claude']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Engine and API production code must not import from src/app (which may
  // carry React and browser-only concerns). Pure helpers belong in src/utils/,
  // src/domain/, or src/engine/ so the dependency direction stays:
  //   app → utils/engine/domain   (allowed)
  //   engine → utils/domain       (allowed)
  //   api → utils/engine/domain   (allowed)
  //   engine/api → app            (FORBIDDEN)
  {
    files: ['src/engine/**/*.ts', 'src/api/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/app/**', '../app/**', '../../app/**'],
              message:
                'engine/ and api/ must not import from src/app/. Move shared pure helpers to src/utils/, src/domain/, or src/engine/.',
            },
          ],
        },
      ],
    },
  },
])
