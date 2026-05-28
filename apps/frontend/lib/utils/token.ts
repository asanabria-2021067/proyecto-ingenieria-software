export function setTokens(accessToken: string, refreshToken: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('token', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refreshToken');
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
}

export function getTokenExpiration(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

export function getTimeUntilExpiry(token: string): number | null {
  const exp = getTokenExpiration(token);
  if (!exp) return null;
  return exp - Date.now();
}

export function shouldShowExpiryWarning(token: string): boolean {
  const timeLeft = getTimeUntilExpiry(token);
  if (!timeLeft) return false;
  return timeLeft > 0 && timeLeft <= 5 * 60 * 1000;
}
