# Acesso por usuário e senha — implementação local

Status: código e migration preparados. Não aplicados ao Supabase hospedado por esta implementação. A criação do primeiro administrador ainda está pendente. O acesso real depende da aplicação orientada da migration, configuração do Auth e publicação das quatro Edge Functions.

## Estrutura e fluxo

- `202609230003_username_access.sql` é incremental e transacional. As migrations 001 e 002 permanecem intactas.
- `profiles.username`: único, minúsculo, 3–40 caracteres, iniciando com letra; aceita letras ASCII, números e sublinhado.
- `profiles.must_change_password`: só operações confiáveis no servidor alteram; clientes têm apenas leitura.
- `private.login_identities`: UUID, identidade Auth interna, versão e controle da operação em curso; sem senhas ou hashes de senha.
- `private.app_sessions`: autoriza apenas sessões emitidas por Auth e registradas após login por usuário. Não guarda tokens. A existência em `auth.sessions` também é conferida.
- `private.auth_limits`: contadores persistentes com chaves derivadas por SHA-256; limite global por endpoint e por usuário/ator. O limite por usuário pode causar espera temporária se alguém insistir em tentativas contra o mesmo nome. CORS não é usado como substituto de autenticação ou limite de tentativas.
- Senhas são transmitidas por HTTPS para a função e para Auth, permanecem apenas na memória durante a operação e são armazenadas em forma de hash exclusivamente pelo Supabase Auth. Não há log do corpo das requisições nem de senhas/tokens no código.

## Funções

| Função | Autorização e comportamento |
|---|---|
| `username-login` | Limita tentativas, resolve usuário no servidor, autentica com cliente Auth separado, registra sessão e retorna tokens |
| `create-student` | Verifica JWT, sessão autorizada, administrador ativo e senha já trocada; cria apenas aluno com senha inicial e identidade aleatória `UUID@sistema-fernandes.invalid` |
| `reset-student-password` | Exige administrador autorizado; aceita apenas alvo aluno ativo; invalida sessões antes de alterar Auth e exige troca posterior |
| `change-password` | Verifica JWT/sessão e senha atual; bloqueia sessões anteriores, altera Auth, libera a exigência e solicita novo login |

As funções têm `verify_jwt=false` porque a verificação de usuários autenticados é feita explicitamente com `getUser(token)` antes de ler `session_id`. O endpoint de login é público por necessidade, protegido por limites persistentes. Nenhuma função de aplicação cria administradores.

O cliente administrativo é separado do cliente usado para autenticar senhas; nunca se reutiliza uma sessão de aluno para executar chamadas administrativas. E-mail técnico pode aparecer no token/objeto interno do SDK e não é um segredo; não aparece nos formulários ou na lista de alunos.

## RLS e troca obrigatória

As funções privadas usadas pelas políticas existentes passam a exigir perfil ativo, senha trocada, sessão autorizada, mesma versão de credencial e ausência de alteração pendente. O aluno com senha temporária pode obter apenas seu perfil mínimo e executar a troca. Leitura de seu próprio perfil não libera suas fichas ou notas.

Um trigger em `auth.users` avança a versão a cada mudança de senha e marca a troca obrigatória. Assim, chamadas diretas à API de Auth e recuperação pelo painel não contornam a restrição. Uma troca gerenciada só é finalizada se houver exatamente uma mudança de senha desde o início; mudanças concorrentes deixam a conta bloqueada para conferência. Não se grava a senha ou o hash do Auth nas tabelas do aplicativo.

A alteração de e-mail técnico de uma conta já mapeada é recusada pelo trigger para evitar inconsistência e reutilização de identidades. Recuperação assistida deve alterar a senha, não o e-mail.

## Provisionamento e recuperação assistida

O primeiro Filipe será criado por um procedimento orientado no painel Auth, seguido de associação transacional do UUID a `profiles` (`username=filipe`, `role=admin`, `must_change_password=true`) e `private.login_identities`. A constraint já existente impede outro administrador. Essa etapa não foi executada nem embutida na migration.

Na recuperação normal do Filipe, o responsável pelo Supabase poderá alterar sua senha pelo Auth; o trigger invalida as sessões e obriga a troca no aplicativo. Não é necessário um segundo administrador da consultoria.

Falhas parciais são tratadas sem apagar contas:

- `PROVISIONING_PENDING`: Auth criou uma identidade, mas o cadastro transacional não terminou. Conferir o usuário no Auth e o estado do banco antes de associar dados ou repetir. Uma concorrência por username pode deixar uma identidade Auth sem perfil, sem qualquer acesso aos dados.
- `OPERATION_PENDING`: o início foi registrado, mas a alteração no Auth/finalização falhou ou ficou incerta. Os dados permanecem bloqueados. O responsável verifica a operação em `private.login_identities` e o estado de Auth antes de recuperação; nunca libera `must_change_password` manualmente como atalho. Para recuperar, cancelar a operação pendente sob controle do operador, incrementar a versão e manter `must_change_password=true`, definir uma nova senha temporária no Auth e testar o login/troca. Esse procedimento será orientado separadamente se ocorrer; não existe desbloqueio por timeout que possa liberar uma senha temporária.

## Configuração hospedada ainda necessária

Somente no projeto **Sistema Fernandes** (`qksvdvuatdksavfpouaf`), uma etapa por vez com confirmação:

- Aplicação da migration 003 pelo SQL Editor.
- Desativar cadastro público e autenticação anônima no Auth; manter política de senha.
- Publicação das quatro funções, com o código compartilhado, e aposentadoria de qualquer função antiga `invite-student`. A migration também revoga a RPC antiga para evitar provisionamento legado.
- Configurar `APP_ORIGINS` com as origens exatas autorizadas. Para esta prévia: `http://127.0.0.1:5173,http://localhost:5173`.
- Usar as variáveis de servidor padrão `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY`; se necessário, `APP_PUBLISHABLE_KEY` substitui somente a chave pública no servidor. Nenhum segredo entra em `VITE_*` ou no frontend.
- Criar e associar a identidade inicial do Filipe; verificar login, troca inicial e criação de dois alunos de teste autorizados.

## Validação

Testes locais executam as três migrations em PostgreSQL WASM, incluindo simulação de `auth.users`, `auth.sessions`, `auth.uid()` e `auth.jwt()`. Testes de handlers usam transporte Auth simulado. Esses testes não substituem a validação integrada em Supabase: deve ser comprovado que o trigger acompanha as operações hospedadas de Auth, que a sessão inclui `session_id` e que os redirects/perfis/RLS funcionam no projeto real. Nenhum teste automatizado desta alteração chama o Supabase remoto.

Referências: [sessões Supabase](https://supabase.com/docs/guides/auth/sessions), [alteração administrativa de usuário](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).
