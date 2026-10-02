# Validação e limites da entrega

## Atualização: usuário e senha (24/09/2026)

**55 testes passaram em 7 arquivos.** TypeScript do frontend e das Edge Functions e build de produção aprovados. O build mantém um aviso de tamanho de bundle; não houve erro de compilação. Testes novos cobrem login com transporte Auth simulado, tentativas limitadas, cadastro, redefinição, troca obrigatória, sessões antigas bloqueadas, RLS, concorrência de operações e preservação byte a byte das migrations 001 e 002.

Apenas testes locais foram executados. A migration 003, as novas funções e o administrador não foram aplicados/criados no Supabase remoto. O restante desta página é o histórico da versão anterior por e-mail; o fluxo atual está em `ACESSO-USUARIO.md`.

Resultado local em 23/09/2026: TypeScript e build de produção aprovados; **29 testes passaram em 5 arquivos**. A função de convite foi exercitada com transporte Supabase simulado (JWT ausente/inválido, aluno tentando operar como admin, entrada inválida, redirect fixo e falha parcial). Não foram enviados e-mails reais.

No navegador: tela inicial, recuperação, retorno ao login e erro de conexão ausente verificados. Sem erros ou avisos no console capturado. Larguras de 390 e 1366 pixels verificadas sem rolagem horizontal. A captura desktop fornecida pelo navegador ficou recortada; a inspeção visual completa de desktop segue pendente, embora as dimensões do DOM tenham sido verificadas.

## Etapa 1

Implementados: estrutura React/TypeScript/Vite, estilos, foto original, login, recuperação, definição de senha, rotas de perfil e migração de identidade.

Verificações automatizadas: decisões de acesso, senha mínima e confirmação, mensagens de erro sem detalhes internos; execução da migração de identidade em PostgreSQL WASM.

Pendente: login real, recuperação por SMTP, convite e expiração em projeto Supabase de homologação. Nenhuma credencial/projeto foi fornecido.

## Etapa 2

Implementados: lista, busca, filtros, contagens de alunos, formulário, edição, desativação, RPCs transacionais, convite no backend e auditoria de alterações. Indicadores de treinos e check-ins dependem dos módulos posteriores.

Verificações automatizadas: políticas RLS reais em PostgreSQL WASM com papéis Auth simulados; dados de teste descartáveis; validação dos dados recebidos pelo backend.

Pendente: implantação e execução da Edge Function em Deno/Supabase; convite e persistência fim a fim; testes com conta do coach e duas contas de alunos.

## Teste integrado obrigatório antes da publicação

1. Conta do coach entra em `/admin`; aluno entra em `/aluno`; perfil ausente vai para `/acesso`.
2. Convide um endereço controlado pelo responsável, confirme chegada do e-mail, defina senha e entre.
3. Reabra o aplicativo e confirme que nome, objetivo, status e notas foram persistidos.
4. Aluno A não lê nem altera o cadastro do B por chamada direta à API; nenhum aluno lê notas administrativas ou auditoria.
5. JWT ausente, inválido, expirado ou de aluno é recusado pelo convite; dados malformados e e-mail duplicado são recusados.
6. Desative um aluno com sessão aberta; uma nova consulta aos dados precisa ser bloqueada pelo banco.
7. Verifique recuperação válida, link expirado, link reutilizado e confirmação de nova senha. Teste requisitos de reautenticação do Auth.
8. Simule falha de rede antes/depois de salvar e indisponibilidade do envio de e-mail. Não informar sucesso se houver erro.
9. Teste lista vazia, carregamento e falha de carregamento. Contagens não podem exibir zero como se fossem dados carregados quando há erro.
10. Verifique mobile, desktop, teclado e ampliação de texto. Publicação/PWA ficam para as etapas específicas.

Os testes locais de RLS executam as migrações, mas não substituem o PostgREST, Auth, SMTP, Storage ou as Edge Functions hospedadas. Os testes de interface com serviços simulados verificam comportamento, não comprovam persistência externa.
