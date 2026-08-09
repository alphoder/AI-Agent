import { NextRequest, NextResponse } from 'next/server';

// Routes that do not require authentication.
const PUBLIC_PATHS = ['/', '/login'];

const PUBLIC_PREFIXES = ['/api/', '/_next/', '/favicon.ico'];
// Anything served straight out of public/. An extension missing here is not a subtle
// bug: the asset 307s to /login and the browser gets an HTML page where it wanted
// media, which surfaces as an unplayable video rather than as an auth redirect.
const STATIC_EXTENSIONS =
  /\.(ico|png|jpg|jpeg|gif|svg|webp|avif|woff|woff2|ttf|otf|css|js|map|mp4|webm|mov|m4v|ogv|mp3|wav|m4a|ogg|pdf|txt|xml|json|webmanifest)$/;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (STATIC_EXTENSIONS.test(pathname)) return true;
  return false;
}

interface JWTPayload {
  sub?: string;
  exp?: number;
  [key: string]: unknown;
}

function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload: JWTPayload = JSON.parse(atob(padded));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function extractToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get('access_token')?.value;
  if (cookieToken) return cookieToken;
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = extractToken(request);
  const payload = token ? decodeJWT(token) : null;

  if (!payload) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|otf|css|js|map)$).*)',
  ],
};
