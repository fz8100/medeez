/**
 * Prettier Configuration for Medeez v2
 * Consistent code formatting across the entire codebase
 */

module.exports = {
  // Basic formatting
  semi: true,
  trailingComma: 'es5',
  singleQuote: true,
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  
  // JSX specific
  jsxSingleQuote: false,
  jsxBracketSameLine: false,
  
  // Other options
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
  quoteProps: 'as-needed',
  
  // File-specific overrides
  overrides: [
    {
      files: '*.md',
      options: {
        printWidth: 100,
        proseWrap: 'always',
      },
    },
    {
      files: '*.json',
      options: {
        printWidth: 120,
      },
    },
    {
      files: '*.yml',
      options: {
        tabWidth: 2,
        singleQuote: false,
      },
    },
  ],
};