# Auditoria Banese e métricas acadêmicas canônicas

Data: 2026-08-26
Estado: validado localmente; aguardando smoke autenticado e autorização de produção

## Objetivo

Tornar cada consulta automática do Banese identificável e separar o resultado histórico da tentativa da situação financeira atual. Corrigir também os rótulos e fontes dos indicadores de cadastro de aluno e matrícula ativa, sem promover matrículas `PENDENTE`.

## Evidência reproduzida

- `16:57:02`: Nosso Número `000096934`, mensalidade 2/12 de Walasy, tentativa `PAID`, título atual `PAGO`.
- `16:58:01`: Nosso Número `000096926`, mensalidade 1/12 de Walasy, tentativa `ERROR/QUERY_ERROR`, título atual `PAGO`.
- `17:14:02` a `17:23:02`: dez títulos restantes identificados individualmente, todos com tentativa e estado atual `PENDING/PENDENTE`.
- Matriz: 28 cadastros de alunos ativos, 25 matrículas pendentes, 2 desistentes, 0 matrículas ativas e 1 cadastro sem matrícula.

## Decisão

- O histórico da tentativa é imutável e não será reescrito para esconder erro posterior à baixa.
- “Baixas” passa a usar uma série própria e deduplicada de liquidações pela API; “Erros” mantém uma janela própria de falhas da tentativa.
- A UI exibe nome, Nosso Número, parcela e dados financeiros mínimos apenas para quem também possui `Financeiro › Contas a receber`; não exibe CPF, contato, linha digitável, código de barras ou payload bruto.
- Uma RPC calcula no banco os KPIs por consumidor e devolve somente os campos permitidos para Parceiros ou Financeiro. O Dashboard conserva sua RPC protegida já existente.

## Publicação

Não autorizada. O lote permanece local até aceite técnico e pedido explícito de produção.

## Manifesto explícito

Total: 29 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-08-26-auditoria-banese-e-metricas-academicas-canonicas.md`
- `modules/gestor/alunos-status/alunos-status.service.ts`
- `modules/gestor/alunos-status/alunos-status.model.ts`
- `modules/gestor/alunos-status/alunos-status.contract.test.ts`
- `modules/gestor/configuracoes/consulta-api-banese/BaneseAttemptsTable.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/BaneseConsoleHeader.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/BaneseTabsNav.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/banese-attempt-feed.ts`
- `modules/gestor/configuracoes/consulta-api-banese/banese-display.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/ConsultaApiBaneseConfig.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/consulta-api-banese.types.ts`
- `modules/gestor/configuracoes/consulta-api-banese/consulta-api-banese-history.contract.test.ts`
- `modules/gestor/dashboard/DashboardPage.tsx`
- `modules/gestor/dashboard/dashboard.queries.ts`
- `modules/gestor/dashboard/dashboard.service.ts`
- `modules/gestor/financeiro/resumo/ResumoTab.tsx`
- `modules/gestor/financeiro/hooks/useFinanceiroRealtime.ts`
- `modules/gestor/hooks/useGestorOperationalRealtime.ts`
- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/parceiros/components/kpis/AlunosKpi.tsx`
- `modules/gestor/parceiros/hooks/useParceirosFilters.ts`
- `modules/gestor/parceiros/hooks/useParceirosQueries.ts`
- `modules/gestor/parceiros/parceiros.query-keys.ts`
- `supabase/migrations/20260826213300_enrich_banese_reconciliation_attempt_identity.sql`
- `supabase/migrations/20260826213350_create_student_status_kpis.sql`
- `supabase/tests/banese_reconciliation_attempt_identity.contract.test.ts`
- `supabase/tests/student_status_kpis.contract.test.ts`

## Validação

- Três agentes revisaram separadamente a auditoria Banese, os indicadores acadêmicos e o conjunto financeiro/RBAC. Os achados bloqueantes foram corrigidos e rechecados sem bloqueador remanescente.
- `node --test` dos quatro contratos do lote: 17/17.
- `npm run test:banese-reconciliation`: 9/9.
- `npm run test:banese-ui`: 35/35.
- TypeScript completo com heap ampliado: aprovado.
- ESLint focado nos arquivos TypeScript/TSX do manifesto: aprovado.
- `npm run check:file-lines`: aprovado; maior arquivo do manifesto com 483 linhas.
- `npm run build` e build Vite final: aprovados; permaneceu somente o aviso histórico de chunks acima de 500 kB.
- Consulta remota somente leitura: 2 baixas API deduplicadas, 1 com última tentativa `ERROR`; Matriz com 28 cadastros de alunos ativos, 0 matrículas ativas e 0 alunos distintos com matrícula ativa.
- Confirmação remota: as migrations `20260826213300` e `20260826213350` ainda não foram aplicadas.
- Smoke visual autenticado: pendente, porque a sessão não disponibilizou navegador conectado. O preview local iniciou corretamente e foi encerrado sem mutação de dados.
