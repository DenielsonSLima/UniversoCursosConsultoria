# Correção Financeiro, Realtime e resiliência — 2026-08-24

Estado: `DDL_VALIDADO_AGUARDANDO_PUBLICACAO_GITHUB`

## Objetivo

Fechar os findings da revisão pós-publicação 4.8.1: tornar o backend a autoridade financeira nos portais do Professor e do Aluno, substituir recibos derivados da interface por PDFs nativos institucionais, corrigir sincronização TanStack/Realtime e impedir que falha transitória derrube a sessão válida do Professor.

## Frentes independentes

1. **Financeiro e recibo do Professor:** RPC canônica para valores, status, filtros e paginação; estados explícitos de erro/retry; recibo vetorial gerado pelo contrato do backend; divisão coesa da página preexistente com 782 linhas.
2. **Financeiro e recibo do Aluno:** corrigir o fallback indevido de valor previsto como pago, impedir erro mascarado como saldo zero, mover status temporal, filtros, contagens, ordenação e paginação para o backend, preservar Banese/EAD/técnico e substituir o recibo DOM/PNG por snapshot e PDF vetorial canônicos; dividir por responsabilidade a página preexistente com 1.549 linhas.
3. **TanStack e Realtime:** invalidação final do acesso do Aluno; chaves exatas; ressincronização na assinatura/reconexão; debounce e cleanup; outbox mínimo com tópicos e audiências estáveis, sem injetar linhas não validadas diretamente no cache.
4. **Professor:** classificação de erro transitório versus credencial/papel/perfil inválido; preservação de sessão e retry somente no caso recuperável; falha fechada nos casos definitivos.

## Critérios congelados

- O frontend financeiro não calcula total, atraso, situação nem valor pago.
- Falha da consulta não pode aparecer como saldo legítimo zerado.
- Prévia, download e impressão do recibo usam o mesmo `Blob` nativo, com modelo e marca d'água institucionais.
- A confirmação assíncrona do acesso do Aluno é seguida pela invalidação da chave exata efetivamente consumida.
- Realtime refaz a leitura canônica depois de assinar ou reconectar e não depende da imagem antiga de uma exclusão.
- Erro temporário do portal do Professor mantém a sessão; erro de autorização inválida remove o acesso local e exige nova autenticação.
- Revisão cruzada, testes focados, build, CI/Preview, migrations e smoke de Produção devem ficar verdes.

## Banco e publicação

- Prefixos reservados para novas migrations: `20260824235000`, `20260824235050`, `20260824235100`, `20260824235150`, `20260824235160`, `20260824235200`, `20260824235250`, `20260824235300`, `20260824235350`, `20260824235400` e `20260824235450`.
- Supabase remoto será operado somente por MCP, com leitura do ledger antes da aplicação e validação pós-DDL.
- GitHub remoto será operado somente por MCP, partindo da `main` remota e publicando apenas o manifesto explícito.
- A versão alvo do lote é `4.8.2`.

## Manifesto explícito

Total: 79 arquivos.

### Auth e resiliência do Professor

- `modules/login/portal-context-access.contract.test.ts`
- `modules/login/portal-context-access.test.ts`
- `modules/login/portal-context-access.ts`
- `modules/login/usePortalContextAccess.ts`
- `modules/professor/professor-access-gate.test.ts`
- `modules/professor/professor-access-gate.ts`
- `modules/professor/professor.page.tsx`

### Financeiro e recibo do Professor

- `modules/professor/financeiro/FinanceiroFilters.tsx`
- `modules/professor/financeiro/FinanceiroPage.tsx`
- `modules/professor/financeiro/FinanceiroPaymentsList.tsx`
- `modules/professor/financeiro/FinanceiroSummaryCards.tsx`
- `modules/professor/financeiro/ProfessorFinanceiroReceiptModal.tsx`
- `modules/professor/financeiro/financeiro.presentation.ts`
- `modules/professor/financeiro/financeiro.queries.ts`
- `modules/professor/financeiro/financeiro.service.ts`
- `modules/professor/financeiro/financeiro.types.ts`
- `modules/professor/financeiro/professor-financeiro-receipt.pdf.test.ts`
- `modules/professor/financeiro/professor-financeiro-receipt.pdf.ts`
- `supabase/migrations/20260824235000_create_professor_financial_portal_read.sql`
- `supabase/migrations/20260824235050_create_professor_financial_receipt_rpc.sql`
- `supabase/tests/professor_financial_portal.contract.test.ts`

