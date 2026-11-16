import base from '../eslint.base.js';

export default [
  ...base,
  {
    // CloudFront Function source (cloudfront-js-2.0): `handler` is the entry point CloudFront calls, and
    // __REDIRECT_HOSTS__ is a placeholder that lib/site-stack.ts replaces at synth time.
    files: ['functions/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { __REDIRECT_HOSTS__: 'readonly' } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^handler$' }] },
  },
];
