import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/generated/**',
      '**/grammar/**',
      '**/*.js',
      '**/*.d.ts',
      'eslint.config.mjs',
      '**/.storybook/**',
      '**/vite.config.ts',
      '**/vite.config.*.ts',
      '**/vitest.config.ts',
      '**/playwright.config.ts',
      '**/e2e/**',
      'packages/ecl-editor-core/src/test/**',
      'clients/vscode/test/**',
      'examples/**',
    ],
  },

  // Base configs
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  sonarjs.configs.recommended,

  // Unicorn rules — targeted subset matching SonarQube analyzer gaps
  {
    plugins: { unicorn },
    rules: {
      'unicorn/prefer-at': 'error', // S7755: .at(-1) over [length-1]
      'unicorn/no-array-push-push': 'error', // S7778: combine push() calls
      'unicorn/prefer-export-from': 'error', // S7763: export-from re-exports
      'unicorn/prefer-node-protocol': 'error', // S7772: node:fs over fs
      'unicorn/no-negated-condition': 'error', // S7735: positive conditions
    },
  },

  // ecl-core source files
  {
    files: ['packages/ecl-core/src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      '@typescript-eslint/restrict-plus-operands': ['error', { allowNumberAndString: true }],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // ecl-lsp-server source files
  {
    files: ['packages/ecl-lsp-server/src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      '@typescript-eslint/restrict-plus-operands': ['error', { allowNumberAndString: true }],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // ecl-slack-bot source files
  {
    files: ['packages/ecl-slack-bot/src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      '@typescript-eslint/restrict-plus-operands': ['error', { allowNumberAndString: true }],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // ecl-slack-bot files with SNOMED URIs (http://snomed.info/sct/... is a FHIR system URI, not a network URL)
  {
    files: ['packages/ecl-slack-bot/src/config.ts', 'packages/ecl-slack-bot/src/ecl-processor.ts'],
    rules: {
      'sonarjs/no-clear-text-protocols': 'off',
    },
  },

  // Browser editor packages
  {
    files: [
      'packages/ecl-editor-core/src/**/*.ts',
      'packages/ecl-editor-react/src/**/*.ts',
      'packages/ecl-editor-react/src/**/*.tsx',
      'packages/ecl-editor/src/**/*.ts',
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      '@typescript-eslint/restrict-plus-operands': ['error', { allowNumberAndString: true }],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // Client source files
  {
    files: ['clients/vscode/src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      '@typescript-eslint/restrict-plus-operands': ['error', { allowNumberAndString: true }],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // Test files — relax strict type-safety rules
  {
    files: [
      'packages/ecl-core/src/test/**/*.ts',
      'packages/ecl-lsp-server/src/test/**/*.ts',
      'packages/ecl-slack-bot/src/test/**/*.ts',
      'packages/ecl-editor-core/src/test/**/*.ts',
      'packages/ecl-editor-react/src/test/**/*.ts',
      'packages/ecl-editor/src/test/**/*.ts',
      'clients/vscode/src/test/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/no-misleading-array-reverse': 'off',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      'unicorn/no-negated-condition': 'off',
    },
  },

  // ANTLR visitor + error listener — library API mandates `any` generics
  {
    files: ['packages/ecl-core/src/parser/visitor.ts', 'packages/ecl-core/src/parser/error-listener.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  // Prettier — must be last to override formatting rules
  eslintConfigPrettier,
);
