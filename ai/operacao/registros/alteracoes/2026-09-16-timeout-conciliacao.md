# Timeout da conciliação e leituras financeiras — 2026-09-16

## Objetivo e autorização

Corrigir o carregamento prolongado e os erros apresentados em Conciliação, Dashboard e Caixa. O usuário solicitou análise e correção com três agentes e determinou validação exclusivamente interna, sem navegador. A correção segue a autorização de corrigir e publicar já expressa nesta conversa; nenhum saneamento financeiro integra este incidente.

## Diagnóstico comprovado

- Logs reais das três RPCs apresentaram código PostgreSQL `57014` com mensagem de `statement_timeout`.
- A lista da conciliação depende da leitura do ambiente bancário; o diagnóstico pesado permanece restrito à sua aba.
- A consulta inicial usa status `PAGO`, origem `TODOS`, fonte `ALL`, página 1 e tamanho 20. O período começa sem filtro; a data exibida pelo usuário não é um padrão aplicado silenciosamente.
- A consulta da conciliação avaliava evidências de vencimento também para recebimentos já pagos, embora essa evidência só afete a classificação dos abertos.
- As três leituras herdavam uma repetição automática global, executando até duas consultas demoradas antes de apresentar erro. Não foi identificado laço infinito de carregamento no frontend.
- Dashboard e Caixa possuem tratamento terminal de erro; o código recebido pelos respectivos serviços preserva `error.code` sem conversão para `Error` genérico.

## Correção e aceite

- Evitar a leitura lateral de evidências de vencimento para itens pagos. Para não pagos, resolver o vínculo único antes da lateral permite usar o índice de histórico por vínculo/data, preservando a ordenação completa e os resultados canônicos.
- Preservar autenticação, autorização por polo, filtros, contagens, paginação e composição financeira.
- Encerrar repetição automática ao receber `57014` somente nas três consultas afetadas. Manter uma repetição nas demais falhas e permitir nova consulta explícita.
- Erros continuam visíveis, sem conversão em lista vazia bem-sucedida ou indicadores zero.
- Foco, mudança de filtros e eventos Realtime ainda podem solicitar consultas posteriores; a alteração limita as repetições de cada execução.
- Nenhum recebimento, título bancário, worker, prazo SQL ou configuração de autorização é modificado.

## Manifesto explícito

- `lib/database-query-retry.ts`
- `lib/database-query-retry.test.ts`
- `modules/gestor/dashboard/dashboard.queries.ts`
- `modules/gestor/caixa/caixa.service.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/hooks/useBaneseConciliacaoQueries.ts`
- `supabase/migrations/20260917015000_skip_paid_reconciliation_evidence_scan.sql`
- `supabase/tests/financial_reconciliation_paid_evidence.transaction.sql`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-16-timeout-conciliacao.md`

Total: 13 arquivos. Artefatos temporários, relatórios gerados, memória e registro do lote anterior ficam fora do manifesto.

## Validação e medições

- 13 testes frontend aprovados: três cenários com `QueryObserver` real e dez contratos dos filtros existentes.
- Comparação automatizada confirma duas execuções antes e uma depois para `57014`, estado terminal de erro, preservação da falha e recuperação por nova consulta explícita.
- Rede transitória mantém uma repetição e recuperação. Lint focado passou nos cinco arquivos frontend; revisão independente sem achados.
- Conciliação sem período: versão anterior ultrapassou 15 segundos; guarda isolada medida inicialmente em 939 ms. Novo ensaio em função temporária mediu 672,694 ms para `PAGO` sem período.
- Cenário diário `PAGO`: 790,893 ms antes e 34,801 ms depois, com JSON integralmente igual.
- Cenários diários `TODOS`, `PENDENTE` e `VENCIDO`: JSON igual; medições respectivamente 32,875→31,775 ms, 9,567→8,665 ms e 8,498→8,282 ms.
- Dashboard e Caixa responderam em 284 ms e 3.361 ms em reproduções autenticadas internas. São medições pontuais; não comprovam ausência de intermitência.
- Ensaio não vazio de PENDENTE sem período: JSON inteiro idêntico para 1.492 registros / 20 itens, 32.811,168 ms antes e 698,138 ms depois. PAGO sem período retornou 2.157 registros / 20 itens em 406,907 ms.
- A guarda isolada não resolveu PENDENTE: o patch final também move o vínculo único para fora da lateral, mantendo a ordenação observação/registro/id. Revisão independente aprovou cardinalidade e semântica.
- Ensaios usaram MCP, clones temporários e rollback. O arquivo transacional é reutilizável antes/depois da aplicação; medições acima são dos ensaios executados, sem afirmar execução integral posterior do arquivo refatorado.
- TypeScript, build 4.8.66, lint focado, 13 testes frontend, seis contratos financeiros e teto do manifesto aprovados. Aviso preexistente de chunks grandes não impede o build. Reindexação única do RAG no fechamento.
- Navegador não utilizado por determinação do usuário; validação do fluxo é interna, sem lançar pagamentos como teste.

## Aplicação e publicação

Migration aplicada via MCP em produção: `20260917010910`, `skip_paid_reconciliation_evidence_scan`. Smoke autenticado após aplicação, sob limite de 8 segundos: Conciliação PAGO 315,474 ms, Dashboard 124,979 ms e Caixa 2.935,096 ms. Filtros PENDENTE, TODOS e VENCIDO também retornaram, respectivamente 1.492, 3.665 e 16 registros. ACLs e search_path preservados; hashes das funções Dashboard e Caixa permaneceram idênticos. Nenhum recebimento foi alterado.

Versão 4.8.66, revisão 75, validada para publicação atômica dos 13 arquivos via MCP GitHub. CI, Preview e publicação final serão registrados no PR do lote. Não há uso do navegador nem dados pessoais no registro. A causa de cada timeout transitório do Dashboard/Caixa não foi isoladamente atribuída; a correção remove o custo reproduzido na conciliação e sua amplificação por repetição.
