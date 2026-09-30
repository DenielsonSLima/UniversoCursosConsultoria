# Hotfix dos ciclos financeiros T42 e T46

Estado: BACKEND E CORREÇÃO BANCÁRIA CONCLUÍDOS EM PRODUÇÃO; FRONTEND EM FECHAMENTO

## Objetivo e aceite

- Retomar a conferência Proesc do 2º ciclo da T42 entre instâncias Edge sem transformar lease ocupado em erro permanente e sem ultrapassar o orçamento da requisição.
- Corrigir o contrato da prévia financeira que deixava a T46 presa em `Aguardando cálculo`.
- Separar a matrícula local sem boleto da primeira mensalidade: a matrícula pode receber vencimento retroativo controlado e a Mensalidade 1 define, de forma independente, o calendário mensal seguinte.
- Quando o modo for `OMITIR`, não reservar um mês para uma matrícula inexistente.
- Baixar somente o título final comprovadamente incorreto do run histórico da T46, preservar os outros onze títulos e o run novo de treze itens, e reemitir o mesmo recebível com vencimento em 15/10/2026 e novo Nosso Número.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfig.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaFinanceiro.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualEnrollmentOptions.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/ciclo-manual-due-schedule.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useCicloManualRevision.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-local-enrollment.test.ts`
- `supabase/functions/proesc-api/cycle-review.ts`
- `supabase/functions/proesc-api/cycle-review-abort.test.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/contract.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/index.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/due-date-correction.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/contract.test.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/due-date-correction.test.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/due-date-correction-migrations.test.ts`
- `supabase/migrations/20260930190000_fix_technical_financial_rule_preview_identity.sql`
- `supabase/migrations/20260930190500_allow_retroactive_local_enrollment_due.sql`
- `supabase/migrations/20260930191000_create_oneoff_technical_due_date_overlay.sql`
- `supabase/migrations/20260930191100_begin_oneoff_technical_due_date_correction.sql`
- `supabase/migrations/20260930191200_mark_oneoff_technical_due_date_cancel_intent.sql`
- `supabase/migrations/20260930191300_allow_oneoff_technical_due_date_reset.sql`
- `supabase/migrations/20260930191400_prepare_oneoff_technical_due_date_correction.sql`
- `supabase/migrations/20260930191500_shorten_oneoff_due_date_rpc_names.sql`
- `supabase/migrations/20260930191600_fix_oneoff_due_date_service_role_bypass.sql`
- `supabase/tests/technical_financial_preview_identity.contract.test.ts`
- `supabase/tests/manual_cycle_retroactive_local_due.rollback.sql`
- `docs/decisions/ciclos-tecnicos-cobrancas.md`
- `ai/operacao/registros/alteracoes/2026-09-30-hotfix-ciclos-financeiros-t42-t46.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 31 arquivos.

## Contratos e guardas

- O coletor T42 usa lease distribuído, retomada de páginas persistidas, deadline absoluto e cancelamento propagado; nenhuma cobrança é criada durante a conferência.
- A matrícula retroativa é permitida somente como registro local sem boleto, limitada a cinco anos; boleto, rematrícula e mensalidade continuam sem vencimento passado.
- A propagação de vencimentos usa meses-calendário com ajuste para o último dia do mês, igual ao banco, e nunca altera a data da matrícula.
- A correção bancária é one-off, cercada por IDs, snapshots, fingerprints, lease, fila e prova Banese `code 5`; a intenção é persistida antes do PUT e o replay após resposta perdida é somente GET.
- A transação antiga permanece arquivada e desanexada; a autorização gira fingerprint e a reemissão exige novo Nosso Número no mesmo recebível.
- As onze cobranças irmãs e o run novo da outra matrícula são comparados por hashes antes e depois da operação.
- O lote ativo concorrente de cadastro de professor/polos/Pix não faz parte desta publicação e seus arquivos locais são preservados.

## Validação

- Auditoria remota confirmou T42 íntegra e elegível, sem cobrança criada pelo erro, e T46 com um único alvo pendente, sem pagamento ou reemissão concorrente.
- Reunião de três agentes executada com revisão cruzada de concorrência Proesc, contrato UI/RPC, ACL/triggers e baixa/reemissão Banese.
- Testes focados Edge, frontend, contratos e migrations, `deno check`, TypeScript, ESLint e build de produção aprovados; uma falha ampla preexistente em configuração legada de turma ficou fora do manifesto.
- Todos os arquivos manuais do manifesto permanecem abaixo de 500 linhas.
- CI completo e preview Vercel do PR aprovados. As nove migrations remotas foram aplicadas; `proesc-api` v26 e o worker de recuperação v11 ficaram ativos, preservando os demais arquivos dos bundles publicados.
- A primeira execução parou antes da baixa porque o PostgreSQL truncou dois nomes de RPC acima de 63 bytes. A segunda persistiu `CANCEL_INTENT` e confirmou a baixa, mas o reset foi bloqueado pelo uso do GUC legado de role. Os dois defeitos foram corrigidos sem segundo PUT: a retomada final foi somente GET, confirmou situação Banese 5 e concluiu com HTTP 200.
- O recebível `22c59dbe-0d77-4c2f-8842-4327b1c17147` permaneceu o mesmo, passou de 15/10/2027 para 15/10/2026, recebeu novo Nosso Número e uma única nova transação `PENDING/API_REGISTERED`. A transação anterior foi desanexada e marcada `CANCELED`; job `RESET_COMPLETE`, archive code 5, fila `READY` sem lease e fingerprint de autorização reconciliado.
- Os hashes dos onze títulos irmãos permaneceram iguais; o run antigo manteve 12 itens e R$ 3.358,80, e o run novo manteve 13 itens e R$ 3.558,80, sem sobreposição. Smoke autenticado no Safari será registrado após a publicação do frontend.
- Produção e a correção do boleto foram autorizadas explicitamente pelo usuário em 30/09/2026.
