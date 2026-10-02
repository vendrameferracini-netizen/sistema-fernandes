# Sistema Fernandes — plano de implementação

Inspeção: pasta sem repositório ou aplicação prévia. Criada aplicação nova em `outputs/sistema-fernandes`.

Atualização autorizada em 24/09/2026: substituir o acesso visível por e-mail pelo acesso por usuário e senha. O cadastro será administrativo com senha inicial, troca obrigatória e recuperação assistida, mantendo Supabase Auth e RLS. A migration 003 é incremental e preserva as duas migrations anteriores. Detalhes em `ACESSO-USUARIO.md`; as menções a convites abaixo descrevem o plano original, substituído por essa decisão.

## Arquitetura

- React + TypeScript + Vite; Tailwind e CSS de identidade visual.
- `src/modules/`: autenticação, alunos, exercícios, treinos, execução, alimentação, avaliações, check-ins e documentos.
- `src/components/`: componentes compartilhados; `src/lib/`: clientes e infraestrutura.
- Supabase Auth para identidade; PostgreSQL com RLS para autorização; Storage privado para arquivos.
- Convites administrativos em Edge Function; segredo administrativo exclusivamente no servidor.
- Migrações SQL versionadas em `supabase/migrations`. Sem reset de banco.
- Sessões de treino futuras usarão cópia da prescrição e identificadores estáveis. Fila offline em IndexedDB por usuário, com sincronização idempotente e sem cache público de dados privados.
- Publicação futura na Vercel, somente após validação integrada e autorização.

## Ordem e entregas

| Etapa | Arquivos / módulos | Tabelas e validação |
|---|---|---|
| 1 | `auth`, `Brand`, estilos, configuração de ambiente | `profiles`, funções privadas de autorização; login, recuperação, perfil inativo e proteção de rotas |
| 2 | `students`, painel administrativo, função `invite-student` | `students`, `student_admin_notes`, `admin_audit`; convites, edição e isolamento entre alunos |
| 3 | `exercises`, upload e biblioteca pesquisável | `exercises`, `exercise_media`; buckets privados, validação e URLs assinadas |
| 4 | `workouts`, editor e atribuição | `workout_plans`, `workout_exercises`, atribuições; ordenação, duplicação, acesso individual |
| 5 | `execution`, séries e cronômetro por horário final | `workout_sessions`, `set_logs`, snapshots; salvamento por série, correção e execução parcial |
| 6 | fila IndexedDB e `history` | identificadores idempotentes; retomada, reconexão e gráficos com dados reais |
| 7 | `nutrition`, `assessments`, `checkins` | `nutrition_plans`, `nutrition_meals`, `body_assessments`, `progress_photos`, `weekly_checkins` |
| 8 | `health`, documentos e permissões | `health_documents`, consentimentos e auditoria de acesso; arquivos privados |
| 9 | manifest, ícones, service worker e testes mobile | instalação, acessibilidade, offline, privacidade e expiração de sessões |
| 10 | configuração Vercel e instruções de operação | validação em homologação, restauração, retenção e publicação autorizada |

## Regras de entrega

Dados reais somente quando houver ambiente configurado. Sem contas de demonstração ou indicadores fictícios na interface. Não substituir uma falha de persistência por armazenamento local silencioso. Os testes usam dados sintéticos apenas no ambiente de testes. Cada etapa precisa de compilação e verificações proporcionais; autenticação e RLS exigem validação integrada antes da publicação.

## Atribuições — implementação local preparada
A etapa 007 adiciona programações por aluno, rascunho/ativa/encerrada, treinos ordenados vinculados a versões explícitas, consulta individual por RLS, auditoria e retenção das imagens históricas. Detalhes em PROGRAMACOES.md. A execução e seus registros permanecem para a próxima fase. Migration aguardando aplicação pelo responsável.

## Execução — primeira entrega local preparada
Migration 008 e módulo execution preparados para revisão: séries individuais, status explícitos, dados numéricos, retomada/idempotência, resumo permanente e RLS. Detalhes e limites em EXECUCAO.md. Cronômetro, feedback, gráficos, PRs e compartilhamento permanecem posteriores.

## 25/09/2026 — desenvolvimento em blocos

Por solicitação do usuário, implementar o bloco completo sem confirmações a cada funcionalidade e consolidar testes/TypeScript/build ao final. Proibidas alterações remotas sem autorização. Bloco “Experiência completa de treinos” concluído localmente, incluindo feedback administrativo, histórico, calendário, frequência, estatísticas e PNG compartilhável. Detalhes e pendências reais: `BLOCO_EXPERIENCIA_TREINOS.md`. Aguardar revisão/autorização das migrations incrementais 009 e 010; preservar 008 aplicada.
