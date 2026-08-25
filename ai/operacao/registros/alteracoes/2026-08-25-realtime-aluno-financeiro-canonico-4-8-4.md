# Realtime do Aluno e Financeiro canônico — 4.8.4

Data: 2026-08-25  
Estado: `PRONTO_PARA_PUBLICACAO`

## Objetivo

Revisar novamente autenticação multiperfil, autorização, Financeiro, PDFs, TanStack Query e Realtime; corrigir regressões residuais sem alterar os fluxos já aprovados; publicar no GitHub e em Produção após validação interna e remota.

## Findings e correções

1. `P2` — o acesso acadêmico do Aluno assinava `DELETE` filtrado diretamente em `matriculas`, embora exclusões do Postgres Changes não sejam filtráveis. A assinatura foi substituída pela outbox autorizada com audiência `ALUNO`, tópico exato e sinais para `OLD` e `NEW`.
2. `P3` — o card financeiro ainda tomava decisões por `status`/`isOverdue`. Agora usa somente `statusCode`, `receiptEligible` e o resumo financeiro canônico recebido do backend.
3. `P3` — `finance_realtime_events` era assinado no hook global e novamente na página financeira. A assinatura local foi removida; a invalidação explícita de mutações permanece preservada.

## Manifesto explícito

Total: 18 arquivos

### Produto, migration e testes

- `modules/aluno/financeiro/FinanceiroCardItem.tsx`
- `modules/aluno/financeiro/FinanceiroPage.tsx`
- `modules/aluno/hooks/useAlunoCourseAccessRealtime.ts`
- `modules/shared/realtime/portal-realtime-signals.ts`
- `modules/shared/realtime/realtime-canonical.contract.test.ts`
- `supabase/migrations/20260825204500_add_student_portal_realtime_audience.sql`
- `supabase/tests/aluno_financeiro_portal.contract.test.ts`
- `supabase/tests/portal_realtime_signals.contract.test.ts`

### Operação e versão

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/ALTERACOES.md`
- `ai/operacao/registros/alteracoes/2026-08-25-realtime-aluno-financeiro-canonico-4-8-4.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `scripts/check-file-line-limits.mjs`

### Preservado fora do lote

- Todo arquivo que não aparece no manifesto, inclusive alterações paralelas, lockfiles, caches, artefatos temporários e saídas de build.
- Migrations já aplicadas permanecem byte a byte imutáveis.

## Evidências

- Reunião técnica com três revisões independentes: Auth/RBAC, Financeiro/PDF e Realtime/Produção.
- Veredito cruzado final: nenhum finding P1, P2 ou P3 aberto.
- Auth `48/48`; Financeiro/Realtime `62/62` Node; TanStack `2/2` Deno; TypeScript e ESLint focado aprovados.
- Preflight Supabase: migration ainda ausente; constraints originais confirmadas; autorizador privado OID `40832`, policy OID `40833`, triggers `40844`/`40845`, RLS e publication ativas.
- Advisors antes da DDL: segurança `470` (`49` INFO, `421` WARN); performance `237` (`217` INFO, `20` WARN).
- SHA-256 local da migration: `59efa873989c95c95559e187d05c51d37c422e4e53317a1dd02f3adaaa32fa5d`.
- Migration aplicada no ledger remoto `20260825204543 add_student_portal_realtime_audience` e registrada com o mesmo SHA-256.
- Pós-check: autorizador OID `40832`, policy OID `40833`, funções de trigger OIDs `40836`/`40837`, triggers OIDs `40844`/`40845`, RLS e publication preservados; somente `authenticated` executa o autorizador.
- Advisors pós-DDL idênticos ao baseline; logs de `20:40Z` a `20:48Z` sem `ERROR`, `FATAL` ou `PANIC` textual.
- A outbox não recebeu atividade acadêmica natural no intervalo; nenhum dado artificial foi criado para fabricar o smoke positivo.

## Aceite e limites

- Gates finais, CI, Preview, merge e smoke de Produção permanecem pendentes nesta etapa.
- Não será criado usuário, matrícula, título ou pagamento artificial.
- A ausência de navegador controlável será registrada como limitação, caso persista no fechamento.
- O WhatsApp está fora do manifesto; qualquer ajuste de modo de teste ou destinatário exige decisão operacional separada.
