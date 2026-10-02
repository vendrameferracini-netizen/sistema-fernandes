export function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_INPUT');
  const username = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,39}$/.test(username)) throw new Error('INVALID_INPUT');
  return username;
}
export function validateSecret(value: unknown, initial = true): string {
  if (typeof value !== 'string' || value.length < (initial ? 12 : 1) || value.length > 128) throw new Error('INVALID_INPUT');
  return value; // Never trim or normalize a password.
}
export function verifiedSessionId(token: string): string {
  // Call only AFTER getUser(token) or successful Auth signInWithPassword.
  const segment = token.split('.')[1];
  if (!segment) throw new Error('UNAUTHORIZED');
  const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/')));
  if (!/^[0-9a-f-]{36}$/i.test(payload.session_id ?? '')) throw new Error('UNAUTHORIZED');
  return payload.session_id;
}
