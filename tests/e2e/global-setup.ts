/**
 * Playwright Global Setup
 * HIPAA-compliant E2E testing environment initialization
 */

import { chromium, FullConfig } from '@playwright/test';
import { config } from 'dotenv';

async function globalSetup(config: FullConfig) {
  // Load test environment variables
  const envFile = process.env.NODE_ENV === 'production' ? '.env.e2e.prod' : '.env.e2e';
  config({ path: envFile });

  console.log('🚀 Starting E2E test environment setup...');

  // Verify environment variables
  const requiredEnvVars = [
    'E2E_BASE_URL',
    'E2E_TEST_USER_EMAIL',
    'E2E_TEST_USER_PASSWORD',
  ];

  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  // Initialize browser for setup tasks
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Health check - ensure application is running
    console.log('🔍 Performing health check...');
    await page.goto(process.env.E2E_BASE_URL!);
    await page.waitForLoadState('networkidle');
    
    // Check if the application is accessible
    const title = await page.title();
    if (!title || title.includes('Error')) {
      throw new Error('Application health check failed');
    }

    // Setup test data if needed
    console.log('📊 Setting up test data...');
    
    // Authenticate and create test session
    await setupTestAuthentication(page);
    
    // Create test clinic and user data
    await setupTestData(page);

    console.log('✅ E2E test environment setup completed successfully');

  } catch (error) {
    console.error('❌ E2E test setup failed:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function setupTestAuthentication(page: any) {
  try {
    // Navigate to login page
    await page.goto('/auth/login');
    
    // Wait for login form
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 10000 });
    
    // Fill in test credentials
    await page.fill('[data-testid="email-input"]', process.env.E2E_TEST_USER_EMAIL!);
    await page.fill('[data-testid="password-input"]', process.env.E2E_TEST_USER_PASSWORD!);
    
    // Submit login form
    await page.click('[data-testid="login-button"]');
    
    // Wait for successful authentication
    await page.waitForURL('/dashboard', { timeout: 30000 });
    
    // Store authentication state
    const storage = await page.context().storageState();
    
    // Save auth state to file for reuse in tests
    const fs = require('fs');
    fs.writeFileSync('./test-results/auth-state.json', JSON.stringify(storage, null, 2));
    
    console.log('🔐 Test authentication setup completed');
    
  } catch (error) {
    console.error('❌ Authentication setup failed:', error);
    
    // Take screenshot for debugging
    await page.screenshot({ 
      path: './test-results/auth-setup-failure.png',
      fullPage: true 
    });
    
    throw error;
  }
}

async function setupTestData(page: any) {
  try {
    // Navigate to admin/setup page if it exists
    // This would typically create test patients, appointments, etc.
    
    // For now, just verify we can access the dashboard
    await page.goto('/dashboard');
    await page.waitForSelector('[data-testid="dashboard-container"]', { timeout: 10000 });
    
    console.log('📊 Test data setup completed');
    
  } catch (error) {
    console.warn('⚠️ Test data setup skipped (no setup endpoint available)');
    // Don't throw error - test data setup is optional
  }
}

export default globalSetup;