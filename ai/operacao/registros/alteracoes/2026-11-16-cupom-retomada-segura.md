# Cupom EAD: retomada gratuita após compra opcional expirada

Status: proposta de correção em PR; não aplicada ao banco nem publicada.
Escopo: cupons de 100% em matrícula única PENDENTE da mesma turma, com todas as tentativas opcionais EXPIRED e cancelamento bancário comprovado. Cupons de 50% mantêm bloqueio de compra anterior.

## Manifesto
- `supabase/migrations/20261116172600_ead_coupon_resume_guards.sql`
- `supabase/migrations/20261116172601_ead_coupon_resume_late_payment.sql`
- `supabase/migrations/20261116172602_ead_coupon_resume_quote.sql`
- `supabase/migrations/20261116172603_ead_coupon_resume_free.sql`
- `supabase/tests/fixtures/ead-coupons.harness.mjs`
- `supabase/tests/ead_coupons.resume.isolated.test.mjs`
- `.github/workflows/ead-cupons.yml`
- `supabase/tests/ead_coupons.resume.postgres.test.mjs`
- `internal/versioning/system-version.json` e `internal/versioning/CHANGELOG.md` (versão proposta 4.8.356, sem publicação).
- Este registro.

## Contrato
Consulta e confirmação usam a mesma elegibilidade canônica. Confirmação revalida sob locks e autoriza a própria identidade autenticada. Reutiliza matrícula, desativa cobrança inicial/sincronização, audita os flags anteriores e tentativas no resgate. Não apaga nem modifica recebíveis, inscrições ou tentativas anteriores. Snapshot financeiro amplo aborta a transação se a ativação causar efeito inesperado.
Bloqueios: plano financeiro, matrícula histórica ativa, múltiplas matrículas, futura/herança financeira, tentativas abertas/incertas, cancelamento sem prova/identidade, dinheiro recebido, liquidação manual pendente/referenciada, revisão financeira e vínculos órfãos. Replay continua validando ator e payload; limite do cupom continua sob lock.
Pagamento bancário tardio é preservado e encaminhado à revisão financeira existente; não há estorno, reembolso ou revogação automática da gratuidade.

## Verificação
- 31 cenários novos PostgreSQL/WASM PGlite: retomada real de status, flags, valores, replays, isolamento de aluno, identidades de cancelamento, bloqueios, rollback de efeito financeiro e pagamento tardio.
- 12 testes baseline de cupons aprovados com as novas migrations carregadas, incluindo triggers acadêmicos/financeiros reais do harness e autorização/RLS.
- 8 testes de capacidade/recuperação de produção simulada aprovados com as novas migrations carregadas.
- Revisão independente dos SQL e execução da suíte nova: sem impeditivo identificado para PR.
- Auditoria read-only do escritor canônico do ledger: `append_payment` chama `authorize_source`, que bloqueia `contas_receber FOR UPDATE` antes do evento, compartilhando o lock usado na retomada.
- Nenhum teste criou matrícula/cobrança real, chamou provedor bancário ou alterou produção.

## Limitações e publicação
PGlite em uma conexão não valida duas transações simultâneas. Antes de produção, validar concorrência com callback/baixa em ambiente isolado de PostgreSQL completo, além de smoke autenticado Safari. Não houve smoke Safari nesta revisão. A aplicação depende de autorização explícita, migrations remotas conferidas, revisão de CI e aceite do lote; metadados de versão propostos não significam publicação; nenhum merge está incluído nesta proposta. Alterações paralelas foram preservadas.

## Validação concorrente
Job isolado de PostgreSQL 17.6 adicionado à PR para testar sessões reais: replay simultâneo, requests diferentes, pagamento primeiro e gratuidade primeiro. O teste consulta pg_stat_activity e exige espera por lock nos cenários de disputa. Resultado ainda deve ser confirmado no CI; não usa banco ou provedor real.
