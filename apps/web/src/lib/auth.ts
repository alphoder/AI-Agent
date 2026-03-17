export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export function setAccessToken(token: string): void {
  localStorage.setItem('access_token', token);
}

export function clearAccessToken(): void {
  localStorage.removeItem('access_token');
}
