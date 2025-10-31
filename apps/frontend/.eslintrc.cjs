module.exports = {
  root: true,
  extends: ['eslint:recommended'],
  env: {
    browser: true,
    es2021: true,
  },
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^set[A-Z]|^_', ignoreRestSiblings: true }],
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-unsafe-optional-chaining': 'warn',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
}
