import { NextRequest, NextResponse } from 'next/server';
import { jwtDecode } from 'jwt-decode';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/magic-link',
  '/privacy',
  '/terms',
  '/about',
  '/_next',
  '/favicon.ico',
  '/api/health',
];

// Routes that require specific roles
const ROLE_ROUTES = {
  '/admin': ['admin', 'system_admin'],
  '/system': ['system_admin'],
} as const;

interface JWTPayload {
  userId: string;
  email: string;
  role: 'doctor' | 'admin' | 'staff' | 'system_admin';
  clinicId: string;
  exp: number;
  iat: number;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check if route is public
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
  
  if (isPublicRoute) {
    // For auth pages, redirect if already authenticated
    if (pathname.startsWith('/auth/')) {
      const token = request.cookies.get('auth_token')?.value;
      
      if (token && isValidToken(token)) {
        const redirectUrl = new URL('/dashboard', request.url);
        return NextResponse.redirect(redirectUrl);
      }
    }
    
    return NextResponse.next();
  }

  // Check authentication
  const token = request.cookies.get('auth_token')?.value;
  
  if (!token || !isValidToken(token)) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check role-based access
  try {
    const payload = jwtDecode<JWTPayload>(token);
    
    for (const [route, allowedRoles] of Object.entries(ROLE_ROUTES)) {
      if (pathname.startsWith(route)) {
        if (!allowedRoles.includes(payload.role)) {
          const dashboardUrl = new URL('/dashboard', request.url);
          return NextResponse.redirect(dashboardUrl);
        }
        break;
      }
    }
  } catch (error) {
    console.error('Token validation error:', error);
    const loginUrl = new URL('/auth/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Add security headers
  const response = NextResponse.next();
  
  // HIPAA compliance headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  
  // CSP for medical application
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.medeez.com; " +
    "frame-src 'none'; " +
    "object-src 'none'; " +
    "base-uri 'self';"
  );
  
  // Add clinic context to request headers
  try {
    const payload = jwtDecode<JWTPayload>(token);
    response.headers.set('x-user-id', payload.userId);
    response.headers.set('x-user-role', payload.role);
    response.headers.set('x-clinic-id', payload.clinicId);
  } catch (error) {
    // Token is invalid, will be handled by auth check above
  }

  return response;
}

function isValidToken(token: string): boolean {
  try {
    const payload = jwtDecode<JWTPayload>(token);
    const isExpired = payload.exp * 1000 < Date.now();
    return !isExpired;
  } catch (error) {
    return false;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};