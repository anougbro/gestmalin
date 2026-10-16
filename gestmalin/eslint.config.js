import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),

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
    rules: {
      /* Cette application est 100 % locale : TOUT vient d'IndexedDB,
         pas d'un serveur. Charger la base est donc une vraie
         synchronisation avec un systeme externe, et passer par un
         effet est le motif correct — le setState arrive dans la
         promesse, donc apres le rendu.

         Sans reseau, il n'y a pas de « revalidation en arriere-plan » :
         la seule source de verite EST la base locale. */
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])