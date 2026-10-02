# Execução de treinos — primeira entrega local

Estado: implementação local em 25/09/2026. Migration 202609250008_workout_execution.sql preparada para revisão do responsável; não foi executada remotamente. Migrations 001–007 preservadas. A aplicação depende da aprovação e aplicação desta migration para habilitar a execução no Supabase.

## Primeira entrega implementada
O aluno abre um treino atribuído e toca em Iniciar treino. A sessão guarda uma cópia completa da prescrição e permite registrar repetições e carga em kg por série, marcar séries realizadas e salvar cada registro. Ao reabrir o aplicativo, retoma a sessão e os registros confirmados no servidor. Concluir treino exige confirmação, informa séries não realizadas e fecha a sessão com um resumo permanente. Nenhuma série pendente será marcada como realizada automaticamente.

Uma sessão em andamento por aluno. Iniciar novamente ou repetir uma requisição não cria outra sessão. O aluno pode abandonar a sessão mediante confirmação, preservando os dados já registrados com status abandonada, sem contabilizá-la como concluída. Uma sessão abandonada ou concluída não pode receber alterações silenciosas.

Cronômetro, feedback, dashboard de execução do coach, gráficos, PRs e cards compartilháveis permanecem nas entregas posteriores. A primeira entrega inclui somente o resumo da sessão e a retomada necessária ao fluxo; não inclui a página completa de histórico/evolução.

## Decisões de dados e segurança
- workout_sessions: UUID, student_id, program_id e program_version, entry_id da versão, workout_id e workout_version, snapshot, status, started_at, ended_at e versão para concorrência. Não confundir com private.app_sessions, que controla autenticação.
- session_items: identidade própria, posição, exercise_id e referência lógica ao item da revisão, prescrição e dados demonstrativos imutáveis. Não vincular execução exclusivamente a linhas mutáveis de workout_items ou program_entries.
- set_logs: item da sessão, número da série, repetições realizadas, carga numérica e unidade, status, horário e versão. Prescrição e realização ficam separadas. Carga vazia é desconhecida; zero é explícito e não será preenchido automaticamente. Carga com vírgula decimal será normalizada na interface. A primeira versão usa kg e orienta o aluno a manter a mesma convenção de carga em cada exercício.
- execution_audit: ação, ator, sessão, identidade da requisição e horário. Gravação de série e auditoria na mesma transação. Correções durante a execução preservam os valores anteriores necessários à rastreabilidade; após a conclusão, ficam bloqueadas nesta entrega.
- Mutações somente por RPC; RLS e validação de sessão ativa, perfil e senha obrigatória aplicadas também no servidor. O aluno só opera suas sessões. Filipe mantém leitura administrativa autorizada, sem escrever resultados em nome do aluno nesta entrega.
- Horários de início/fim definidos pelo servidor. A duração inicial será tempo decorrido, incluindo intervalos e tempo fora da página; não será apresentada como tempo de esforço ativo.

## Concorrência e preservação
Início valida a programação ativa do próprio aluno, o início da vigência (calendário America/Sao_Paulo), a versão esperada e a presença do treino selecionado. A programação futura continua disponível para consulta, mas a execução só começa a partir da data definida. O servidor monta o snapshot a partir de program_revisions; não aceita uma prescrição enviada pelo cliente como fonte confiável.

Editar ou substituir uma programação afeta novos inícios. A sessão já iniciada poderá ser retomada usando a fotografia original; desativação do aluno ou invalidação de autenticação continua bloqueando acesso. Essa decisão evita perder uma sessão em andamento por reordenação da ficha.

O começo e a conclusão usam identificadores idempotentes e bloqueios transacionais. Um reenvio idêntico devolve o resultado já confirmado; reutilizar a mesma chave com conteúdo diferente é erro. Atualização de série exige versão esperada, impedindo sobrescrita silenciosa entre abas. Conclusão verifica a versão da sessão, impedindo corrida com salvamento de série.

As imagens utilizadas na sessão permanecem retidas. Uma política específica permitirá ao proprietário consultar somente a mídia referenciada em suas sessões, inclusive após o encerramento da programação original, sem abrir a biblioteca global. Vídeos continuam externos HTTPS; preservamos o endereço, não os bytes do provedor.

## Salvamento e falhas
Mostrar estados Salvando, Salvo e Falha ao salvar por registro. Uma resposta incerta é reconciliada pelo identificador da requisição antes de reenviar. Não declarar sucesso local como persistência no servidor.

Nesta primeira entrega, a retomada garante dados já confirmados pelo servidor. Campos ainda não salvos podem ser perdidos ao fechar a página. Sem prometer execução offline: a fila IndexedDB, isolada por usuário e com resolução de conflitos, fica para a etapa própria. Não permitir concluir enquanto existirem registros em envio ou erro não resolvido. Sair da tela com mudanças pendentes deve exigir confirmação.

