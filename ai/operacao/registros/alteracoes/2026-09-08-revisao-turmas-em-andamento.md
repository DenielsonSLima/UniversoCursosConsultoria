# Revisão das turmas técnicas em andamento — 4.8.37

## Escopo e achado

- Revisão solicitada após publicação da 4.8.36 (PR #131, commit 25186cda7d475e1f3c7f3b0ad10697c032666bb3).
- Caso reproduzido: editar valores inválidos, voltar à primeira etapa e escolher sem novas cobranças. Os campos eram ocultados, mas o rascunho inválido continuava no payload; o validador canônico do banco rejeitava o cadastro.
- Correção: somente ao selecionar IMPORTADA_CONCLUIDA, restaurar as referências financeiras válidas do formulário antes de aplicar os bloqueios de matrícula/automação. Dados acadêmicos permanecem intactos.
- Valores internos continuam sendo referências de compatibilidade, sem gerar dívida ou indicar quitação. Nenhuma turma existente é alterada.
- Revisados criação/replay, guardas de turma/matrícula, estado do ciclo externo, configuração financeira, validação e transmissão do formulário. Sem novo achado de backend que exija migration.

## Manifesto explícito

- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.constants.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-origem.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-origem.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-08-revisao-turmas-em-andamento.md`

Total: 8 arquivos. Migrations já aplicadas são imutáveis e não pertencem a esta correção.

## Aceite e validação

- Teste de regressão reproduziu a falha antes do patch e passou depois; 20 testes Node do formulário aprovados.
- Preservar curso, datas, matrícula desativada, ausência de vencimento e configuração compatível com o validador do servidor.
- Nova seleção de NOVA ou IMPORTADA_CICLO_1 não apaga mensalidades/encargos configurados.
- Ledger remoto confirmou as três migrations da 4.8.36, sem necessidade de reaplicação.
- TypeScript, build 4.8.37, controle de versão e limite de linhas aprovados.
- Smoke Safari local com rascunho inválido (mensalidade/quantidade zero, juros 101): seleção sem cobranças percorreu as cinco etapas e submit, preservando dados acadêmicos e retornando referências válidas (12 parcelas, valor 279,90, juros 1), matrícula desativada e sem vencimento. Serviços simulados; nenhuma criação em produção.
- Resultados de CI, Preview e publicação serão registrados no PR da 4.8.37.
- Entrega via MCP GitHub; autorização de publicação da mesma funcionalidade permanece vigente nesta conversa.
