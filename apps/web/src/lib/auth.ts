export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  localStorage.setItem('access_token', token);
  // Also set as cookie so Next.js middleware can read it for SSR route protection
  document.cookie = `access_token=${token}; path=/; max-age=900; samesite=strict`;
}

export function clearAccessToken(): void {
  localStorage.removeItem('access_token');
  // Clear the cookie too
  document.cookie = 'access_token=; path=/; max-age=0';
}
