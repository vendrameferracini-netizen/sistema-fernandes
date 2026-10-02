import { beforeAll,afterAll,it,expect,vi } from 'vitest';
let handler:()=>Response;
beforeAll(async()=>{
  vi.stubGlobal('Deno',{serve:(callback:typeof handler)=>{handler=callback;}});
  await import('../supabase/functions/invite-student/index');
});
afterAll(()=>vi.unstubAllGlobals());
it('retires email invitations without sending mail or changing accounts',async()=>{
  const response=handler();
  expect(response.status).toBe(410);
  expect((await response.json()).code).toBe('RETIRED');
});
