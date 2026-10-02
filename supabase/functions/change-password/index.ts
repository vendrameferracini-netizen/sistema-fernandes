import { makeAccessHandler } from '../_shared/access-handler.ts';
Deno.serve(makeAccessHandler('change',name=>Deno.env.get(name)));
