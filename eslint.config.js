import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import globals from 'globals'
import prettierConfig from 'eslint-config-prettier'

// Fix globals bug: some keys have trailing whitespace
const browserGlobals = Object.fromEntries(
  Object.entries(globals.browser).map(([key, value]) => [key.trim(), value])
)

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/vite.config.ts'
    ]
  },

  // -------------------------------------------------------------
  // Frontend TypeScript + React config
  // -------------------------------------------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        ...browserGlobals
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      // Pull in all recommended + strict TS rules
      ...js.configs.recommended.rules,
      ...tsPlugin.configs['recommended'].rules,
      ...tsPlugin.configs['recommended-type-checked'].rules,
      ...tsPlugin.configs['stylistic-type-checked'].rules,

      // -----------------------------
      //     SENSIBLE STRICT RULES
      // -----------------------------

      // Prevent sloppy code paths
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Avoid silent bugs
      '@typescript-eslint/no-unnecessary-condition': 'off', // Allow defensive null checks
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],

      // Real-world strictness
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': ['warn', { fixToUnknown: false }],
      '@typescript-eslint/no-non-null-assertion': 'off', // Allow ! after validation checks

      // Browser correctness
      'no-restricted-globals': ['error', 'event', 'fdescribe'],

      // Safer equality
      eqeqeq: ['error', 'always'],

      // Clean imports
      'no-unused-vars': 'off',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],

      // Promises must be handled
      'no-void': ['error', { allowAsStatement: true }],

      // Unified logging: all logging must go through @wolffm/logger.
      // No console.* — it bypasses dev/admin gating + telemetry.
      'no-console': 'error',

      // Allow intentional || for empty strings and falsy values
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off'
    }
  },

  // -------------------------------------------------------------
  // Cloudflare Worker API config
  // -------------------------------------------------------------
  {
    files: ['worker/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.serviceworker,
        ...globals.node
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs['recommended'].rules,
      // TS already checks for undefined identifiers; no-undef double-flags
      // ambient Workers globals (env bindings, etc.).
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Unified logging: all logging must go through @wolffm/logger/worker.
      'no-console': 'error'
    }
  },

  // -------------------------------------------------------------
  // PRETTIER OVERRIDES (must be last)
  // -------------------------------------------------------------
  prettierConfig
]
