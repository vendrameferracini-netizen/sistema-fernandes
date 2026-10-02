# Biblioteca de Exercícios — primeira etapa

Implementado: rota /admin/exercicios, navegação administrativa, cadastro, edição e pesquisa por nome, grupo muscular e equipamento (sem distinguir acentos ou maiúsculas). Campos: nome e grupo muscular obrigatórios; equipamento e orientações opcionais.

A migration 202609240004_exercises.sql cria exercises e exercise_audit. A leitura exige private.is_admin(), que inclui sessão válida e senha já trocada. Gravação somente por save_exercise, com autorização, validação no banco, auditoria transacional e detecção de edição concorrente. Alunos não acessam a biblioteca nesta etapa. As migrations 001–003 não foram editadas. Não há upload, buckets, mídia ou atribuição de treino.

Validação local: 58 testes aprovados, incluindo execução das quatro migrations em PostgreSQL WASM, bloqueio de aluno/anônimo, sessão revogada, troca obrigatória, auditoria, validação, conflito de edição, pesquisa e formulários com serviço simulado. Validação hospedada pendente: aplicação manual da migration, cadastro, recarga, pesquisa, edição e permissões no projeto real. Nenhuma alteração remota foi executada.

Próxima ação do responsável: no SQL Editor do projeto Sistema Fernandes, executar integralmente a migration 004 e informar o resultado. Não reaplicar as migrations anteriores. Aguardar confirmação antes de orientar o teste integrado.
