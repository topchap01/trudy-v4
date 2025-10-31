import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import { fileURLToPath } from 'node:url'

const tsconfigRootDir = fileURLToPath(new URL('.', import.meta.url))

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir,
        sourceType: 'module',
        ecmaVersion: 2022,
      },
    },
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'packages/prompts', message: 'Clean start: do not import old prompts.' },
          { name: '@trudy/prompts', message: 'Clean start: do not import old prompts.' },
        ],
        patterns: [
          'packages/prompts/*',
          '@trudy/prompts/*',
        ],
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': 'off',
      'prefer-const': 'off',
      'no-useless-escape': 'off',
      'no-empty': 'off',
      'no-constant-binary-expression': 'off',
    },
  },
]
