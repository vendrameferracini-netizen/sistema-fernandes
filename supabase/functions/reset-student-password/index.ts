import { makeAccessHandler } from '../_shared/access-handler.ts';
Deno.serve(makeAccessHandler('reset',name=>Deno.env.get(name)));
