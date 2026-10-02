# Sistema Fernandes

Aplicativo exclusivo de Filipe Fernandes. Implementação inicial das etapas 1 e 2: identidade visual, autenticação e gestão de alunos. **Ainda não é o sistema completo nem está publicado.**

**Atualização de acesso (24/09/2026):** login por **usuário + senha**, cadastro com senha temporária, troca obrigatória e recuperação pelo coach. Consulte [ACESSO-USUARIO.md](docs/ACESSO-USUARIO.md) para a arquitetura vigente. A migration 003 e as quatro funções novas estão preparadas localmente e aguardam aplicação orientada. As instruções de convite por e-mail abaixo são históricas e não devem ser executadas para esta versão.

## Executar localmente

Requisitos: Node.js 22.18+ (ou 24) e pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Se o ambiente Windows restringir o acesso do otimizador do Vite, use a compilação estática:

```sh
pnpm build
pnpm preview --port 5173
```

Abra `http://localhost:5173`. Sem as variáveis de ambiente, a tela inicial funciona, mostra que o acesso está em preparação e não simula login.

```sh
pnpm test
pnpm build
```

## Conectar ao Supabase em homologação

1. Escolha um projeto Supabase exclusivo e autorizado para homologação. Faça backup antes de aplicar migrações a qualquer projeto existente.
2. Copie `.env.example` para `.env.local`. Informe `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A chave pública pode ser a publishable ou a anon legada. **Nunca coloque service_role em variável VITE.**
3. Aplique `supabase/migrations/202609230001_identity.sql` e `202609230002_students.sql` em ordem pelo fluxo de migrações. Não execute `db reset` em um banco existente.
4. No Supabase Auth, desative cadastro público, mantenha confirmação de e-mail e configure senha mínima de 12 caracteres. O `config.toml` descreve o ambiente local; as opções hospedadas precisam ser configuradas separadamente.
5. Configure Site URL e Redirect URLs para a origem exata utilizada, incluindo `/definir-senha`. Configure SMTP para convites e recuperação.
6. Crie/convide o usuário do Filipe no painel administrativo Supabase. Insira **somente seu UUID verificado** na tabela `profiles`, com `full_name = 'Filipe Fernandes'`, `role = 'admin'`, `active = true`. Não há promoção de perfil pelo navegador. O índice impede um segundo administrador.
7. Configure o segredo `APP_URL` da Edge Function para a origem aprovada (ex.: `http://localhost:5173` na homologação local). `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são variáveis exclusivas do servidor.
8. Publique a função `invite-student` no projeto de homologação autorizado. Ela verifica o JWT em `getUser` e consulta o perfil ativo no servidor. `verify_jwt = false` não libera a função: a verificação ocorre no código.
9. Reinicie/recompile o frontend e execute os testes integrados descritos em `docs/VALIDACAO.md` antes de habilitar uso real.

Nenhuma conta foi criada, nenhum convite real foi enviado e nenhuma migração foi aplicada a serviço externo durante esta entrega.

## O que já existe

- Tela de apresentação e login responsivo; arquivo original da imagem preservado, enquadrado por CSS.
- Login, recuperação e definição de senha integrados à API do Supabase.
- Rotas separadas por perfil, bloqueio de perfil ausente/inativo, saída e tratamento de erros.
- Listagem, busca e filtro de alunos; indicadores baseados no banco.
- Cadastro com convite por e-mail, edição cadastral, desativação e notas administrativas privadas.
- Migrações, RLS, auditoria de alterações administrativas e testes locais de isolamento.

Os módulos de exercícios, treinos, execução, histórico, alimentação, avaliações, check-ins, documentos, PWA e publicação continuam pendentes conforme `docs/PLANO.md`. O painel do aluno sinaliza essa situação, sem treinos ou resultados inventados. O e-mail de um aluno existente fica somente leitura até existir um fluxo de troca com confirmação.

## Limitações operacionais conhecidas

- Convite Auth e transação PostgreSQL são duas operações. Se o e-mail for enviado e o provisionamento falhar, a conta não recebe acesso ao aplicativo. O erro `PROVISIONING_PENDING` exige intervenção de suporte: verificar o UUID no Auth e completar `provision_student` com dados conferidos. Não excluir usuário nem reenviar convites cegamente. Uma futura fila de convites poderá automatizar essa recuperação.
- Em caso de perda de conexão após salvar, confirme a lista antes de repetir uma operação. O e-mail único evita duplicação de cadastro.
- Desativar bloqueia os dados via RLS; não remove a identidade Auth. A conta inativa pode somente consultar seu próprio perfil para mostrar o motivo do bloqueio.
- O SDK persiste a sessão de autenticação no navegador. Não há armazenamento local de fichas, saúde ou alunos nesta fase. A fila offline privada será implementada na etapa 6.
- Não há alegação de conformidade LGPD concluída: políticas, consentimentos, retenção, exportação e exclusão fazem parte das próximas etapas.

## Referências de implementação

- [Supabase Auth com React](https://supabase.com/docs/guides/auth/quickstarts/react)
- [RLS e políticas de acesso](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Convites administrativos](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
