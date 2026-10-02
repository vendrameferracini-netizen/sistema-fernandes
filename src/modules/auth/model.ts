export type Profile = {
  id: string;
  full_name: string;
  role: 'admin' | 'student';
  active: boolean;
  username: string;
  must_change_password: boolean;
};

export function homeFor(profile: Profile | null): string {
  if (!profile?.active) return '/acesso';
  if (profile.must_change_password) return '/definir-senha';
  return profile.role === 'admin' ? '/admin' : '/aluno';
}

export function validatePassword(password: string, confirmation: string): string | null {
  if (password.length < 12) return 'Use pelo menos 12 caracteres para sua senha.';
  if (password !== confirmation) return 'As senhas precisam ser iguais.';
  return null;
}

export function authMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'invalid_credentials') return 'Usuário ou senha incorretos. Confira e tente novamente.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
  if (code === 'same_password') return 'Escolha uma senha diferente da senha atual.';
  if (code === 'weak_password') return 'Escolha uma senha mais forte, com pelo menos 12 caracteres.';
  return 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}
