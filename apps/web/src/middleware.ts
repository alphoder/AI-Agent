import { NextRequest, NextResponse } from 'next/server';

// Routes that do not require authentication
const PUBLIC_PATHS = [
  '/login',
  '/sso',
  '/callback',
];

// Path prefixes that are always public (framework / infra)
const PUBLIC_PREFIXES = [
  '/api/',
  '/_next/',
  '/favicon.ico',
  // Static file extensions served from /public
];

const STATIC_EXTENSIONS = /\.(ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|otf|css|js|map)$/;

// Admin-only route prefixes (these map to the (admin) route group)
const ADMIN_PREFIXES = [
  '/overview',
  '/avatars',
  '/personas',
  '/scenarios',
  '/analytics',
  '/settings',
];

function isPublicPath(pathname: string): boolean {
  // Exact public paths (e.g. /login)
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return true;
  }

  // Infrastructure prefixes
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  // Static file extensions
  if (STATIC_EXTENSIONS.test(pathname)) {
    return true;
  }

  return false;
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

interface JWTPayload {
  sub?: string;
  role?: string;
  tenant_id?: string;
  exp?: number;
  [key: string]: unknown;
}

/**
 * Base64-decode a JWT payload segment.
 * No signature verification — the API layer is responsible for that.
 * Returns null if the token is malformed or expired.
 */
function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // JWT uses base64url encoding — replace URL-safe chars and pad
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    const decoded = atob(padded);
    const payload: JWTPayload = JSON.parse(decoded);

    // Reject tokens that are already expired (exp is in seconds)
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function extractToken(request: NextRequest): string | null {
  // 1. Check cookies first
  const cookieToken = request.cookies.get('access_token')?.value;
  if (cookieToken) return cookieToken;

  // 2. Fall back to Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Let public routes through without any checks
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = extractToken(request);
  const payload = token ? decodeJWT(token) : null;

  // No valid token → redirect to login, preserving the intended destination
  if (!payload) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only routes: enforce 'admin' role server-side (mistake #36)
  if (isAdminPath(pathname) && payload.role !== 'admin') {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.search = '';
    return NextResponse.redirect(dashboardUrl);
  }

  // Redirect admins away from learner-only routes to admin dashboard
  if (pathname === '/dashboard' && payload.role === 'admin') {
    const overviewUrl = request.nextUrl.clone();
    overviewUrl.pathname = '/overview';
    overviewUrl.search = '';
    return NextResponse.redirect(overviewUrl);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Match all request paths EXCEPT the ones that Next.js handles internally
   * or that we explicitly allow through in isPublicPath().
   * Using a negative lookahead here for the most common static asset paths
   * as an optimisation so the middleware function is not even invoked for them.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|otf|css|js|map)$).*)',
  ],
};
