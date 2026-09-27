# Caixa — contas a pagar e Radar financeiro

Estado: VALIDADO — MIGRATION APLICADA — PUBLICAÇÃO AUTORIZADA

## Objetivo

Separar compromissos de contas a pagar do Caixa realizado, garantindo que somente pagamentos efetivos apareçam como saída realizada, e adaptar a tela Início ao contexto financeiro sem misturar vencimentos com o calendário oficial.

## Decisões do domínio

- O backend é a única fonte de cálculo; o frontend apenas valida, formata e apresenta o contrato monetário textual retornado pela RPC.
- A competência apresenta três KPIs: contas da competência, pagas na competência e em atraso no corte; o valor a vencer aparece como detalhamento.
- Contas abertas não reduzem o realizado do Caixa. Pagamentos são reconhecidos pela data e pelo valor efetivamente pagos.
- Rateios preservam valor e data por fração. A quantidade é consolidada por título, considerado quitado somente quando todas as frações existentes no corte estiverem pagas.
- Competências passadas são uma posição reexpressa no corte: pagamentos com data são recompostos, enquanto cancelamentos e exclusões sem vigência histórica refletem o estado atual.
- Empréstimos e lançamentos de Despesas já vinculados não são duplicados pela fonte legada de contas a pagar.
- A tela Início usa presets derivados das permissões: Acadêmico, Financeiro ou Misto. Personalização livre por arrastar e persistência ficam fora desta fase.
- O Radar financeiro mostra atraso, vencimentos de hoje, próximos sete dias e faixa diária de oito datas. O calendário oficial permanece separado.

## Segurança e contrato

- Nova RPC `get_caixa_contas_pagar_resumo_secure(uuid, date)` com `SECURITY DEFINER` e `search_path` vazio.
- Acesso permitido somente a `service_role`, perfil com Caixa no escopo ou perfil com Financeiro no escopo e aba efetiva Despesas.
- `PUBLIC` e `anon` não recebem `EXECUTE`; `authenticated` e `service_role` recebem apenas execução da função.
- Payload JSON versionado como v1, com valores monetários em strings decimais.

## Validação

- Testes integrados do contrato/Radar/RPC com PGlite: 11/11 aprovados.
- Testes de acesso do Gestor: 34/34 aprovados.
- TypeScript sem emissão: aprovado.
- ESLint focado no manifesto: aprovado.
- Build Vite de produção: aprovado; permaneceu apenas o aviso preexistente de chunks acima de 500 kB.
- Todos os 24 arquivos manuais de implementação/teste permanecem abaixo de 500 linhas.
- `npm run check:file-lines` não concluiu por referências antigas ausentes no manifesto operacional global; nenhum arquivo deste lote ultrapassa o teto.
- Smoke autenticado no Safari local pendente porque a sessão local redireciona para login.
- Migration remota `20260927194749_create_caixa_contas_pagar_resumo` aplicada no projeto `kfekgwyqozhicpfuunpo`.
- RPC real confirmou contrato v1, agenda de oito dias, valores monetários textuais, grants mínimos e negação `42501` para usuário sem escopo.
- Advisors não apontaram alerta de performance ligado à RPC. O aviso de `SECURITY DEFINER` é intencional e mitigado por `search_path` vazio, grants mínimos e autorização interna por Caixa ou Financeiro/Despesas.

## Riscos conhecidos

- O clique do Radar abre Financeiro/Despesas ou Caixa conforme a permissão, sem filtro profundo, pois as rotas atuais não possuem contrato de filtro por período/status.
- Drag-and-drop e persistência de layout não fazem parte deste MVP.

## Manifesto explícito

### Banco e contratos

- `supabase/migrations/20260927160000_create_caixa_contas_pagar_resumo.sql`
- `supabase/tests/caixa_contas_pagar_resumo.contract.test.mjs`
- `supabase/tests/caixa_contas_pagar_resumo.isolated.test.mjs`

### Caixa

- `modules/gestor/caixa/CaixaPage.tsx`
- `modules/gestor/caixa/caixa.service.ts`
- `modules/gestor/caixa/caixa.types.ts`
- `modules/gestor/caixa/caixa.contracts.ts`
- `modules/gestor/caixa/caixa.mappers.ts`
- `modules/gestor/caixa/useCaixaRealtime.ts`
- `modules/gestor/caixa/components/CaixaContasPagarResumoCard.tsx`
- `modules/gestor/caixa/components/CaixaCompromissosCards.tsx`
- `modules/gestor/caixa/components/CaixaCompromissosCards.test.tsx`
- `modules/gestor/caixa/caixa-contas-pagar-resumo.test.tsx`

### Início e acesso

- `modules/gestor/access-control.ts`
- `modules/gestor/access-control.test.ts`
- `modules/gestor/dashboard/DashboardPage.tsx`
- `modules/gestor/dashboard/dashboard.presentation.ts`
- `modules/gestor/dashboard/dashboard.queries.ts`
- `modules/gestor/dashboard/dashboard-financial.mapper.ts`
- `modules/gestor/dashboard/dashboard-financial.service.ts`
- `modules/gestor/dashboard/dashboard-financial.test.ts`
- `modules/gestor/dashboard/useDashboardFinancialRealtime.ts`
- `modules/gestor/dashboard/components/DashboardFinancialRadar.tsx`
- `modules/gestor/dashboard/components/DashboardOfficialCalendar.tsx`

### Operação

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-27-caixa-contas-pagar-dashboard-financeiro.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 30 arquivos.

## Publicação

- Produção autorizada explicitamente pelo usuário em 27/09/2026.
- Publicar somente o manifesto deste registro via MCP GitHub na versão 4.8.121.
- Aguardar CI/Vercel, mesclar e executar smoke autenticado exclusivamente no Safari, sem criar ou alterar lançamentos financeiros.
