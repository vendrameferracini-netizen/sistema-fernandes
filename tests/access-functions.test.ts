import { beforeEach,describe,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn(),signIn:vi.fn(),signOut:vi.fn(),createUser:vi.fn(),updateUser:vi.fn(),from:vi.fn()}));
vi.mock('npm:@supabase/supabase-js@2.117.0',()=>({createClient:(_url:string,key:string)=>key==='public' ? {
  auth:{signInWithPassword:mocks.signIn,signOut:mocks.signOut},
} : { rpc:mocks.rpc,from:mocks.from,auth:{getUser:mocks.getUser,admin:{createUser:mocks.createUser,updateUserById:mocks.updateUser}} }}));
import { makeAccessHandler } from '../supabase/functions/_shared/access-handler';
import { normalizeUsername,validateSecret } from '../supabase/functions/_shared/username';
const user='00000000-0000-4000-8000-000000000001';
const student='00000000-0000-4000-8000-000000000002';
const sid='00000000-0000-4000-8000-000000000003';
const token='test.'+btoa(JSON.stringify({session_id:sid}))+'.signature';
const env=(name:string)=>({APP_URL:'https://app.example.test',SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'server-test',SUPABASE_ANON_KEY:'public'}[name]);
const req=(body:unknown,auth=true)=>new Request('https://app.example.test/endpoint',{
  method:'POST',headers:{Origin:'https://app.example.test',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),
});
const fixture={full_name:'Aluno Teste',username:'aluno',password:'initial-password-123',start_date:'2026-09-23'};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async(name:string)=>({error:null,data: name==='consume_auth_limit' || name==='register_app_session' ? true :
    name==='access_context' ? {id:user,role:'admin',must_change_password:false,email:'internal@example.test',version:1} :
    name==='lookup_login' ? {id:student,email:'student@example.test',version:1} : name==='begin_password_operation' ? 2 : null}));
  mocks.getUser.mockResolvedValue({data:{user:{id:user}},error:null});
  mocks.signIn.mockResolvedValue({data:{user:{id:student},session:{access_token:token,refresh_token:'refresh-test'}},error:null});
  mocks.signOut.mockResolvedValue({error:null});
  mocks.createUser.mockResolvedValue({data:{user:{id:student}},error:null});
  mocks.updateUser.mockResolvedValue({error:null});
  mocks.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})});
});
describe('username backend handlers with simulated Auth transport',()=>{
  it('normalizes usernames but never normalizes passwords',()=>{
    expect(normalizeUsername(' Filipe ')).toBe('filipe');
    expect(()=>normalizeUsername('a@b')).toThrow();
    expect(validateSecret(' password-123 ')).toBe(' password-123 ');
  });
  it('signs in through Auth and registers a database-authorized session',async()=>{
    const response=await makeAccessHandler('login',env)(req({username:' ALUNO ',password:'test-password'},false));
    expect(response.status).toBe(200);
    expect(mocks.signIn).toHaveBeenCalledWith({email:'student@example.test',password:'test-password'});
    expect(mocks.rpc).toHaveBeenCalledWith('register_app_session',{subject:student,session:sid,expected_version:1});
    expect(await response.json()).toEqual({access_token:token,refresh_token:'refresh-test'});
  });
  it('uses the same generic failure for unknown users and incorrect passwords',async()=>{
    mocks.signIn.mockResolvedValue({data:{user:null,session:null},error:{message:'private auth failure'}});
    const first=await makeAccessHandler('login',env)(req({username:'aluno',password:'wrong'}));
    const original=mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name,args)=>name==='lookup_login'?Promise.resolve({data:null,error:null}):original(name,args));
    const second=await makeAccessHandler('login',env)(req({username:'unknown',password:'wrong'}));
    expect(first.status).toBe(401); expect(second.status).toBe(401);
    expect(await first.json()).toEqual(await second.json());
  });
  it('stops before Auth when persistent rate limiting denies the attempt',async()=>{
    mocks.rpc.mockResolvedValue({data:false,error:null});
    expect((await makeAccessHandler('login',env)(req({username:'aluno',password:'test'}))).status).toBe(429);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('fails closed if the database rate limiter is unavailable',async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{message:'database down'}});
    expect((await makeAccessHandler('login',env)(req({username:'aluno',password:'test'}))).status).toBe(503);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated creation and invalid tokens',async()=>{
    expect((await makeAccessHandler('create',env)(req(fixture,false))).status).toBe(401);
    mocks.getUser.mockResolvedValue({data:{user:null},error:{message:'invalid'}});
    expect((await makeAccessHandler('create',env)(req(fixture))).status).toBe(401);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it('rejects student and forced-change admin attempts to create accounts',async()=>{
    const original=mocks.rpc.getMockImplementation()!;
    for(const actor of [{role:'student',must_change_password:false},{role:'admin',must_change_password:true}]) {
      mocks.rpc.mockImplementation((name,args)=>name==='access_context'?Promise.resolve({data:actor,error:null}):original(name,args));
      expect((await makeAccessHandler('create',env)(req({...fixture,role:'admin'}))).status).toBe(403);
    }
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it('creates only the student identity and never includes passwords in database RPCs',async()=>{
    const response=await makeAccessHandler('create',env)(req({...fixture,role:'admin',actor:'forged'}));
    expect(response.status).toBe(201);
    expect(mocks.createUser).toHaveBeenCalledWith({email:expect.stringMatching(/@sistema-fernandes\.invalid$/),password:fixture.password,email_confirm:true});
    expect(mocks.rpc).toHaveBeenCalledWith('provision_username_student',expect.objectContaining({actor:user,actor_session:sid,student,login_name:'aluno'}));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(fixture.password);
    expect(await response.json()).toEqual({id:student});
  });
  it('does not create Auth identities for an already-used username',async()=>{
    mocks.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:student},error:null})})})});
    expect((await makeAccessHandler('create',env)(req(fixture))).status).toBe(409);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it('reports partial provisioning failure and never reports success',async()=>{
    const original=mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name,args)=>name==='provision_username_student'?Promise.resolve({data:null,error:{}}):original(name,args));
    const response=await makeAccessHandler('create',env)(req(fixture));
    expect(response.status).toBe(409); expect((await response.json()).code).toBe('PROVISIONING_PENDING');
  });
  it('requires the current password before beginning self-change',async()=>{
    mocks.signIn.mockResolvedValue({data:{user:null},error:{message:'invalid'}});
    expect((await makeAccessHandler('change',env)(req({password:'new-password-123',current_password:'wrong'}))).status).toBe(401);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.some(([name])=>name==='begin_password_operation')).toBe(false);
  });
  it('finishes a reset only after Auth succeeds and accounts for the trigger version increment',async()=>{
    const response=await makeAccessHandler('reset',env)(req({username:'aluno',student_id:student,password:'reset-password-123'}));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('begin_password_operation',expect.objectContaining({kind:'reset',target:student,expected_version:1}));
    expect(mocks.updateUser).toHaveBeenCalledWith(student,{password:'reset-password-123'});
    expect(mocks.rpc).toHaveBeenCalledWith('finish_password_operation',expect.objectContaining({target:student,expected_version:3}));
  });
  it('keeps the operation pending after an Auth failure and never clears forced change',async()=>{
    mocks.updateUser.mockResolvedValue({error:{message:'timeout'}});
    const response=await makeAccessHandler('reset',env)(req({username:'aluno',student_id:student,password:'reset-password-123'}));
    expect(response.status).toBe(409); expect((await response.json()).code).toBe('OPERATION_PENDING');
    expect(mocks.rpc.mock.calls.some(([name])=>name==='finish_password_operation')).toBe(false);
  });
});
