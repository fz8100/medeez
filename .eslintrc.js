/**
 * ESLint Configuration for Medeez v2
 * HIPAA-compliant code quality rules with security focus
 */

module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    '@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/strict',
    'plugin:security/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json', './apps/*/tsconfig.json'],
  },
  plugins: [
    '@typescript-eslint',
    'security',
    'import',
    'prefer-arrow',
    'unused-imports',
  ],
  rules: {
    // Security Rules (HIPAA Compliance)
    'security/detect-object-injection': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-unsafe-regex': 'error',
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'warn',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-require': 'warn',
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-pseudoRandomBytes': 'error',

    // TypeScript Rules
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/require-await': 'error',

    // Import Rules
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
        ],
        'newlines-between': 'always',
      },
    ],
    'import/no-unresolved': 'error',
    'import/no-cycle': 'error',
    'import/no-unused-modules': 'warn',

    // General Code Quality
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow/prefer-arrow-functions': [
      'warn',
      {
        disallowPrototype: true,
        singleReturnOnly: false,
        classPropertiesAllowed: false,
      },
    ],

    // Unused Imports
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],

    // HIPAA and PHI Protection Rules
    'no-hardcoded-credentials': 'off', // Handled by security plugin
    'no-secrets': 'off', // Would need custom plugin

    // Performance Rules
    'no-await-in-loop': 'warn',
    'prefer-template': 'error',
    
    // Error Handling
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',
  },
  overrides: [
    // Frontend-specific rules
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      extends: [
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:jsx-a11y/recommended',
        'plugin:@next/next/recommended',
      ],
      plugins: ['react', 'react-hooks', 'jsx-a11y'],
      settings: {
        react: {
          version: 'detect',
        },
      },
      rules: {
        // React Rules
        'react/react-in-jsx-scope': 'off', // Next.js doesn't need this
        'react/prop-types': 'off', // Using TypeScript
        'react/jsx-props-no-spreading': 'warn',
        'react/jsx-no-bind': 'warn',
        'react/jsx-no-leaked-render': 'error',
        'react/no-array-index-key': 'warn',
        
        // React Hooks Rules
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
        
        // Accessibility Rules (HIPAA Compliance)
        'jsx-a11y/alt-text': 'error',
        'jsx-a11y/aria-props': 'error',
        'jsx-a11y/aria-proptypes': 'error',
        'jsx-a11y/aria-unsupported-elements': 'error',
        'jsx-a11y/role-has-required-aria-props': 'error',
        'jsx-a11y/role-supports-aria-props': 'error',
        'jsx-a11y/tabindex-no-positive': 'error',
        'jsx-a11y/label-has-associated-control': 'error',
        'jsx-a11y/no-autofocus': 'warn',
      },
    },
    
    // API-specific rules
    {
      files: ['apps/api/**/*.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'error',
        'security/detect-object-injection': 'error',
        'no-console': ['error', { allow: ['error'] }], // Stricter for API
      },
    },
    
    // Test files
    {
      files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/__tests__/**'],
      env: {
        jest: true,
      },
      extends: ['plugin:jest/recommended'],
      plugins: ['jest'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'security/detect-object-injection': 'off',
        'no-console': 'off',
        'jest/expect-expect': 'error',
        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'error',
        'jest/no-identical-title': 'error',
        'jest/prefer-to-have-length': 'warn',
        'jest/valid-expect': 'error',
      },
    },
    
    // E2E test files
    {
      files: ['tests/e2e/**/*.{ts,js}'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'security/detect-non-literal-regexp': 'off',
        'no-console': 'off',
      },
    },
    
    // Configuration files
    {
      files: [
        '*.config.{js,ts}',
        '.eslintrc.js',
        'jest.config.js',
        'playwright.config.ts',
      ],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: ['./tsconfig.json', './apps/*/tsconfig.json'],
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
  ignorePatterns: [
    'dist/',
    'build/',
    '.next/',
    'coverage/',
    'node_modules/',
    '*.min.js',
    'public/',
    'playwright-report/',
    'test-results/',
  ],
};