## Cobertura dos testes locais
1. Início autorizado, antes da vigência bloqueado, clique duplicado e requisição repetida sem duplicação.
2. Gravação por série, validação numérica, falhas, reenvio idempotente e conflito entre abas.
3. Retomada após recarga com os registros efetivamente salvos.
4. Preservação da sessão após alteração de treino, exercício e programação; imagens históricas acessíveis somente ao dono e administrador autorizado.
5. Conclusão parcial explícita, resumo fiel, corrida salvar/concluir, abandono preservado e bloqueio de alteração após fechamento.
6. Outro aluno, acesso anônimo, sessão inválida, perfil inativo e troca de senha pendente sem acesso aos registros.
7. Interface no celular, navegação por teclado, ausência de indicadores fictícios e regressão das funcionalidades validadas.

## Continuidade preservada
Feedback será vinculado à sessão concluída e terá fluxo separado, para não perder uma conclusão ao interromper o feedback. Evolução de cargas usará exercise_id, unidade e séries efetivamente realizadas. PRs terão critérios versionados e série/sessão de origem. Cards usarão apenas dados de uma sessão concluída, sem publicar dados privados ou de saúde. O cronômetro futuro persistirá um horário final de descanso para resistir à suspensão da aba.

## Processo
Primeiro código, migration incremental e testes locais. Somente depois apresentar a migration ao responsável pelo Supabase, uma ação por vez e aguardando a confirmação antes da validação hospedada. Não executar nem modificar migrations antigas.

## Estrutura implementada
Cada session_item contém seu snapshot, exercise_id e source_item_id. Cada set_log possui set_number (número da série prescrita), prescribed_repetitions textual para preservar faixas, actual_repetitions inteiro, load_kg numérico, load_unit, status, recorded_at e versão. Não existe exclusão de séries pelo aplicativo.

Estados: pending durante a execução, completed (realizada), failed (tentativa não concluída, permitindo zero repetições) e not_performed (não realizada). Na conclusão ou abandono, toda pending se torna not_performed na mesma transação. Esses registros permanecem no resumo e no banco, com prescrição intacta. Carga nula significa não informada; zero é um valor explícito. Séries não realizadas não aceitam carga ou repetições fictícias. Limites: repetições 0–10.000 (realizada exige pelo menos 1), carga 0–10.000 kg e até três casas decimais; a interface aceita vírgula decimal.

O vínculo é com program_id/program_version, workout_id/workout_version e entry_id do snapshot, sem FK para o item mutável atual. A sessão copia somente o treino escolhido daquela programação. Campos e mídia usados na execução não são relidos da biblioteca atual. A alteração da programação original não muda a sessão já iniciada.

Uma execução em andamento por aluno é garantida por índice único parcial e bloqueio do perfil no servidor. Tentativas de iniciar a mesma entrada retomam a execução existente. Iniciar outra exige primeiro concluir ou abandonar a atual. Reenvios de start/save/finish usam execution_requests, tabela privada com chave por usuário e requisição. A mesma chave com conteúdo diferente é rejeitada. Atualizações de série exigem sua versão atual; a conclusão exige a versão da sessão, invalidada por qualquer gravação de série.

O histórico de mudanças de resultado fica em execution_audit, com valores anteriores/posteriores por gravação de série. A conclusão armazena os IDs das séries pendentes finalizadas e o resumo; abandono é distinguido de conclusão. Clientes não têm escrita direta em nenhuma tabela, nem execução das funções privadas. O administrador lê resultados, mas não registra séries em nome do aluno nesta entrega. Após fechamento, RPCs rejeitam novas edições.

O aluno retoma automaticamente a execução em andamento ao abrir sua área. Uma vez encerrada, pode consultar o resumo da última execução. Registros anteriores permanecem preservados no banco; a página completa de histórico será posterior. Não há cronômetro, feedback, gráficos, PRs ou compartilhamento. Tempo exibido no resumo é tempo decorrido, não duração de esforço ativo.

## Validação realizada
84 testes locais aprovados em 16 arquivos. PostgreSQL WASM/PGlite executou migrations 001–008 com Auth/Storage simulados; testes de interface usam serviços simulados. Cobertura inclui séries individuais, estados, dados numéricos, reenvio idempotente, conflitos de versão, retomada, versão exata da prescrição, retenção de imagens, conclusão parcial, abandono e bloqueio por RLS. Os bloqueios e a unicidade estão implementados no banco; a suíte local não substitui um teste de concorrência com conexões reais no Supabase. Revisão React inclui efeitos com limpeza, campos rotulados, botões bloqueados durante envio, preservação de edições de outras séries e avisos de saída com alterações pendentes.

A retomada garante os registros confirmados pelo servidor. Não foi implementada fila offline. Campos ainda não salvos não são garantidos após fechar o aplicativo; a interface informa isso e solicita confirmação nas saídas controladas. Uma falha de rede nunca vira sucesso simulado.

