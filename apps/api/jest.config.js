/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/lambda/**/*.ts', // Lambda functions tested separately
    '!src/types/**/*.ts',
    '!src/**/*.interface.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
  ],
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary',
    'cobertura'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 30000,
  maxWorkers: '50%',
  bail: false,
  verbose: true,
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
      isolatedModules: true,
    },
  },
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  // Security and HIPAA compliance requirements
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    // Critical HIPAA modules require 95% coverage
    './src/middleware/auditLogger.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/middleware/authMiddleware.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/middleware/tenantMiddleware.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/middleware/permissionMiddleware.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  collectCoverageReports: true,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
};