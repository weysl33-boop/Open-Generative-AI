import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: repoRoot });

/**
 * FlatCompat only emits `files` patterns for `.js`/`.ts` spellings, so every
 * `.jsx` file in the repository — including all twenty-plus studio
 * components — matched no config at all. `eslint --print-config` returned
 * `undefined` for them and the run reported "File ignored because no matching
 * configuration was supplied" while still exiting 0, so a green `npm run lint`
 * had never actually looked at the largest UI surface in the product.
 *
 * Widening the same rule set to `.jsx` was measured first: 0 errors, 6
 * warnings (all redundant `eslint-disable react-hooks/exhaustive-deps`
 * directives, dead because that rule is off below).
 */
const SOURCES = '**/*.{js,jsx,mjs,cjs,ts,tsx}';
const extended = compat
  .extends('next/core-web-vitals')
  .map((config) =>
    config && typeof config === 'object' && !config.files && !config.ignores
      ? { files: [SOURCES], ...config }
      : config,
  );

const eslintConfig = [
  ...extended,
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.next-*/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.cache/**',
    ],
  },
  {
    files: [SOURCES],
    rules: {
      // Existing UI uses full-page anchors and native images intentionally in
      // several standalone surfaces; keep the CI lint contract deterministic
      // while the UI migration remains incremental.
      '@next/next/no-html-link-for-pages': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off',
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];

export default eslintConfig;
