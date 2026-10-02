import { requireSupabase } from '../../lib/supabase';
import type { Profile } from '../auth/model';
import { accessRequest } from '../auth/api';
export type Student = {
  id: string; phone: string; birth_date: string | null; objective: string;
  start_date: string; profiles: Profile; student_admin_notes: { notes: string } | null;
};
export type StudentFormData = {
  full_name: string; username: string; password: string; phone: string; birth_date: string | null;
  objective: string; start_date: string; notes: string; active: boolean;
};
export async function listStudents(): Promise<Student[]> {
  const { data, error } = await requireSupabase().from('students')
    .select('id,phone,birth_date,objective,start_date,profiles!inner(id,full_name,role,active,username,must_change_password),student_admin_notes(notes)')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Não foi possível carregar os alunos. Tente novamente.');
  return (data ?? []) as unknown as Student[];
}
export async function saveStudent(value: StudentFormData, id?: string): Promise<void> {
  const client = requireSupabase();
  if (id) {
    const { error } = await client.rpc('update_student', {
      student: id, student_name: value.full_name.trim(), student_phone: value.phone.trim(),
      student_birth: value.birth_date || null, student_objective: value.objective.trim(),
      student_start: value.start_date, student_notes: value.notes.trim(), student_active: value.active,
    });
    if (error) throw new Error('Não foi possível salvar as alterações. Confira os campos e tente novamente.');
    return;
  }
  await accessRequest('create-student',value);
}

export async function resetStudentPassword(student: Student,password: string) {
  await accessRequest('reset-student-password',{student_id:student.id,username:student.profiles.username,password});
}
