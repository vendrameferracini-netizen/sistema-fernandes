import { describe, expect, it } from 'vitest';
import { authMessage, homeFor, validatePassword } from '../src/modules/auth/model';

describe('access decisions', () => {
  it('never routes a missing or inactive profile to a dashboard', () => {
    expect(homeFor(null)).toBe('/acesso');
    expect(homeFor({ id: '1', full_name: 'Coach', role: 'admin', active: false })).toBe('/acesso');
  });
  it('separates administrator and student home', () => {
    expect(homeFor({ id: '1', full_name: 'Coach', role: 'admin', active: true })).toBe('/admin');
    expect(homeFor({ id: '2', full_name: 'Aluno', role: 'student', active: true })).toBe('/aluno');
  });
  it('requires a long and confirmed password', () => {
    expect(validatePassword('short', 'short')).toBeTruthy();
    expect(validatePassword('long-password-123', 'other-password-123')).toBeTruthy();
    expect(validatePassword('long-password-123', 'long-password-123')).toBeNull();
  });
  it('does not display backend exception details', () => {
    expect(authMessage(new Error('private database information'))).not.toContain('database');
    expect(authMessage({ code: 'invalid_credentials' })).toContain('incorretos');
  });
});