### Financeiro e recibo do Aluno

- `modules/aluno/financeiro/AlunoEadPaymentChoiceModal.tsx`
- `modules/aluno/financeiro/AlunoFinanceiroFilters.tsx`
- `modules/aluno/financeiro/AlunoFinanceiroList.tsx`
- `modules/aluno/financeiro/AlunoFinanceiroReceiptModal.tsx`
- `modules/aluno/financeiro/AlunoFinanceiroSummary.tsx`
- `modules/aluno/financeiro/FinanceiroCardItem.tsx`
- `modules/aluno/financeiro/FinanceiroPage.tsx`
- `modules/aluno/financeiro/aluno-financeiro-receipt.pdf.test.ts`
- `modules/aluno/financeiro/aluno-financeiro-receipt.pdf.ts`
- `modules/aluno/financeiro/banese/hooks/useBanesePaymentDetails.ts`
- `modules/aluno/financeiro/financeiro.contract.test.ts`
- `modules/aluno/financeiro/financeiro.contract.ts`
- `modules/aluno/financeiro/financeiro.presentation.ts`
- `modules/aluno/financeiro/financeiro.queries.ts`
- `modules/aluno/financeiro/financeiro.service.ts`
- `modules/aluno/financeiro/financeiro.types.ts`
- `modules/aluno/financeiro/useAlunoEadPayment.ts`
- `modules/aluno/shared/aluno-course-access.queries.test.ts`
- `modules/aluno/shared/aluno-course-access.queries.ts`
- `supabase/migrations/20260824235200_create_student_financial_portal_read.sql`
- `supabase/migrations/20260824235250_create_student_financial_receipt_rpc.sql`
- `supabase/migrations/20260824235300_fix_student_financial_list_json_precedence.sql`
- `supabase/migrations/20260824235350_fix_student_financial_receipt_json_precedence.sql`
- `supabase/migrations/20260824235450_use_invoker_student_financial_receipt.sql`
- `supabase/tests/aluno_financeiro_portal.contract.test.ts`

### TanStack e Realtime

- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoVacinas.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/useMatriculaTecnicaWorkflowRealtime.ts`
- `modules/gestor/parceiros/governance-query-keys.test.ts`
- `modules/gestor/parceiros/hooks/useParceirosMutations.ts`
- `modules/gestor/parceiros/parceiros.query-keys.ts`
- `modules/gestor/parceiros/student-access-feedback.contract.test.ts`
- `modules/professor/calendario/CalendarioProfessorPage.tsx`
- `modules/professor/calendario/useProfessorCalendarRealtime.ts`
- `modules/professor/comunicacao/ComunicacaoPage.tsx`
- `modules/professor/comunicacao/professor-comunicacao.query-keys.ts`
- `modules/professor/comunicacao/useProfessorComunicacaoRealtime.ts`
- `modules/professor/hooks/useProfessorDisciplinas.ts`
- `modules/shared/realtime/portal-realtime-signals.ts`
- `modules/shared/realtime/realtime-canonical.contract.test.ts`
- `modules/shared/realtime/realtime-invalidation.test.ts`
- `modules/shared/realtime/realtime-invalidation.ts`
- `supabase/migrations/20260824235100_create_portal_realtime_signals.sql`
- `supabase/migrations/20260824235150_create_portal_realtime_signal_triggers.sql`
- `supabase/migrations/20260824235160_create_portal_calendar_chat_signals.sql`
- `supabase/migrations/20260824235400_move_portal_realtime_authorizer_private.sql`
- `supabase/tests/portal_realtime_signals.contract.test.ts`

### CI, operação e versão

- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/ALTERACOES.md`
- `ai/operacao/registros/alteracoes/2026-08-24-correcao-financeiro-realtime-resiliencia.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `package.json`
- `scripts/check-file-line-limits.mjs`
- `scripts/test-agent-operation.mjs`

### Preservado fora do lote

- Todo arquivo do workspace que não aparece nas listas anteriores, inclusive mudanças paralelas, lockfiles, caches, build e artefatos temporários.
- Os dois PDFs e PNGs usados na inspeção visual permaneceram somente em `/private/tmp`.

## Evidências

- Baseline remoto antes de DDL: ledger termina em `20260825015455 sign_partner_invite_operations`; nenhum prefixo reservado deste lote está aplicado.
- Advisors antes de DDL: `470` avisos de segurança e `234` de performance, baseline preexistente a comparar após a aplicação.
- A checagem remota somente leitura confirmou que `contas_pagar` não possui a coluna `observacao`; a referência detectada antes da aplicação foi removida e coberta por contrato.
- A auditoria interna do Financeiro do Aluno encontrou valor previsto tratado como pago, erro mascarado como resumo zerado, cálculo temporal/paginação no navegador e recibo DOM/PNG; a publicação permanece bloqueada até a correção e revisão cruzada.
- As três revisões cruzadas encerraram sem finding funcional `P1` ou `P2`; o finding do gate oficial foi corrigido ao incluir os dois testes críticos de login no comando de CI.
- Auth e portais: `48/48`; Financeiros/Realtime no bloco oficial final: `60/60` Node e `2/2` Deno; contratos focados do Financeiro do Professor: `13/13`; Financeiro do Aluno: `29/29`; Realtime: `19/19` após o hardening privado.
- TypeScript sem emissão, ESLint global, controle de versão e build Vite de produção foram aprovados; o gate TypeScript recebeu heap explícito de `6144 MiB` para eliminar a instabilidade local do limite padrão, e o build preservou somente avisos preexistentes de tamanho de chunks.
- Os recibos do Professor e do Aluno foram inspecionados em A4: uma página, texto extraível, sem rasterização de página, corte ou sobreposição, com cabeçalho, marca d'água e área de assinatura institucionais.
- O manifesto inicial de 75 arquivos foi congelado antes da primeira escrita remota e recongelado em 79 arquivos para registrar os hotfixes e o hardening incrementais.
- As sete migrations iniciais foram aplicadas sob os ledgers `20260825041509`, `20260825041512`, `20260825041514`, `20260825041517`, `20260825041520`, `20260825041525` e `20260825041529`.
- O primeiro smoke autenticado real do Aluno encontrou `22P02` por precedência de `||` com `->>` em dois rótulos JSON. As migrations aplicadas foram preservadas; duas correções incrementais redefinem somente as RPCs afetadas com `concat(...)` e passaram em `29/29` testes locais.
- As duas correções de precedência foram aplicadas sob os ledgers `20260825042649` e `20260825042651`; o smoke autenticado passou com lista vazia, totais zero, página `1/1` e rejeição de ID fora do escopo/recibo inexistente.
- Os advisors pós-DDL acrescentaram dois avisos por `SECURITY DEFINER` exposto. O hardening moveu os dois compositores internos para `portal_private`, preservou os OIDs `40832` e `40866`, a policy Realtime `40833` e sua dependência, e expôs somente o wrapper de recibo `SECURITY INVOKER`; o cenário futuro de recibo histórico de polo inativo permanece preservado.
- As duas migrations de hardening foram aplicadas sob os ledgers `20260825043901` e `20260825043903`; as 11 migrations do lote estão registradas por ID remoto e SHA-256 no inventário de migrations aplicadas.
- Advisors finais: segurança voltou exatamente ao baseline de `470` (`49` INFO e `421` WARN), sem aviso novo do lote; performance ficou em `237` (`217` INFO e `20` WARN), com os mesmos `20` WARN e três INFO de índices recém-criados ainda sem uso.
- O smoke real autenticado do Aluno confirmou resposta canônica vazia, totais zero e página `1/1`; identidade fora do escopo e recibo inexistente retornaram `42501`. Produção não possui Professor autenticado com polo nem título PAGO do Aluno, portanto esses dois smokes positivos não foram fabricados com dados artificiais.
- Os logs PostgreSQL entre `2026-08-25T04:26:40Z` e `2026-08-25T04:42:27Z`, após os hotfixes, não registraram evento `ERROR`, `FATAL` ou `PANIC`.
- O manifesto permanece congelado em 79 arquivos. Restam CI/Preview, merge, smoke web de Produção e fechamento operacional.

## Limites

- Alterações paralelas do workspace, PRs antigas, artefatos gerados, segredos e dados pessoais não pertencem ao lote.
- Não será criado usuário artificial em Produção para fabricar cenário autenticado.
- Migrations já aplicadas permanecem imutáveis.
