// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthPage } from '../src/modules/auth/AuthPage';
import { AccessGate } from '../src/modules/auth/AccessGate';
import { StudentForm } from '../src/modules/students/StudentForm';
import { StudentsPage } from '../src/modules/students/StudentsPage';

const mocks = vi.hoisted(() => ({
  auth: { session: null as unknown, profile: null as unknown, loading: false, recovery: false, finishRecovery: vi.fn() },
  signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), loginWithUsername: vi.fn(), changePassword: vi.fn(),
  listStudents: vi.fn(), saveStudent: vi.fn(), resetStudentPassword: vi.fn(),
}));
vi.mock('../src/modules/auth/api', () => ({ loginWithUsername: mocks.loginWithUsername, changePassword: mocks.changePassword }));
vi.mock('../src/modules/auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../src/lib/supabase', () => {
  const client = { auth: { signInWithPassword: mocks.signInWithPassword, resetPasswordForEmail: mocks.resetPasswordForEmail, updateUser: mocks.updateUser } };
  return { supabase: client, requireSupabase: () => client };
});
vi.mock('../src/modules/students/api', () => ({ listStudents: mocks.listStudents, saveStudent: mocks.saveStudent, resetStudentPassword: mocks.resetStudentPassword }));
vi.mock('../src/modules/programs/ProgramManager', () => ({ ProgramManager: () => null }));
vi.mock('../src/modules/programs/api', () => ({ listPrograms: async () => [] }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(mocks.auth, { session: null, profile: null, loading: false, recovery: false });
});

