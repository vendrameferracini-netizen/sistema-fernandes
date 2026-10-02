export type StudentInput = {
  full_name: string; email: string; phone: string; birth_date: string | null;
  objective: string; start_date: string; notes: string;
};
function textField(value: unknown, max: number, min = 0): string {
  if (typeof value !== 'string') throw new Error('Campo inválido.');
  const result = value.trim();
  if (result.length < min || result.length > max) throw new Error('Confira o tamanho dos campos.');
  return result;
}
function dateField(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Data inválida.');
  return value;
}
export function parseStudent(value: unknown): StudentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Cadastro inválido.');
  const input = value as Record<string, unknown>;
  const email = textField(input.email, 254, 3).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
  const birth = input.birth_date ? dateField(input.birth_date) : null;
  if (birth && (birth < '1900-01-01' || birth > new Date().toISOString().slice(0, 10))) throw new Error('Data de nascimento inválida.');
  return { full_name: textField(input.full_name, 160, 2), email,
    phone: textField(input.phone ?? '', 32), birth_date: birth,
    objective: textField(input.objective ?? '', 1000), start_date: dateField(input.start_date),
    notes: textField(input.notes ?? '', 5000) };
}
