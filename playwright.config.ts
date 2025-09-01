import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Testing Configuration for Medeez v2
 * HIPAA-compliant end-to-end testing with comprehensive security validation
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* Run tests in files in parallel */
  fullyParallel: false, // Disabled for HIPAA compliance - sequential for audit trail
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
    ['junit', { outputFile: 'test-results/e2e-junit.xml' }],
    ['line']
  ],
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Capture screenshots on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure for debugging */
    video: 'retain-on-failure',
    
    /* HIPAA Security Settings */
    ignoreHTTPSErrors: false,
    bypassCSP: false,
    
    /* Performance and reliability settings */
    actionTimeout: 30000,
    navigationTimeout: 30000,
    
    /* Locale and timezone for testing */
    locale: 'en-US',
    timezoneId: 'America/New_York',
    
    /* Accessibility testing */
    colorScheme: 'light',
    
    /* Extra HTTP headers */
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium-desktop',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },

    {
      name: 'firefox-desktop',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
    },

    {
      name: 'webkit-desktop',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
      },
    },

    /* Test against mobile viewports */
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
      },
    },
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
      },
    },

    /* Test against branded browsers */
    {
      name: 'microsoft-edge',
      use: { 
        ...devices['Desktop Edge'], 
        channel: 'msedge' 
      },
    },
    {
      name: 'google-chrome',
      use: { 
        ...devices['Desktop Chrome'], 
        channel: 'chrome' 
      },
    },

    /* Accessibility testing project */
    {
      name: 'accessibility',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: '**/*.accessibility.spec.ts',
    },

    /* Security testing project */
    {
      name: 'security',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: '**/*.security.spec.ts',
    },

    /* Performance testing project */
    {
      name: 'performance',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: '**/*.performance.spec.ts',
    },
  ],

  /* Global test setup and teardown */
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI ? undefined : {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
    },
  },

  /* Output directory for test artifacts */
  outputDir: 'test-results/',
  
  /* Timeout settings */
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  /* HIPAA and security configuration */
  preserveConsecutiveFailures: 3,
  maxFailures: process.env.CI ? 5 : undefined,
  
  /* Metadata for test reporting */
  metadata: {
    product: 'Medeez v2',
    environment: process.env.NODE_ENV || 'test',
    version: process.env.APP_VERSION || '2.0.0',
    hipaaCompliant: true,
    securityTesting: true,
    accessibilityTesting: true,
  },
});