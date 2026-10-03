# Transferências: empresas identificadas e saldo por polo

Data: 2026-10-03. Estado: publicação 4.8.161 autorizada; proteção do banco aplicada, CI e deploy em andamento.

## Objetivo e aceite

- Substituir os quatro seletores do modal por controles pesquisáveis do sistema.
- Empresas em duas linhas: nome; CNPJ formatado e cidade/UF.
- Exibir o saldo gerencial da conta no polo de cada lado, com consultas independentes.
- Preservar transferência entre polos na mesma conta e impedir origem/destino idênticos.
- Erros e carregamentos não podem ser apresentados como saldo zero ou saldo global.

Mudança crítica financeira, analisada com três agentes conforme pedido explícito.
O lote Proesc em `LOTE_ATIVO.md` permanece preservado; este registro identifica
o trabalho paralelo, sem alterar memória. Produção autorizada explicitamente pelo responsável após revisar o resumo do lote.

## Diagnóstico

O modal filtrava a lista carregada para o polo da página e apresentava `saldoAtual`
nos dois lados. O contrato existente `get_contas_bancarias_para_polo_secure`
já entrega `saldo_gerencial_polo`; não é necessário criar uma RPC de saldo.
A conta bancária compartilhada conserva saldo contábil global, enquanto movimentos
por polo e rateios internos compõem o saldo gerencial específico.

## Manifesto explícito

Total: 17 arquivos.

- `ai/operacao/registros/alteracoes/2026-10-03-transferencias-seletores-saldos.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/financeiro/financeiro.shared.service.ts`
- `modules/gestor/financeiro/transferencias/TransferenciasTab.tsx`
- `modules/gestor/financeiro/transferencias/hooks/useTransferenciaAccountsQueries.ts`
- `modules/gestor/financeiro/transferencias/transferencias.accounts.test.mjs`
- `modules/gestor/financeiro/transferencias/components/TransferenciaFormModal.tsx`
- `modules/gestor/financeiro/transferencias/components/TransferenciaPicker.tsx`
- `modules/gestor/financeiro/transferencias/components/TransferenciasList.tsx`
- `modules/gestor/financeiro/transferencias/components/transferencia-options.ts`
- `modules/gestor/financeiro/transferencias/components/transferencia-options.test.ts`
- `supabase/migrations/20261003180000_authorize_transfer_replay_before_lookup.sql`
- `supabase/tests/transfer_replay_scope.fixture.sql`
- `supabase/tests/transfer_replay_scope.isolated.test.mjs`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`

## Validação e limites

A reprodução original foi conferida em sessão Safari antes da orientação posterior
do usuário para não usar navegador. Nenhuma transferência foi salva. Após essa
orientação, a validação continua exclusivamente por código, testes e consultas MCP
de leitura. O smoke visual do patch não será executado neste atendimento.

Produção autorizada em mensagem posterior: “publique autorizado eu cofniro depois, atualize producao”. A conferência visual será feita pelo responsável; o navegador continua fora da execução. Nenhuma transferência ou cobrança será criada na validação.


## Resultado e evidências

- Comboboxes próprios com pesquisa por nome/documento/localidade, teclado e portal.
- Consulta independente por polo de origem/destino, cache separado e eventos por ambos
  os polos; erro, saldo ausente e carregamento não usam saldo global como substituto.
- Mesma conta entre polos continua permitida; conta/polo idênticos são rejeitados.
- Estorno passa valor numérico diretamente à formatação brasileira, preservando centavos.
- A alteração em `financeiro.shared.service.ts` limita-se ao mapeamento de
  `saldoGerencialPolo`: nulo permanece indisponível, zero válido permanece zero.
  O arquivo preexistia localmente sem rastreamento; preservar integralmente os demais
  trechos ao preparar eventual entrega remota.
- Leitura MCP do cálculo canônico confirmou saldo gerencial Banese Matriz 260 e
  Propriá 0, enquanto saldo contábil global era 260. O corpo SQL foi consultado em
  leitura administrativa; não houve execução do wrapper com sessão autenticada.
- Saldo inicial de conta compartilhada permanece não distribuído, sem repetição em
  cada polo. Cortes operacionais e rateio interno existentes foram preservados.

Validação final: 9 testes focados aprovados; ESLint do manifesto de código aprovado;
TypeScript das entradas afetadas e dependências sem diagnósticos. Sem build global.
As verificações estáticas de teclado/ARIA não substituem interação visual.

Teto conferido diretamente nos 14 arquivos do manifesto: todos abaixo de 500 linhas,
maior arquivo com 470. `git diff --check` do escopo passou. O comando obrigatório
`npm run check:file-lines` foi executado e encontrou 14 referências ausentes em
manifestos/arquivos anteriores, nenhuma pertencente a este lote. Não foram alteradas
essas pendências externas para ampliar o escopo silenciosamente.

## Proteção adicional do contrato, aplicada nesta publicação

A revisão encontrou autorização posterior ao lookup de replay e permissões efetivas
TRUNCATE para anon/authenticated. A migration independente autoriza ambos os polos
antes do replay e revoga privilégios de escrita/DDL indevidos; mantém SELECT e RPC.
Não é dependência da correção de interface/saldos, nem modifica cálculo financeiro.

O ensaio `transfer_replay_scope.isolated.test.mjs` executou a função legada e a nova
em PostgreSQL PGlite efêmero: reproduziu replay sem permissão e confirmou a correção,
sete campos imutáveis, ausência de acesso a cada polo, identidade/permissões nulas,
conta indisponível/inativa, tipos FISICA/RATEIO_INTERNO, edição/exclusão bloqueadas,
grants e execução como authenticated. Helpers de autorização são fixtures isoladas.
Executar com `PGLITE_MODULE_PATH` apontando à instalação local existente de
`@electric-sql/pglite/dist/index.js`; nenhuma dependência foi adicionada ao projeto.

Concorrência multiconexão não ensaiada; trava existente por request_id preservada.
Não havia bloqueio por saldo insuficiente no contrato e não foi criada nova regra.
Migration aplicada via MCP após autorização e conferência da definição vigente. Pós-aplicação confere ledger, grants efetivos e autorização anterior ao replay.

## Entrega 4.8.161

Base remota: `3a91454f512147de9f7869fc956baa813420a21b` (4.8.160).
Versão/changelog e registro de manifestos montados sobre a main remota, preservando
as alterações locais do lote paralelo de renegociação. CI passa a executar os testes
de saldo/seletor e o ensaio SQL deste lote. Publicação condicionada aos checks e Preview.

Aplicação Supabase confirmada no ledger `20261003180057` em `kfekgwyqozhicpfuunpo`.
TRUNCATE revogado para anon/authenticated; SELECT e execução autenticada preservados;
EXECUTE anônimo bloqueado e autorização anterior ao replay confirmada no corpo vigente.
