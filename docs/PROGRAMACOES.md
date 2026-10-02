# Programações de treino por aluno

## Estado da entrega
Implementação local; migration 202609240007_student_programs.sql ainda não aplicada ao Supabase pelo agente. As migrations 001–006 permanecem intactas. Não requer Edge Function nova nem chave secreta no frontend.

## Comportamento
Abra um aluno já cadastrado e use **Nova programação**. Defina nome, início e adicione de 1 a 26 treinos da biblioteca. Os rótulos (Treino A, B etc.) são editáveis; a ordem é independente da biblioteca. Salvar cria um rascunho. **Ver versões** permite conferir a ficha antes de ativá-la.

Existe no máximo uma programação ativa por aluno. Ativar um rascunho exige confirmação. Se já houver uma ativa, a confirmação identifica as duas: encerrar a anterior e ativar a nova acontece na mesma transação. A programação fica disponível imediatamente ao ativar, mesmo com data de início futura; não há agendamento automático. Encerrar retira a ficha da área do aluno e conserva todo o histórico administrativo.

Rascunhos e programações ativas podem ser editados. Encerradas são somente leitura. Cada alteração cria uma nova versão; não há propagação automática de mudanças da biblioteca. Para atualizar um treino atribuído, o Filipe escolhe explicitamente a versão mais recente no editor. A lista de alunos mostra o nome da programação ativa. Alunos inativos não recebem novas programações; o coach ainda pode encerrar uma existente.

## Integridade, concorrência e autorização
- student_programs identifica a programação, aluno, status e versão atual; índice parcial garante uma ativa por aluno.
- program_entries mantém ordem, rótulo e a versão explícita de cada treino.
- program_revisions armazena snapshots completos: programação, treinos, prescrições, instruções, mídia e IDs estáveis. O cliente não pode modificar nem excluir esses registros.
- program_audit registra o autor, versão e ação, incluindo a programação substituta. Uma entrada por mudança de versão; substituição gera uma para a antiga e uma para a nova.
- RPCs validam administrador e bloqueiam o registro do aluno para serializar operações. O número de versão esperado evita sobrescrever alterações concorrentes. Substituição também exige a versão esperada da programação ativa anterior.
- RLS permite ao aluno somente a programação ativa dele e sua versão atual, com perfil ativo, troca de senha concluída e sessão válida. Não libera biblioteca global, outros alunos, rascunhos, versões anteriores ou auditorias. O aluno não tem permissão de escrita.
- Falhas são exibidas; não há fallback para armazenamento local. Após resposta incerta, atualizar e conferir antes de repetir.

## Imagens e vídeo
program_media vincula cada versão ao objeto privado efetivamente existente no bucket exercise-images. O bucket continua privado, JPEG/PNG/WebP, máximo 5 MB. O aluno pode baixar somente imagens citadas na versão ativa dele. O aplicativo usa download autenticado e URL de Blob em memória, sem gerar URL pública.

Ao substituir uma imagem da biblioteca, objetos usados em programações são retidos, inclusive em rascunhos ou versões encerradas. A verificação de limpeza evita tentar apagar esses objetos; uma política restritiva de DELETE e uma FK também impedem exclusão acidental. Assim, pode haver mais de um objeto físico de uma imagem após uma substituição, embora o exercício continue tendo só uma imagem atual. Isso preserva a consulta histórica. Não há tarefa automática de limpeza de histórico.

Se uma versão antiga de treino apontar para uma imagem removida antes desta etapa, a atribuição inteira é recusada sem gravação parcial. Salve o treino novamente no editor para registrar a mídia atual e escolha essa nova versão na programação. Não altere snapshots históricos manualmente.

video_url permanece HTTPS e independente de provedor. O endereço é preservado no snapshot, mas o conteúdo de um provedor externo pode mudar ou desaparecer.

## Limite da etapa e continuidade
Somente atribuição e consulta. Não há execução, séries realizadas, cargas, cronômetro, conclusão, feedback, histórico de execução, recordes ou compartilhamento.

Na próxima fase, cada sessão de execução deverá referenciar program_id + versão e guardar seu snapshot próprio, com IDs de treino/item/exercício e mídia retida. Os logs realizados não referenciarão exclusivamente linhas mutáveis de program_entries ou workout_items. Feedback, evolução de carga, PRs e cards serão derivados das sessões reais, conforme TREINOS.md. Versões antigas nunca serão reescritas para adequar uma sessão em andamento.

## Validação
Testes locais usam PostgreSQL WASM (PGlite) com estruturas Auth/Storage simuladas e a sequência completa 001–007. Cobrem ativação, edição, conflitos, rollback, substituição, encerramento, snapshots, auditoria, bloqueio de escrita direta, RLS com aluno diferente e com sessão inválida, e retenção de imagens. Testes de interface cobrem seleção/ordem, preservação em erro, confirmação de substituição, versões explícitas e consulta do aluno. A validação no serviço real ainda será feita pelo responsável, uma etapa por vez, após aplicar a migration.

## Próxima ação remota — somente uma
No SQL Editor do projeto **Sistema Fernandes**, executar integralmente 202609240007_student_programs.sql e confirmar o resultado. Não executar outras migrations ou configurações nesta etapa. Após a confirmação, seguir para o primeiro teste no aplicativo.

Resultado local: 76 testes aprovados (75 na suíte completa, seguido da ampliação e revalidação dos testes de programações), TypeScript do aplicativo e Edge Functions aprovado, build de produção aprovado. O aviso preexistente de bundle acima de 500 kB permanece. Não houve teste hospedado nem alteração remota nesta entrega.

## Validação informada pelo responsável — 25/09/2026
O responsável aplicou a migration 007 e confirmou os fluxos de atribuição, consulta, edição, versões anteriores, substituição, encerramento e isolamento pela interface. A captura da consulta de auditoria apresentou criação, ativação, atualização e encerramento; a substituição foi confirmada pelo responsável sem captura correspondente. O teste SQL sob authenticated com o UID do aluno_teste_2 retornou zero programações de outros alunos e zero auditorias visíveis. Nenhuma execução remota foi feita pelo agente. A próxima fase começa pelo planejamento em EXECUCAO.md.
