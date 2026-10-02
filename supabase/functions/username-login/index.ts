import { makeAccessHandler } from '../_shared/access-handler.ts';
Deno.serve(makeAccessHandler('login',name=>Deno.env.get(name)));
