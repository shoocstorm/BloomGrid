import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // The simulation must stay renderer-agnostic so it can move to a worker / Rust later.
    files: ['src/sim/**', 'src/content/**', 'src/core/**', 'src/ecs/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', '@/render/*', '@/ui/*', '@/world/*'] }],
    },
  },
);
