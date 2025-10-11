/*
 * ESLint configuration for ForumKit frontend
 * - Enforces consistent comment style (TSDoc) and avoids scattered inline comments
 * - Adds basic TypeScript recommendations
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'jsdoc'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Comments & documentation
    'multiline-comment-style': ['warn', 'starred-block'],
    'no-inline-comments': 'warn',
    'jsdoc/require-jsdoc': ['warn', {
      publicOnly: true,
      contexts: [
        'TSInterfaceDeclaration',
        'TSTypeAliasDeclaration',
        'FunctionDeclaration',
        'MethodDefinition',
      ],
    }],
    'jsdoc/tag-lines': 'off',

    // TS basics
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/ban-ts-comment': ['warn', { 'ts-ignore': 'allow-with-description' }],
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '**/*.d.ts',
  ],
};

