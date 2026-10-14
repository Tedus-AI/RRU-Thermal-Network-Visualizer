// Lint config — correctness rules only.
//
// Type and unused-symbol checking stay with `tsc` (strict, noUnusedLocals,
// noUnusedParameters); this adds what the compiler cannot see: the Rules of
// Hooks, stale effect dependencies, and the JavaScript/TypeScript mistakes
// the recommended sets catch.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // tsc already reports these, with the project's own settings.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
]);
