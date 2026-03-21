const TOKEN_KEY = "gpushare_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  const payload = parseToken();
  if (!payload) return false;
  return payload.exp * 1000 > Date.now();
}

interface TokenPayload {
  sub: string;
  role: string;
  exp: number;
}

export function parseToken(): TokenPayload | null {
  const token = getToken();
  if (!token) return null;
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64);
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}
