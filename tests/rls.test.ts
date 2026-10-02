import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

// Executes the actual SQL migrations in PostgreSQL WASM. Auth roles/uid are fixtures;
// a hosted Supabase integration test is still required before deployment.
const db = new PGlite();
const coach = '00000000-0000-4000-8000-000000000001';
const alice = '00000000-0000-4000-8000-000000000002';
const bob = '00000000-0000-4000-8000-000000000003';
async function asUser(id: string, sql: string) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${id}';`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
    insert into auth.users values ('${coach}'),('${alice}'),('${bob}');`);
  for (const filename of ['202609230001_identity.sql', '202609230002_students.sql']) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8'));
  }
  await db.exec(`insert into public.profiles(id,full_name,role) values ('${coach}','Coach de teste','admin');
    select public.provision_student('${coach}','${alice}','alice@example.test','Alice teste','','2000-01-01','Objetivo A',current_date,'Nota privada A');
    select public.provision_student('${coach}','${bob}','bob@example.test','Bob teste','','2001-01-01','Objetivo B',current_date,'Nota privada B');`);
}, 30000);
afterAll(async () => { await db.close(); });
describe.sequential('database authorization', () => {
  it('student only reads their own profile and record', async () => {
    const profiles = await asUser(alice, 'select id from public.profiles');
    const students = await asUser(alice, 'select id from public.students');
    expect(profiles.rows).toEqual([{ id: alice }]);
    expect(students.rows).toEqual([{ id: alice }]);
  });
  it('student cannot read administrative notes or audit events', async () => {
    expect((await asUser(alice, 'select * from public.student_admin_notes')).rows).toEqual([]);
    expect((await asUser(alice, 'select * from public.admin_audit')).rows).toEqual([]);
  });
  it('student cannot promote their role or modify records directly', async () => {
    await expect(asUser(alice, `update public.profiles set role='admin' where id='${alice}'`)).rejects.toThrow();
    await expect(asUser(alice, `update public.students set objective='Changed' where id='${bob}'`)).rejects.toThrow();
  });
  it('student cannot invoke onboarding or administrative update', async () => {
    await expect(asUser(alice, `select public.provision_student('${alice}','${bob}','x@example.test','Teste','','2000-01-01','',current_date,'')`)).rejects.toThrow();
    await expect(asUser(alice, `select public.update_student('${bob}','Teste','','2000-01-01','',current_date,'',true)`)).rejects.toThrow();
  });
  it('coach sees all students and notes', async () => {
    expect((await asUser(coach, 'select * from public.students')).rows).toHaveLength(2);
    expect((await asUser(coach, 'select * from public.student_admin_notes')).rows).toHaveLength(2);
  });
  it('coach can deactivate a student, preventing access with an existing identity', async () => {
    await asUser(coach, `select public.update_student('${bob}','Bob teste','','2001-01-01','Objetivo B',current_date,'Nota privada B',false)`);
    expect((await asUser(bob, 'select * from public.students')).rows).toEqual([]);
    expect((await asUser(bob, 'select active from public.profiles')).rows).toEqual([{ active: false }]);
  });
  it('cannot create a second administrator even via the database owner', async () => {
    await expect(db.exec(`update public.profiles set role='admin' where id='${alice}'`)).rejects.toThrow();
  });
  it('anonymous role has no access', async () => {
    await db.exec('set role anon');
    try { await expect(db.query('select * from public.students')).rejects.toThrow(); }
    finally { await db.exec('reset role'); }
  });
});
