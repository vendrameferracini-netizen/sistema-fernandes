# Imagem privada e vídeo externo dos exercícios

## Escopo
Uma imagem opcional por exercício cadastrado, em bucket privado exercise-images. JPEG, PNG e WebP, até 5 MiB. O vídeo permanece externo no campo video_url: HTTPS, sem dependência de provedor. A interface abre o link em nova aba com noopener/noreferrer; não incorpora iframe e não baixa vídeo.

No formulário de um exercício já salvo, a imagem é enviada por uma ação separada. O novo cadastro informa que a imagem pode ser adicionada ao reabrir Editar. A visualização baixa a imagem com a sessão autenticada e cria uma URL local temporária, revogada ao desmontar/trocar a imagem. Não há URLs públicas de Storage nem chaves administrativas no frontend.

## Migration 005
Preserva migrations 001–004 e registros existentes. Adiciona video_url com padrão vazio e image_path nulo. Cria bucket privado com restrições de tamanho e MIME, políticas administrativas de leitura/upload/limpeza e RPCs com private.is_admin. save_exercise_details verifica autorização e grava todos os campos, incluindo video_url e updated_at, em um único INSERT/UPDATE protegido por versão; emite exatamente um registro de auditoria na mesma transação. A RPC anterior permanece compatível. set_exercise_image exige objeto existente na pasta do exercício, metadata de imagem válida, versão do cadastro e caminho anterior. A imagem atual não pode ser removida pela política de limpeza. Alunos não acessam imagens nesta etapa.

## Substituição e falhas
Upload usa nome UUID novo e sem upsert. A nova imagem é vinculada antes de tentar remover a antiga pela API Storage, nunca por DELETE SQL em storage.objects. Falha de limpeza informa que a imagem anterior ainda ocupa espaço e oferece nova tentativa. Uma resposta incerta de vinculação não dispara exclusão automática: o usuário deve reabrir o exercício. Uploads sem vínculo podem permanecer em falhas de rede/conflito ou fechamento da página; eventual limpeza precisa conferir image_path antes de remover via Storage. Não há job automático de limpeza nesta etapa.

## Verificação
63 testes locais aprovados. Incluem migrations em PostgreSQL WASM com tabelas Storage simuladas, restrições por papel, proteção da imagem referenciada, substituição, concorrência, links externos, rollback de auditoria em URL inválida, formatos/tamanho e falhas de upload/vínculo/limpeza. Os testes não substituem a verificação hospedada do serviço Storage. TypeScript e build verificados separadamente.

## Próximo passo no Supabase
Executar integralmente supabase/migrations/202609240005_exercise_images_video.sql no SQL Editor do projeto Sistema Fernandes e informar o resultado. A migration cria o bucket; não criar outro manualmente. Nenhuma operação remota foi executada pelo agente. Após confirmação, testar link, envio, recarga, substituição e restrição de acesso, uma etapa por vez.

Referência: https://supabase.com/docs/guides/storage/buckets/fundamentals

Revisão antes da aplicação: reexecução local testada sem duplicar bucket, registros ou auditoria. Bucket existente compatível é reutilizado; configuração divergente causa erro e rollback, sem sobrescrever o bucket. Testes adicionais cobrem edição só do vídeo, versão obsoleta e auditoria única.

## Evolução na etapa 007
A etapa 005 foi validada pelo responsável. A migration 007 de programações acrescenta leitura de imagens atribuídas ao aluno e retenção de objetos usados em versões históricas, mantendo o bucket privado e seus limites. A limpeza agora consulta exercise_image_is_retained antes de remover uma imagem anterior. Objetos retidos permanecem no Storage intencionalmente. Ver PROGRAMACOES.md.
