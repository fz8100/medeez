const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testEnvironment: 'jsdom',
  moduleDirectories: ['node_modules', '<rootDir>/'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/styles/(.*)$': '<rootDir>/src/styles/$1',
    '^@/providers/(.*)$': '<rootDir>/src/providers/$1',
    '^@/store/(.*)$': '<rootDir>/src/store/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/types/**',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageDirectory: 'coverage',
  // HIPAA and security-critical components require higher coverage
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
    // Authentication and security components require 95% coverage
    './src/components/auth/**/*.{ts,tsx}': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/hooks/useAuth.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/lib/auth.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  testTimeout: 30000,
  maxWorkers: '50%',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
  // Security testing configuration
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);