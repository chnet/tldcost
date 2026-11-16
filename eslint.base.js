// Shared ESLint flat config for all workspaces. A workspace that needs more (e.g. site/ with Astro)
// adds its own eslint.config.js next to its package.json and spreads this in first:
//   import base from '../eslint.base.js';
//   export default [...base, /* site rules */];
// ESLint 10 resolves the config from each file's directory, so root files stay untouched.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      '**/.astro/',
      '**/dist-e2e/',
      '**/test-results/',
      '**/playwright-report/',
      '**/.lighthouseci/',
      '**/cdk.out/',
      // identity guard shared with other CHnet repositories (tests adapted): linted there, kept identical here
      'scripts/lib/chnet-context.mjs',
      'scripts/check-commit-identity.mjs',
      'scripts/chnet-context-check.test.mjs',
      'scripts/check-commit-identity.test.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
);
