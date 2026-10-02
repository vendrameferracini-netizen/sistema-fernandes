import { describe, expect, it } from 'vitest';
import { parseStudent } from '../supabase/functions/_shared/student';
const valid = { full_name: ' Aluno teste ', email: 'ALUNO@example.test', phone: '', birth_date: '2000-01-01', objective: '', start_date: '2026-09-23', notes: '' };
describe('server-side student validation', () => {
  it('normalizes identity without accepting client privilege fields', () => {
    const result = parseStudent({ ...valid, role: 'admin', actor: 'forged' });
    expect(result.full_name).toBe('Aluno teste'); expect(result.email).toBe('aluno@example.test');
    expect(result).not.toHaveProperty('role'); expect(result).not.toHaveProperty('actor');
  });
  it('rejects invalid dates and oversized notes', () => {
    expect(() => parseStudent({ ...valid, birth_date: '2026-02-30' })).toThrow();
    expect(() => parseStudent({ ...valid, birth_date: '2999-01-01' })).toThrow();
    expect(() => parseStudent({ ...valid, notes: 'a'.repeat(5001) })).toThrow();
  });
  it('rejects malformed email and missing name', () => {
    expect(() => parseStudent({ ...valid, email: 'invalid' })).toThrow();
    expect(() => parseStudent({ ...valid, full_name: '' })).toThrow();
  });
});
