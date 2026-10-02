import { makeAccessHandler } from '../_shared/access-handler.ts';
Deno.serve(makeAccessHandler('create',name=>Deno.env.get(name)));