describe('authentication UI with mocked service', () => {
  it('reports invalid credentials without entering a dashboard', async () => {
    mocks.loginWithUsername.mockRejectedValue(new Error('Usuário ou senha incorretos.'));
    render(<MemoryRouter initialEntries={['/entrar']}><AuthPage /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('Usuário'), 'aluno_teste');
    await userEvent.type(screen.getByPlaceholderText('Sua senha de acesso'), 'testing-password');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('incorretos');
    expect(mocks.loginWithUsername).toHaveBeenCalledWith('aluno_teste', 'testing-password');
  });
  it('recovery directs users to the coach without requesting an email', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<MemoryRouter initialEntries={['/recuperar-senha']}><AuthPage /></MemoryRouter>);
    expect(screen.getByText('Fale com o Filipe')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it('blocks password editing without a valid session', () => {
    render(<MemoryRouter initialEntries={['/definir-senha']}><AuthPage /></MemoryRouter>);
    expect(screen.getByText('Entre com seu usuário e senha')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salvar nova senha' })).toBeNull();
  });
  it('redirects a student away from the administrator route', async () => {
    mocks.auth.session = { user: { id: 'student' } };
    mocks.auth.profile = { id: 'student', role: 'student', active: true };
    render(<MemoryRouter initialEntries={['/admin']}><Routes><Route element={<AccessGate role="admin" />}><Route path="/admin" element={<div>Admin content</div>} /></Route><Route path="/aluno" element={<div>Student home</div>} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Student home')).toBeTruthy();
    expect(screen.queryByText('Admin content')).toBeNull();
  });
  it('redirects an inactive profile away from protected data', async () => {
    mocks.auth.session = { user: { id: 'student' } };
    mocks.auth.profile = { id: 'student', role: 'student', active: false };
    render(<MemoryRouter initialEntries={['/aluno']}><Routes><Route element={<AccessGate role="student" />}><Route path="/aluno" element={<div>Protected data</div>} /></Route><Route path="/acesso" element={<div>Access restricted</div>} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Access restricted')).toBeTruthy();
    expect(screen.queryByText('Protected data')).toBeNull();
  });
  it('requires password change before showing the student home',async()=>{
    mocks.auth.session={user:{id:'student'}};
    mocks.auth.profile={id:'student',role:'student',active:true,must_change_password:true};
    render(<MemoryRouter initialEntries={['/aluno']}><Routes><Route element={<AccessGate role="student" />}><Route path="/aluno" element={<div>Protected data</div>} /></Route><Route path="/definir-senha" element={<div>Change required</div>} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Change required')).toBeTruthy();
    expect(screen.queryByText('Protected data')).toBeNull();
  });
  it('requires current password and returns to login after successful change',async()=>{
    mocks.auth.session={user:{id:'student'}};
    mocks.auth.profile={id:'student',role:'student',active:true,must_change_password:true};
    mocks.changePassword.mockResolvedValue(undefined);
    render(<MemoryRouter initialEntries={['/definir-senha']}><AuthPage /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('Senha atual ou temporária'),'temporary-password');
    await userEvent.type(screen.getByPlaceholderText('Pelo menos 12 caracteres'),'personal-password');
    await userEvent.type(screen.getByLabelText('Confirme a nova senha'),'personal-password');
    await userEvent.click(screen.getByRole('button',{name:'Salvar nova senha'}));
    expect(await screen.findByText('Senha atualizada')).toBeTruthy();
    expect(mocks.changePassword).toHaveBeenCalledWith('temporary-password','personal-password');
    expect(screen.queryByText('Acessar minha área')).toBeNull();
  });
});

describe('student management UI with mocked service', () => {
  it('preserves entered fields and does not report success if persistence fails', async () => {
    mocks.saveStudent.mockRejectedValue(new Error('Falha de conexão'));
    const onSaved = vi.fn();
    render(<StudentForm onSaved={onSaved} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Aluno de teste');
    await userEvent.type(screen.getByLabelText('Usuário'), 'aluno_teste');
    await userEvent.type(screen.getByLabelText('Senha inicial'), 'initial-password-123');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar aluno' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Falha de conexão');
    expect((screen.getByLabelText('Nome completo') as HTMLInputElement).value).toBe('Aluno de teste');
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('does not show a fake zero count after a loading failure', async () => {
    mocks.listStudents.mockRejectedValue(new Error('Falha ao carregar'));
    render(<StudentsPage />);
    await screen.findByRole('alert');
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('O próximo passo é seu primeiro aluno.')).toBeNull();
  });
  it('filters fetched students by name and status', async () => {
    mocks.listStudents.mockResolvedValue([
      { id: 'a', email: 'a@example.test', profiles: { full_name: 'Ana teste', active: true } },
      { id: 'b', email: 'b@example.test', profiles: { full_name: 'Bruno teste', active: false } },
    ]);
    render(<StudentsPage />);
    await screen.findByText('Ana teste');
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por status'), 'inactive');
    await waitFor(() => expect(screen.queryByText('Ana teste')).toBeNull());
    expect(screen.getByText('Bruno teste')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Buscar aluno por nome ou usuário'), 'inexistente');
    expect(screen.getByText('Nenhum aluno encontrado.')).toBeTruthy();
  });
  it('resets a student password without exposing any existing password',async()=>{
    const student={id:'s',phone:'',birth_date:null,objective:'',start_date:'2026-09-23',student_admin_notes:null,
      profiles:{id:'s',full_name:'Aluno Teste',username:'aluno',role:'student' as const,active:true,must_change_password:false}};
    mocks.resetStudentPassword.mockResolvedValue(undefined);
    render(<StudentForm student={student} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const field=screen.getByLabelText('Nova senha temporária') as HTMLInputElement;
    expect(field.value).toBe(''); expect(field.type).toBe('password');
    await userEvent.type(field,'temporary-password');
    await userEvent.click(screen.getByRole('button',{name:'Redefinir senha do aluno'}));
    expect((await screen.findByRole('status')).textContent).toContain('Senha temporária definida');
    expect(field.value).toBe('');
    expect(mocks.resetStudentPassword).toHaveBeenCalledWith(student,'temporary-password');
  });
});
