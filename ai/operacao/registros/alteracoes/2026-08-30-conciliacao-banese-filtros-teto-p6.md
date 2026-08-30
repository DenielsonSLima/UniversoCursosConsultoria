# Conciliação Banese — filtros fiéis e teto automático P6

Data: 2026-08-30  
Estado: concluído e autorizado para produção

## Pedido e escopo

Corrigir os filtros da tela de conciliação, reduzir consultas desnecessárias no
Supabase, publicar o hotfix e limitar o piloto automático Banese ao teto P6.
O limite P6 não autoriza salto direto: o perfil efetivo deve permanecer P3 e
avançar somente pelas condições graduais já existentes.

## Causa confirmada

O problema visual dos filtros e a pressão desnecessária no banco tinham três
causas combinadas:

1. a lista mantinha os dados anteriores por `keepPreviousData` durante a troca
   de filtro, fazendo Todos, Pago, Pendente e Vencido parecerem iguais;
2. cada troca também renovava indicadores, histórico completo de transações e
   um diagnóstico RPC pesado, mesmo quando a aba de diagnóstico não estava
   visível;
3. eventos Realtime invalidavam todas essas consultas em rajada.

O volume aceito pela API Banese não era a causa desse comportamento. O custo
excessivo estava na repetição e no fan-out das leituras locais do Supabase.

## Correção da interface e das consultas

- A lista filtrada, os indicadores de resumo e os diagnósticos pesados passaram
  a usar consultas independentes.
- A lista deixa de exibir linhas do filtro anterior enquanto a nova seleção é
  carregada.
- Pendente exclui explicitamente Pago e Vencido; os demais filtros usam o
  estado normalizado correspondente.
- O histórico de transações e a RPC de diagnóstico só executam na aba em que
  são necessários; falha parcial não apaga a lista principal.
- As invalidações Realtime foram separadas por responsabilidade e agrupadas por
  dois segundos.
- A tela não promete webhook Banese inexistente e informa quando apenas o
  histórico auxiliar está temporariamente indisponível.

## Teto P6 aplicado

A migration `20260830154500_cap_banese_automatic_profile_at_p6.sql` foi aplicada
remotamente como `20260830185530`.

- Produção: selecionado P6; efetivo P3; último estável P3; estado `OBSERVING`;
  estabilidade preservada; sem cooldown; versão 129.
- Sandbox: selecionado P6; efetivo P3; último estável P3; versão 5.
- P3–P6 permanecem elegíveis para seleção automática.
- P7–P20 continuam disponíveis apenas no modo manual.
- P6 corresponde a 180 títulos/min, 360 requisições/min e concorrência 4.
- Títulos, pagamentos, baixas, fila, leases e tentativas não foram alterados.

A primeira tentativa de aplicação encontrou a constraint antiga de P9 antes da
troca do teto e abortou. A transação reverteu integralmente: configuração,
versão e ledger permaneceram inalterados. A ordem foi corrigida, revisada por
um agente independente e a aplicação seguinte foi concluída atomicamente.

## Segurança e integridade remota

- A constraint final exige teto selecionado P6 e perfil efetivo/estável entre
  P3 e P6.
- Os cinco RPCs de controle deixaram de possuir fallback P9.
- Permissões, `SECURITY DEFINER`/`INVOKER`, `search_path`, `lock_timeout=2s` e
  `statement_timeout=7s` foram preservados conforme o contrato anterior.
- Duas transições `SYSTEM_POLICY`, uma por ambiente, registram apenas a mudança
  do teto; ambas mostram perfil efetivo 3 → 3.
- As oito execuções produtivas seguintes terminaram em P3 com `SUCCESS`, sem
  falha nem throttling, entre 0,86 s e 1,15 s.
- Os advisors do Supabase não apontaram vulnerabilidade ou regressão nova
  causada pela política P6. Avisos preexistentes de RLS, índices e funções
  administrativas permanecem fora do escopo deste lote.

## Validação

- 20 contratos Node focados passaram.
- 25 testes Deno focados passaram.
- 11 testes do controle Banese passaram.
- ESLint global, TypeScript e build de produção passaram.
- O teto global de 500 linhas passou para todos os arquivos manuais.
- A migration possui quatro contratos dedicados e recebeu revisão independente
  sem bloqueios.
- O smoke autenticado da interface ficou limitado pela ausência de sessão de
  navegador conectada; o fluxo foi validado por contratos, build, estado remoto
  e checks da publicação.

## Manifesto explícito

Total: 24 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/alteracoes/2026-08-30-conciliacao-banese-filtros-teto-p6.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `scripts/test-banese-reconciliation-control.mjs`
- `modules/gestor/configuracoes/consulta-api-banese/BaneseAutopilotProgress.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/ConsultaApiBaneseConfig.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/banese-autopilot-cooldown.contract.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/ConciliacaoBancariaTab.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoOrigemBaixaPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoTransactionsPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.fetch.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.filter-state.contract.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.filters.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.filters.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/hooks/useBaneseConciliacaoQueries.ts`
- `supabase/functions/banese-reconciliation-worker/error-classification.test.ts`
- `supabase/functions/banese/core/adapter/boleto-query-pix.test.ts`
- `supabase/functions/gateways/api/banese-reconciliation-persistence.test.ts`
- `supabase/functions/gateways/api/banese.ts`
- `supabase/migrations/20260830154500_cap_banese_automatic_profile_at_p6.sql`
- `supabase/tests/banese_automatic_p3_p6_ceiling.contract.test.ts`
