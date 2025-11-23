/* eslint-env node */

/**
 * ESLint flat configuration for SOACRS service.
 *
 * - Uses ESLint v9 flat config.
 * - Applies base JS recommended rules.
 * - Adds TypeScript + Prettier support.
 * - Configures Node globals (process, etc.).
 * - Configures Jest globals for test files (describe, it, expect, etc.).
 */

const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const prettier = require('eslint-plugin-prettier');
const globals = require('globals');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  // 1. Ignore generated / external content
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },

  // 2. Base JS recommended rules
  js.configs.recommended,

  // 3. TypeScript + Prettier rules for all .ts files (src + tests)
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 2020,
      },
      // Node runtime globals (process, __dirname, etc.)
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier,
    },
    rules: {
      // Run Prettier as an ESLint rule (formatting issues = lint errors)
      'prettier/prettier': 'error',

      // Turn off base no-unused-vars and use TS-aware version
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_', // allow unused args prefixed with "_"
        },
      ],

      // Disallow explicit any in TS
      '@typescript-eslint/no-explicit-any': 'error',

      // Encourage explicit return types on exported functions
      '@typescript-eslint/explicit-module-boundary-types': 'warn',

      // Nicely ordered imports (but don't force declaration sorting)
      'sort-imports': ['warn', { ignoreDeclarationSort: true }],
    },
  },

  // 4. Additional Jest globals for test files
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 2020,
      },
      globals: {
        ...globals.node,
        ...globals.jest, // describe, it, expect, beforeEach, etc.
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      'sort-imports': ['warn', { ignoreDeclarationSort: true }],
    },
  },
];
