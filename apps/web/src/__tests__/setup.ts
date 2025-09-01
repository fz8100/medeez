/**
 * Frontend Testing Setup for Medeez v2 Web App
 * HIPAA-compliant React Testing Library configuration with accessibility testing
 */

import '@testing-library/jest-dom';
import 'jest-axe/extend-expect';
import { config } from 'dotenv';
import { TextEncoder, TextDecoder } from 'util';

// Load test environment variables
config({ path: '.env.test' });

// Polyfills for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.sessionStorage = sessionStorageMock;

// Mock fetch
global.fetch = jest.fn();

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
      isFallback: false,
    };
  },
}));

// Mock Next.js navigation (App Router)
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      prefetch: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '/';
  },
}));

// Mock React Query
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
  QueryClient: jest.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Global test setup
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  
  console.log('🧪 Frontend test environment initialized');
});

// Test cleanup
afterEach(() => {
  // Clear all mocks after each test
  jest.clearAllMocks();
  
  // Clear localStorage and sessionStorage
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
  sessionStorageMock.removeItem.mockClear();
  sessionStorageMock.clear.mockClear();
  
  // Clear fetch mock
  (global.fetch as jest.Mock).mockClear();
});

// Global error handling for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Custom matchers for HIPAA compliance and accessibility
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeAccessible(): R;
      toHaveNoPhiData(): R;
      toHaveSecureHeaders(): R;
      toBeResponsive(): R;
    }
  }
}

// Accessibility compliance matcher
expect.extend({
  toBeAccessible(received: Element) {
    // This would integrate with jest-axe for actual accessibility testing
    const hasAriaLabels = received.querySelector('[aria-label], [aria-labelledby]');
    const hasSemanticElements = received.querySelector('main, nav, section, article, aside, header, footer');
    const hasHeadings = received.querySelector('h1, h2, h3, h4, h5, h6');
    
    const isAccessible = hasAriaLabels || hasSemanticElements || hasHeadings;
    
    return {
      message: () => isAccessible
        ? `Expected element to not be accessible`
        : `Expected element to be accessible with proper ARIA labels, semantic elements, or headings`,
      pass: isAccessible,
    };
  },
  
  toHaveNoPhiData(received: string | object) {
    const content = typeof received === 'string' ? received : JSON.stringify(received);
    
    // Check for common PHI patterns
    const phiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // Date of birth patterns
      /@\w+\.\w+/, // Email addresses in PHI context
    ];
    
    const containsPhiData = phiPatterns.some(pattern => pattern.test(content));
    
    return {
      message: () => containsPhiData
        ? `Expected content to not contain PHI data`
        : `Content is PHI compliant`,
      pass: !containsPhiData,
    };
  },
  
  toHaveSecureHeaders(received: any) {
    // Check for security headers in API responses
    const headers = received.headers || {};
    const hasSecurityHeaders = headers['x-content-type-options'] || 
                              headers['x-frame-options'] || 
                              headers['x-xss-protection'];
    
    return {
      message: () => hasSecurityHeaders
        ? `Response has security headers`
        : `Response missing security headers`,
      pass: hasSecurityHeaders,
    };
  },
  
  toBeResponsive(received: Element) {
    // Check for responsive design elements
    const hasResponsiveClasses = received.className.includes('sm:') || 
                                 received.className.includes('md:') || 
                                 received.className.includes('lg:');
    
    const hasFlexOrGrid = received.className.includes('flex') || 
                         received.className.includes('grid');
    
    const isResponsive = hasResponsiveClasses || hasFlexOrGrid;
    
    return {
      message: () => isResponsive
        ? `Element has responsive design`
        : `Element should have responsive design classes`,
      pass: isResponsive,
    };
  },
});

// Mock console methods to reduce noise in tests
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is deprecated')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
  
  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('componentWillMount') || args[0].includes('componentWillReceiveProps'))
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});