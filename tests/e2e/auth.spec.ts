/**
 * Authentication E2E Tests
 * HIPAA-compliant authentication flow testing with comprehensive security validation
 */

import { test, expect, Page } from '@playwright/test';

test.describe('Authentication System', () => {
  test.beforeEach(async ({ page }) => {
    // Start from login page
    await page.goto('/auth/login');
  });

  test.describe('Login Flow', () => {
    test('should display login form with proper security headers', async ({ page }) => {
      // Verify page loads
      await expect(page).toHaveTitle(/Medeez/);
      
      // Check security headers
      const response = await page.waitForResponse(response => 
        response.url().includes('/auth/login') && response.request().method() === 'GET'
      );
      
      expect(response.headers()['x-frame-options']).toBeTruthy();
      expect(response.headers()['x-content-type-options']).toBe('nosniff');
      
      // Verify login form elements
      await expect(page.getByTestId('login-form')).toBeVisible();
      await expect(page.getByTestId('email-input')).toBeVisible();
      await expect(page.getByTestId('password-input')).toBeVisible();
      await expect(page.getByTestId('login-button')).toBeVisible();
      
      // Check for HIPAA compliance notice
      await expect(page.getByText(/HIPAA/i)).toBeVisible();
    });

    test('should successfully login with valid credentials', async ({ page }) => {
      // Fill login form
      await page.fill('[data-testid="email-input"]', process.env.E2E_TEST_USER_EMAIL!);
      await page.fill('[data-testid="password-input"]', process.env.E2E_TEST_USER_PASSWORD!);
      
      // Submit form
      await page.click('[data-testid="login-button"]');
      
      // Wait for successful login redirect
      await expect(page).toHaveURL(/\/dashboard/);
      
      // Verify user is logged in
      await expect(page.getByTestId('user-menu')).toBeVisible();
      await expect(page.getByTestId('dashboard-container')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      // Fill with invalid credentials
      await page.fill('[data-testid="email-input"]', 'invalid@example.com');
      await page.fill('[data-testid="password-input"]', 'wrongpassword');
      
      // Submit form
      await page.click('[data-testid="login-button"]');
      
      // Check for error message
      await expect(page.getByTestId('login-error')).toBeVisible();
      await expect(page.getByTestId('login-error')).toContainText(/Invalid/i);
      
      // Ensure user stays on login page
      await expect(page).toHaveURL(/\/auth\/login/);
    });

    test('should validate email format', async ({ page }) => {
      // Fill with invalid email format
      await page.fill('[data-testid="email-input"]', 'invalid-email');
      await page.fill('[data-testid="password-input"]', 'password123');
      
      // Try to submit
      await page.click('[data-testid="login-button"]');
      
      // Check for validation error
      const emailInput = page.getByTestId('email-input');
      const validationMessage = await emailInput.getAttribute('data-validation-error');
      expect(validationMessage).toBeTruthy();
    });

    test('should require both email and password', async ({ page }) => {
      // Try to submit empty form
      await page.click('[data-testid="login-button"]');
      
      // Check that form doesn't submit
      await expect(page).toHaveURL(/\/auth\/login/);
      
      // Check for validation messages
      await expect(page.getByText(/required/i).first()).toBeVisible();
    });
  });

  test.describe('Security Features', () => {
    test('should implement rate limiting', async ({ page, context }) => {
      // Make multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        await page.fill('[data-testid="email-input"]', `test${i}@example.com`);
        await page.fill('[data-testid="password-input"]', 'wrongpassword');
        await page.click('[data-testid="login-button"]');
        
        // Wait for response
        await page.waitForTimeout(500);
      }
      
      // Check for rate limiting message
      await expect(page.getByText(/too many attempts/i)).toBeVisible();
    });

    test('should not expose sensitive information in errors', async ({ page }) => {
      // Fill with non-existent email
      await page.fill('[data-testid="email-input"]', 'nonexistent@example.com');
      await page.fill('[data-testid="password-input"]', 'password123');
      
      await page.click('[data-testid="login-button"]');
      
      // Check error message doesn't reveal if user exists
      const errorText = await page.getByTestId('login-error').textContent();
      expect(errorText?.toLowerCase()).not.toContain('user not found');
      expect(errorText?.toLowerCase()).not.toContain('account does not exist');
    });

    test('should clear form on page reload for security', async ({ page }) => {
      // Fill form
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'password123');
      
      // Reload page
      await page.reload();
      
      // Check form is cleared
      const emailValue = await page.getByTestId('email-input').inputValue();
      const passwordValue = await page.getByTestId('password-input').inputValue();
      
      expect(emailValue).toBe('');
      expect(passwordValue).toBe('');
    });
  });

  test.describe('Logout Flow', () => {
    test('should successfully logout user', async ({ page }) => {
      // Login first
      await loginUser(page);
      
      // Navigate to dashboard to verify login
      await expect(page.getByTestId('user-menu')).toBeVisible();
      
      // Click user menu
      await page.click('[data-testid="user-menu"]');
      
      // Click logout
      await page.click('[data-testid="logout-button"]');
      
      // Verify redirect to login page
      await expect(page).toHaveURL(/\/auth\/login/);
      
      // Verify user menu is no longer visible
      await expect(page.getByTestId('user-menu')).not.toBeVisible();
    });

    test('should clear session data on logout', async ({ page }) => {
      // Login first
      await loginUser(page);
      
      // Check that auth token is stored
      const tokenBefore = await page.evaluate(() => localStorage.getItem('auth-token'));
      expect(tokenBefore).toBeTruthy();
      
      // Logout
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      
      // Check that auth token is cleared
      const tokenAfter = await page.evaluate(() => localStorage.getItem('auth-token'));
      expect(tokenAfter).toBeNull();
    });
  });

  test.describe('Session Management', () => {
    test('should redirect to login when session expires', async ({ page }) => {
      // Login first
      await loginUser(page);
      
      // Navigate to protected page
      await page.goto('/patients');
      await expect(page.getByTestId('patients-list')).toBeVisible();
      
      // Simulate session expiry by clearing auth token
      await page.evaluate(() => localStorage.removeItem('auth-token'));
      
      // Try to navigate to another protected page
      await page.goto('/appointments');
      
      // Should redirect to login
      await expect(page).toHaveURL(/\/auth\/login/);
    });

    test('should maintain session across page refreshes', async ({ page }) => {
      // Login first
      await loginUser(page);
      
      // Navigate to protected page
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-container')).toBeVisible();
      
      // Refresh page
      await page.reload();
      
      // Should still be logged in
      await expect(page.getByTestId('dashboard-container')).toBeVisible();
      await expect(page.getByTestId('user-menu')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      // Tab through form elements
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('email-input')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('password-input')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('login-button')).toBeFocused();
    });

    test('should have proper ARIA labels', async ({ page }) => {
      // Check form accessibility
      const emailInput = page.getByTestId('email-input');
      const passwordInput = page.getByTestId('password-input');
      const loginButton = page.getByTestId('login-button');
      
      await expect(emailInput).toHaveAttribute('aria-label');
      await expect(passwordInput).toHaveAttribute('aria-label');
      await expect(loginButton).toHaveAttribute('aria-label');
    });

    test('should announce errors to screen readers', async ({ page }) => {
      // Submit empty form
      await page.click('[data-testid="login-button"]');
      
      // Check for aria-live region with error
      const errorRegion = page.getByRole('alert');
      await expect(errorRegion).toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    test('should work on mobile devices', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Reload page
      await page.reload();
      
      // Check form is still usable
      await expect(page.getByTestId('login-form')).toBeVisible();
      await expect(page.getByTestId('email-input')).toBeVisible();
      await expect(page.getByTestId('password-input')).toBeVisible();
      await expect(page.getByTestId('login-button')).toBeVisible();
      
      // Test mobile login
      await page.fill('[data-testid="email-input"]', process.env.E2E_TEST_USER_EMAIL!);
      await page.fill('[data-testid="password-input"]', process.env.E2E_TEST_USER_PASSWORD!);
      await page.click('[data-testid="login-button"]');
      
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });
});

// Helper function to login user
async function loginUser(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[data-testid="email-input"]', process.env.E2E_TEST_USER_EMAIL!);
  await page.fill('[data-testid="password-input"]', process.env.E2E_TEST_USER_PASSWORD!);
  await page.click('[data-testid="login-button"]');
  await expect(page).toHaveURL(/\/dashboard/);
}