# Medeez v2 Testing Documentation

## Overview

This document outlines the comprehensive testing strategy for Medeez v2, a HIPAA-compliant solo doctor practice management system. Our testing approach ensures security, compliance, performance, and accessibility across all components.

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Test Types](#test-types)
3. [HIPAA Compliance Testing](#hipaa-compliance-testing)
4. [Setup and Configuration](#setup-and-configuration)
5. [Running Tests](#running-tests)
6. [Test Coverage Requirements](#test-coverage-requirements)
7. [Security Testing](#security-testing)
8. [Performance Testing](#performance-testing)
9. [Accessibility Testing](#accessibility-testing)
10. [CI/CD Pipeline](#cicd-pipeline)
11. [Test Data Management](#test-data-management)
12. [Troubleshooting](#troubleshooting)

## Testing Strategy

### Core Principles

1. **HIPAA Compliance First**: All tests ensure PHI protection and security
2. **Security by Default**: Every component tested for vulnerabilities
3. **Accessibility**: WCAG 2.1 AA compliance testing
4. **Performance**: Response time and load testing
5. **Tenant Isolation**: Multi-tenant security validation
6. **Audit Logging**: Complete audit trail testing

### Test Pyramid

```
     /\
    /  \     E2E Tests (5-10%)
   /____\    
  /      \   Integration Tests (20-30%)
 /________\  
/          \ Unit Tests (60-75%)
\__________/
```

## Test Types

### 1. Unit Tests

**Location**: `apps/api/src/__tests__/**/*.test.ts`, `apps/web/src/__tests__/**/*.test.tsx`

**Technology**: Jest + React Testing Library

**Coverage**: Individual functions, components, and modules

**Examples**:
- Authentication middleware
- Tenant isolation middleware
- Patient data repositories
- React components
- Utility functions

### 2. Integration Tests

**Location**: `apps/api/src/__tests__/integration/**/*.test.ts`

**Technology**: Jest + Supertest

**Coverage**: API endpoints, database interactions, third-party integrations

**Examples**:
- API endpoint workflows
- Database operations
- AWS service integrations
- Email sending
- File upload/download

### 3. End-to-End Tests

**Location**: `tests/e2e/**/*.spec.ts`

**Technology**: Playwright

**Coverage**: Complete user workflows

**Examples**:
- User authentication flow
- Patient management lifecycle
- Appointment scheduling
- SOAP note creation
- Invoice generation and billing

### 4. Security Tests

**Location**: `tests/security/**/*.test.ts`

**Technology**: Custom security testing framework

**Coverage**: Vulnerability assessment and penetration testing

**Examples**:
- SQL injection prevention
- XSS protection
- Authentication bypass attempts
- Authorization escalation
- Rate limiting enforcement

### 5. Performance Tests

**Location**: `tests/performance/**/*.js`

**Technology**: k6

**Coverage**: Load testing and performance benchmarking

**Examples**:
- API endpoint performance
- Database query optimization
- Concurrent user handling
- File upload performance
- Dashboard loading times

## HIPAA Compliance Testing

### PHI Protection

- **Data Sanitization**: Ensure no PHI in logs or error messages
- **Encryption**: Validate data encryption at rest and in transit
- **Access Controls**: Test user permissions and role-based access
- **Audit Logging**: Verify comprehensive audit trails
- **Data Retention**: Test data lifecycle management

### Tenant Isolation

- **Cross-Tenant Access**: Prevent access to other clinics' data
- **Data Segregation**: Validate complete data separation
- **User Context**: Ensure proper tenant context throughout requests

### Security Requirements

- **Authentication**: Multi-factor authentication testing
- **Session Management**: Session timeout and security
- **API Security**: Rate limiting and input validation
- **File Security**: Upload validation and malware scanning

## Setup and Configuration

### Prerequisites

```bash
# Install Node.js 18+
node --version # Should be 18.x or higher

# Install pnpm
npm install -g pnpm@8.15.0

# Install dependencies
pnpm install
```

### Environment Setup

#### API Testing

```bash
# Copy test environment
cp apps/api/.env.test apps/api/.env

# Set required variables
export NODE_ENV=test
export JWT_SECRET=test-jwt-secret-key-for-testing-only
```

#### Frontend Testing

```bash
# Copy test environment
cp apps/web/.env.test apps/web/.env.local

# Set required variables
export NEXT_PUBLIC_NODE_ENV=test
export NEXT_PUBLIC_API_URL=http://localhost:3001
```

#### E2E Testing

```bash
# Copy E2E environment
cp .env.e2e .env

# Set test credentials
export E2E_TEST_USER_EMAIL=test@example.com
export E2E_TEST_USER_PASSWORD=TestPassword123!
```

### Database Setup (for Integration Tests)

```bash
# Start PostgreSQL test database
docker run -d \
  --name medeez-test-db \
  -e POSTGRES_DB=medeez_test \
  -e POSTGRES_USER=testuser \
  -e POSTGRES_PASSWORD=testpass \
  -p 5433:5432 \
  postgres:15

# Run database migrations
pnpm --filter @medeez/api db:migrate:test
```

## Running Tests

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Run API unit tests
pnpm --filter @medeez/api test

# Run frontend unit tests
pnpm --filter @medeez/web test

# Watch mode
pnpm --filter @medeez/api test:watch

# Coverage report
pnpm --filter @medeez/api test:coverage
```

### Integration Tests

```bash
# Run integration tests
pnpm --filter @medeez/api test:integration

# Run specific integration test
pnpm --filter @medeez/api test:integration --testNamePattern="Patient API"
```

### Security Tests

```bash
# Run security test suite
pnpm --filter @medeez/api test:security

# Run specific security tests
pnpm test tests/security/authentication.test.ts
```

### End-to-End Tests

```bash
# Install Playwright browsers
pnpm dlx playwright install

# Run all E2E tests
pnpm dlx playwright test

# Run specific browser
pnpm dlx playwright test --project=chromium

# Run with UI mode
pnpm dlx playwright test --ui

# Run specific test file
pnpm dlx playwright test tests/e2e/auth.spec.ts

# Generate test report
pnpm dlx playwright show-report
```

### Performance Tests

```bash
# Install k6
# Linux/MacOS
brew install k6

# Windows
winget install k6

# Run load tests
k6 run tests/performance/load-testing.js

# Run with custom config
k6 run -e API_BASE_URL=https://api.staging.medeez.com tests/performance/load-testing.js
```

## Test Coverage Requirements

### Overall Coverage Targets

| Component | Branches | Functions | Lines | Statements |
|-----------|----------|-----------|-------|------------|
| **API (General)** | 80% | 80% | 80% | 80% |
| **Frontend (General)** | 75% | 75% | 75% | 75% |

### Critical Component Coverage (95%+ Required)

#### API Security Components
- `middleware/authMiddleware.ts`
- `middleware/tenantMiddleware.ts` 
- `middleware/auditLogger.ts`
- `middleware/permissionMiddleware.ts`
- `repositories/base.ts` (security methods)

#### Frontend Security Components
- `components/auth/**/*.tsx`
- `hooks/useAuth.ts`
- `lib/auth.ts`
- `lib/api.ts` (security headers)

### Viewing Coverage Reports

```bash
# Generate and view API coverage
pnpm --filter @medeez/api test:coverage
open apps/api/coverage/lcov-report/index.html

# Generate and view frontend coverage
pnpm --filter @medeez/web test:coverage
open apps/web/coverage/lcov-report/index.html
```

## Security Testing

### Automated Security Scans

```bash
# Dependency vulnerability audit
pnpm audit

# Advanced security audit
pnpm dlx audit-ci --moderate

# ESLint security rules
pnpm lint --config .eslintrc.security.js
```

### Manual Security Testing

#### Authentication Testing
- Invalid credentials
- Token expiration
- Session hijacking attempts
- Rate limiting bypass

#### Authorization Testing
- Role escalation attempts
- Cross-tenant access
- Permission boundary testing
- API endpoint access control

#### Input Validation Testing
- SQL injection attempts
- XSS payload injection
- File upload validation
- Request size limits

### HIPAA Compliance Validation

```bash
# Run HIPAA compliance test suite
pnpm test:hipaa-compliance

# Validate PHI handling
pnpm test --testNamePattern="PHI"

# Audit logging validation
pnpm test --testNamePattern="audit"
```

## Performance Testing

### Load Testing Scenarios

#### Scenario 1: Normal Load
- **Users**: 10-20 concurrent
- **Duration**: 10 minutes
- **Target**: <1.5s response time

#### Scenario 2: Peak Load
- **Users**: 50-100 concurrent  
- **Duration**: 15 minutes
- **Target**: <2s response time

#### Scenario 3: Stress Test
- **Users**: 100+ concurrent
- **Duration**: 5 minutes
- **Target**: System stability

### Performance Thresholds

```javascript
// k6 thresholds configuration
thresholds: {
  http_req_duration: ['p(95)<2000'], // 95% under 2s
  http_req_failed: ['rate<0.1'],     // <10% errors
  http_req_rate: ['rate>10'],        // >10 req/s
}
```

### Database Performance

```bash
# Database query analysis
EXPLAIN ANALYZE SELECT * FROM patients WHERE clinic_id = $1;

# Index usage validation
pnpm --filter @medeez/api test:db-performance
```

## Accessibility Testing

### Automated Accessibility Tests

```bash
# Run accessibility tests
pnpm --filter @medeez/web test --testPathPattern=accessibility

# Axe-core integration
pnpm dlx playwright test tests/e2e/accessibility.spec.ts
```

### Manual Accessibility Testing

#### Keyboard Navigation
- Tab order validation
- Focus management
- Skip links functionality
- Keyboard shortcuts

#### Screen Reader Testing
- ARIA labels and roles
- Semantic HTML structure
- Alternative text for images
- Form field descriptions

#### Color Contrast Testing
- WCAG AA compliance (4.5:1 ratio)
- Color-blind accessibility
- High contrast mode support

### Accessibility Tools

```bash
# Install accessibility testing tools
npm install -g @axe-core/cli lighthouse

# Run Lighthouse accessibility audit
lighthouse http://localhost:3000 --only-categories=accessibility

# Run axe-core CLI
axe http://localhost:3000
```

## CI/CD Pipeline

### GitHub Actions Workflow

The CI/CD pipeline runs automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

### Pipeline Stages

1. **Security Scan**
   - Dependency vulnerability check
   - Code security analysis
   - SARIF report generation

2. **Code Quality**
   - TypeScript compilation
   - ESLint validation
   - Prettier formatting check

3. **Unit Testing**
   - API unit tests
   - Frontend unit tests
   - Coverage reporting

4. **Integration Testing**
   - API integration tests
   - Database testing
   - Third-party service mocks

5. **End-to-End Testing**
   - Complete user workflows
   - Cross-browser testing
   - Mobile responsiveness

6. **Performance Testing**
   - Load testing with k6
   - Performance threshold validation
   - Resource usage monitoring

7. **Deployment**
   - Staging deployment (develop branch)
   - Production deployment (main branch)
   - Smoke testing post-deployment

8. **HIPAA Compliance Report**
   - Compliance status summary
   - Security test results
   - Audit trail validation

### Pipeline Configuration

```yaml
# .github/workflows/ci-cd.yml
name: 'Medeez v2 CI/CD Pipeline'
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

### Environment Secrets

Required GitHub Secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`  
- `E2E_TEST_USER_EMAIL`
- `E2E_TEST_USER_PASSWORD`
- `STAGING_URL`
- `PRODUCTION_URL`

## Test Data Management

### HIPAA-Compliant Test Data

All test data is synthetic and HIPAA-compliant:

```typescript
// Test data factories
const testPatient = createTestPatient({
  firstName: 'TestPatient123',  // No real names
  lastName: 'LastName456',
  dateOfBirth: '1990-01-01',   // Fixed test date
  email: 'test@example.com',   // Test domain
  phone: '+1-555-TEST-001'     // Test phone pattern
});
```

### Data Isolation

- **Tenant Separation**: Each test uses unique clinic IDs
- **Test Cleanup**: Automatic cleanup after test completion
- **No Cross-Contamination**: Tests don't affect each other
- **Mock Services**: External APIs are mocked in tests

### Test Database

```bash
# Create test database
createdb medeez_test

# Run test migrations
pnpm --filter @medeez/api db:migrate:test

# Seed test data
pnpm --filter @medeez/api db:seed:test

# Reset test database
pnpm --filter @medeez/api db:reset:test
```

## Troubleshooting

### Common Issues

#### Test Database Connection
```bash
# Check database status
pg_isready -h localhost -p 5432

# Reset connection
pnpm --filter @medeez/api db:reset:test
```

#### Playwright Browser Issues
```bash
# Reinstall browsers
pnpm dlx playwright install --force

# Clear browser cache
rm -rf ~/.cache/ms-playwright
```

#### Jest Memory Issues
```bash
# Run with increased memory
NODE_OPTIONS="--max-old-space-size=4096" pnpm test
```

#### Port Conflicts
```bash
# Check port usage
lsof -i :3000
lsof -i :3001

# Kill processes
kill -9 $(lsof -t -i:3000)
```

### Debug Mode

```bash
# Debug API tests
DEBUG=true pnpm --filter @medeez/api test

# Debug E2E tests with browser
pnpm dlx playwright test --debug

# Verbose Jest output
pnpm test --verbose --no-coverage
```

### Log Analysis

```bash
# View API test logs
tail -f apps/api/logs/test.log

# View E2E test artifacts
ls -la test-results/
ls -la playwright-report/
```

## Best Practices

### Writing Tests

1. **Descriptive Names**: Use clear, descriptive test names
2. **Arrange-Act-Assert**: Follow AAA pattern
3. **Single Responsibility**: One assertion per test
4. **Test Independence**: Tests should not depend on each other
5. **Mock External Dependencies**: Use mocks for third-party services

### HIPAA Compliance

1. **No Real PHI**: Never use real patient data in tests
2. **Data Sanitization**: Verify PHI is not logged
3. **Security First**: Test security controls rigorously
4. **Audit Everything**: Ensure audit logging works correctly

### Performance Optimization

1. **Parallel Execution**: Run tests in parallel when safe
2. **Test Caching**: Use Jest cache for faster runs
3. **Selective Testing**: Run only relevant tests during development
4. **Resource Management**: Clean up resources after tests

## Maintenance

### Regular Tasks

- **Weekly**: Review test coverage reports
- **Monthly**: Update test dependencies
- **Quarterly**: Full security test audit
- **Annually**: HIPAA compliance review

### Monitoring

- Test execution time tracking
- Flaky test identification
- Coverage trend analysis
- Security vulnerability tracking

---

For additional support or questions about testing, please refer to the development team or create an issue in the project repository.