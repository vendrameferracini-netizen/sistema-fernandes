# Bloco: experiência completa de treinos

Status em 25/09/2026: implementado e testado localmente. Supabase permanece inalterado. Migrations 009 e 010 aguardam revisão/autorização. 008 preservada, pois já foi aplicada e possui registros.

## Entrega

- Aluno abre o treino e encontra o botão de iniciar dentro do próprio cartão. Durante a execução consulta a prescrição aberta, ordenação, séries/repetições prescritas, descanso, orientações, imagens privadas e links externos HTTPS. Não preenche dados por série.
- Retoma a mesma execução em andamento. Finaliza com resultado (concluído/não concluído), dificuldade e comentário opcional de até 2000 caracteres. Início/término/duração vêm do servidor.
- Resumo com identidade preta/dourada, prescrição original e geração opcional de card PNG de 1080×1350. Download sempre disponível após gerar; compartilhamento nativo por arquivo quando suportado pelo navegador. Nenhum compartilhamento externo é automático. Nenhum upload de imagem é feito para gerar o card. O renderizador recebe uma lista explícita de campos públicos; exclui identidade do aluno, comentário, programação, UUIDs e tokens.
- “Treinos realizados”: histórico paginado em 20 registros, do mais recente para o mais antigo, e abertura do snapshot daquele momento. Nenhuma leitura da biblioteca atual para reconstruir o passado.
- Calendário por mês, dias com atividade, contagem mensal de concluídos e não concluídos. Semana segunda–domingo. Datas de realização e frequência no horário de Brasília, baseadas no início da sessão.
- Estatísticas gerais: total, resultados, duração total/média, frequência semanal/mensal e distribuição de dificuldade. Incluem todos os registros finalizados, inclusive testes existentes e tentativas não concluídas. Registros antigos sem avaliação são identificados, sem preencher avaliações retroativamente.
- Não foi criado streak de dias consecutivos: a programação não define uma agenda de dias obrigatórios. Portanto dias sem treino não geram penalidade.
- Dentro da ficha administrativa do aluno: “Acompanhamento e feedbacks”, carregado somente ao abrir. Exibe treino, programação, data, duração, resultado, dificuldade e comentário privado. Destaque discreto para feedbacks finalizados nos últimos sete dias. Filipe pode consultar alunos inativos, preservando acompanhamento histórico.

## Arquivos principais

- `src/modules/execution/ExecutionPanel.tsx`: execução, feedback e resumo.
- `src/modules/execution/ExecutionHome.tsx`: retomada e acesso ao histórico.
- `src/modules/execution/ExecutionActivity.tsx`: histórico, calendário, estatísticas e visão do administrador.
- `src/modules/execution/activity.ts`: consulta de acompanhamento, datas e formatos.
- `src/modules/execution/ShareCard.tsx` e `share-image.ts`: geração local e compartilhamento/download do PNG.
- `src/modules/programs/StudentProgram.tsx` e `ProgramView.tsx`: início dentro do treino e consulta da prescrição.
- `src/modules/students/StudentForm.tsx`: acompanhamento dentro da ficha do aluno.
- `src/styles.css`: ajustes responsivos de leitura, botões, calendário, resumo e feedback.
- `tests/simple-execution.test.ts`, `tests/execution-interface.test.tsx`, `tests/execution-activity-interface.test.tsx`: banco e interfaces do bloco.
- `tests/visual/`: prévia isolada com dados fictícios, configuração própria que substitui o cliente Supabase. Não integra o build do aplicativo. Para reproduzir: build e preview com `--config tests/visual/vite.config.ts --configLoader native`, porta local 5180, caminho `/tests/visual/index.html`. Não usar essa página pelo servidor normal, pois a substituição do cliente depende da configuração de teste.

## Migrations e segurança

