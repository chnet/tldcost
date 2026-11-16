// site/: shared base plus browser globals for the island and the e2e tests.
import globals from 'globals';
import base from '../eslint.base.js';

export default [
  ...base,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // plain browser scripts served as files (theme-init.js, footnote-tips.js)
    files: ['public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
];