## Revisão remota pendente
Revisar somente supabase/migrations/202609250008_workout_execution.sql. Ela adiciona tabelas, índices, políticas e RPCs da execução, amplia a leitura de imagens exclusivamente para execuções próprias e atualiza a consulta de retenção para incluir execution_media. Não modifica configuração do bucket, autenticação ou migrations antigas. Não exige nova chave secreta nem Edge Function.

Aguardar a revisão do responsável antes de orientar qualquer execução. O agente não realizou operações remotas.
## Revisão de segurança antes da aplicação
Conferida a implementação vigente em 202609230003_username_access.sql: private.is_active_student(student_id) exige student_id = auth.uid(), profile ativo com role student, must_change_password=false e private.session_valid. A função can_read_execution foi mantida. Políticas de workout_sessions, session_items e set_logs, get_execution e a leitura das imagens usam essa autorização. Testes com outro aluno autenticado e sessão válida consultam os UUIDs conhecidos diretamente e não obtêm registros nem mídia.

save_execution_set agora rejeita explicitamente entradas incoerentes antes do UPDATE com SQLSTATE 22023. not_performed exige repetições e carga nulas; completed exige 1–10.000 repetições; failed exige 0–10.000. Para completed/failed, carga é opcional ou numérica entre 0–10.000 kg, até três casas decimais. NaN e infinitos são rejeitados. Os CHECKs permanecem como defesa adicional. A comparação de request_id/payload, a concorrência e a auditoria permanecem na mesma ordem.

Suíte local reexecutada com casos ampliados: estados inválidos, valores nulos, zero, limites, precisão, NaN/infinito, nenhuma alteração de séries/versões/auditoria/requests em caso de falha e leitura direta de UUIDs de outro aluno. Nenhuma alteração remota.


## Revisão de experiência — 25/09/2026: execução simples

A pedido do usuário, o aluno apenas consulta a prescrição, inicia e finaliza o treino. Não existem formulários por série, carga, repetições efetivas ou resultado de exercício. O componente SetEditor e suas chamadas de escrita foram removidos.

A migration 008 já foi aplicada pelo usuário e recebeu registros de teste. Portanto ela foi preservada integralmente. A migration incremental 202609250009_simple_execution.sql está preparada SOMENTE LOCALMENTE e aguarda revisão/confirmação; não houve execução remota.

009 preserva todas as sessões, snapshots, séries e auditorias anteriores. Novas execuções recebem execution_mode=simple e não criam set_logs. Registros anteriores são identificados como legacy_sets. Uma sessão antiga ainda em andamento pode ser retomada e finalizada no novo fluxo, sem reescrever resultados antigos nem inferir séries realizadas/não realizadas. As antigas RPCs de escrita por série e encerramento sem feedback deixam de ser executáveis pelos clientes.

Finalização: completed ou not_completed; dificuldade obrigatória easy/balanced/hard (Fácil/Na medida/Difícil); comentário opcional até 2000 caracteres. Um único UPDATE protegido salva resultado, feedback, término e versão. Duração em segundos é gerada no banco a partir dos horários. performed_on usa a data de início em America/Sao_Paulo. Comentários vazios são normalizados para null. Registros legados abandoned continuam intactos e são exibidos como não concluídos; não são reclassificados no banco.

Mantidos: snapshot da prescrição, versões exatas, imagens retidas, RLS, identidade do proprietário, auditoria, lock por aluno, uma execução em andamento por aluno e idempotência por request_id. A retomada não cria execução nova. Não há alteração de registros finalizados pela interface/RPC. Falha de resposta mantém feedback e request_id para repetição; conflito permite consultar o servidor.

O histórico permanece no banco e o resumo da última execução continua disponível. Tela completa “Treinos realizados”, painel do Filipe, calendário, frequência, sequência de dias, estatísticas e card social permanecem para etapas futuras. Não há cronômetro ou coleta de carga/repetições realizadas. A arquitetura fornece estudante, programação/treino, versão, snapshot, datas, duração e feedback para essas próximas entregas.

Validação local: 84 testes em 17 arquivos, incluindo banco PGlite e interface jsdom. Testada atualização 008→009 com dados existentes, preservação de séries antigas, revogação das RPCs antigas, novos treinos sem set_logs, finalização nos dois estados, feedback inválido, concorrência por versão, replay, snapshots e isolamento de outro aluno inclusive imagens. Testes antigos de 008 permanecem como regressão da migração histórica. TypeScript aplicação/Edge e build de produção verificados. Validação no Supabase e navegador com dados reais aguarda aplicação autorizada da 009; nenhuma alteração remota realizada.

## Atualização: bloco integrado de experiência de treinos

A estratégia passa a ser desenvolvimento em blocos completos e uma bateria consolidada ao final, com confirmações apenas para decisões essenciais e ações remotas/irreversíveis. O bloco de execução, feedback, histórico, calendário, estatísticas e card está implementado localmente. O escopo futuro indicado acima foi parcialmente entregue por este bloco; estado final, evidências e aplicação em `BLOCO_EXPERIENCIA_TREINOS.md`. 009 e 010 aguardam autorização. 008 permanece intacta.