1. `202609250009_simple_execution.sql`: já preparada, preserva registros antigos, elimina a geração de set_logs em novas execuções, bloqueia RPCs antigas de escrita, acrescenta resultado simplificado/feedback/duração/data. Retomada, idempotência, auditoria, versões e snapshots permanecem.
2. `202609250010_execution_activity.sql`: índice de histórico e RPC read-only `execution_activity(student,month_start,page)`. Somente administrador com sessão válida ou o próprio aluno ativo com sessão válida. Negação explícita se a autorização não for true. Agregados calculados no banco abrangem todo o histórico; paginação não reduz as estatísticas. Não altera políticas já aplicadas nem amplia acesso a mídias.

O aluno não consegue consultar relatório, execução ou mídia de outro aluno por UUID. Não houve criação de administrador, alteração de role, bucket, autenticação ou políticas antigas. Comentários são exibidos como texto React, sem HTML injetado. O acesso à prescrição histórica continua passando por get_execution e pelas políticas privadas das imagens.

## Validação consolidada

- 90 testes passaram em 18 arquivos (Vitest).
- TypeScript da aplicação (`tsc -b`): aprovado.
- TypeScript das Edge Functions (`tsc -p tsconfig.edge.json`): aprovado.
- Build de produção Vite: aprovado; JS 570,18 kB, gzip 165,43 kB. Permanece aviso de chunk acima de 500 kB, já existente antes do bloco.
- Cobertura relevante: migração com dados antigos, snapshots imutáveis após edição, retomada, idempotência, conflito de versão, validação de feedback, paginação sem registros repetidos, data de Brasília na virada do mês/ano bissexto, agregação, aluno diferente, sessão revogada, usuário anônimo e admin consultando aluno inativo. Suites anteriores de acesso, biblioteca, mídia, editor e programações aprovadas.
- Navegador local a 390×844, componentes reais com backend fictício: fluxo de finalização, resumo, geração PNG, histórico, calendário e acompanhamento. PNG confirmado com dimensões naturais 1080×1350. Sem erros de console na conferência final. Corrigidos conflitos dos estilos globais de notice e radio para celular.
- Compartilhamento efetivo para aplicativo de terceiros não foi disparado. Depende de Web Share/File API no aparelho; baixar PNG é a alternativa.
- Testes de banco usam PGlite e fixtures de Auth/Storage, não substituem a rodada final no Supabase. Conexões simultâneas reais não foram exercitadas; locks, unicidade e conflitos de versão foram testados no ambiente local.

## Sequência única para aplicação e validação final

1. Revisar 009 e 010 e autorizar a aplicação. Não reaplicar 008.
2. Executar o arquivo completo 009 no SQL Editor. Se houver erro, parar e enviar o erro; não executar 010.
3. Após sucesso da 009, executar o arquivo completo 010. Não reaplicar arquivos já confirmados com sucesso.
4. Atualizar o aplicativo com o build local deste bloco. Como aluno de teste, abrir um treino, iniciar, atualizar a página e confirmar retomada da mesma execução; finalizar como concluído com dificuldade/comentário. Conferir resumo, duração, histórico, prescrição e gerar/baixar PNG. Fazer uma segunda execução como não concluída, comentário opcional.
5. Na ficha do mesmo aluno, entrar como Filipe e conferir os dois resultados, feedbacks, programação, calendário e estatísticas. Alterar a prescrição atual de teste e confirmar que o registro finalizado mantém a original.
6. Entrar como outro aluno e conferir que histórico/feedbacks/mídia do primeiro não são acessíveis. Fazer verificação final de RLS com sessões reais válidas, incluindo tentativa de consulta por UUID, antes de considerar validado em produção.
7. No celular real, conferir leitura, botões, retorno ao treino e download/compartilhamento nativo quando disponível. Corrigir somente falhas efetivamente encontradas nessa rodada.

Não houve execução de migration, configuração remota, deploy ou apagamento de dados. A autorização para implementar localmente não foi tratada como autorização remota.
