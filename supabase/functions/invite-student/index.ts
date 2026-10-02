// Retired: username/password provisioning replaces email invitations.
Deno.serve(() => new Response(JSON.stringify({ error: 'Use o cadastro por usuário e senha.', code: 'RETIRED' }), {
  status: 410, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
}));
