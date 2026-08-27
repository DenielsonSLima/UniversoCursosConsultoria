# Cancelamento Banese após desistência

Data: 2026-08-26
Estado: backend publicado; primeiro caso histórico encerrado integralmente e segundo caso preservado no escopo já autorizado

## Objetivo

Cancelar no Banese todos os boletos não pagos quando uma matrícula é encerrada por desistência, cancelamento ou transferência externa, inclusive os vencidos. Cancelar também títulos estritamente locais não pagos, preservando pagamentos, baixas manuais, outros gateways e identidades bancárias divergentes.

## Causa reproduzida

- A primeira desistência analisada foi registrada em 26/08/2026.
- As cobranças importadas foram criadas cerca de 3h16 depois da movimentação, quando o trigger financeiro original já havia executado sem encontrar os títulos.
- O trigger anterior alterava apenas o estado local; não existia baixa remota automática no Banese.
- A tela de Gestão mostrava “Sem lançamentos” por ausência de frequência, embora existissem cobranças no Financeiro.

## Decisão

- Uma outbox privada reserva cada baixa e persiste snapshot de convênio, Nosso Número, payment ID, vencimento, status, transação e versão do recebível.
- `PENDENTE`, `VENCIDO` ou `SUSPENSO`, não pago, emitido pela API e sem CNAB ou baixa manual é elegível, independentemente do vencimento.
- O worker consulta o estado canônico, envia a baixa e só marca `CANCELADO` localmente após nova confirmação canônica do Banese.
- Pagamento, troca de identidade, concorrência, reativação ou falha posterior ao PUT interrompem o CAS e exigem revisão; nenhum pagamento artificial é criado.
- O worker e o conciliador Banese compartilham locks e leases para não operar o mesmo título simultaneamente.
- Títulos sem qualquer referência ou transação de gateway são cancelados localmente; títulos externos de outro provedor não entram nessa regra de vencidos.
- A baixa manual em dinheiro cancela e confirma primeiro o título remoto Banese; somente depois registra o recebimento local. Falha ou ambiguidade bancária mantém a baixa local bloqueada.
- A ausência de frequência passa a ser descrita como “Sem frequência lançada”, e as mutações acadêmicas invalidam as chaves financeiras canônicas.

## Produção

- Edge Function `banese-cancellation-worker` versão 1 publicada com autenticação interna própria.
- Quatro migrations iniciais e cinco complementares aplicadas. As complementares ampliam a elegibilidade, o claim/CAS e a conclusão para todo título aberto e não pago, além de endurecer reconciliação, proteção de pagamentos, locks e prova canônica de baixa Banese.
- Cron ativo a cada minuto, sem backfill global.
- Primeira regularização limitada a oito recebíveis previamente conferidos: 8 reservados, 8 confirmados no Banese e 8 concluídos.
- Segunda regularização limitada à única outra matrícula histórica elegível: 6 títulos adicionais reservados e concluídos; outros 2 títulos futuros dela já estavam concluídos pela outbox.
- Nos dois lotes: 0 falhas, 0 revisões, 0 falhas de auditoria e nenhum pagamento ou acordo artificial.
- Complemento autorizado para a primeira matrícula: 4 boletos vencidos cancelados e confirmados no Banese; a cobrança interna sem gateway também foi cancelada pelo RPC protegido.
- Resultado final da primeira matrícula: 13 cobranças canceladas, sendo 12 Banese e 1 local; 0 abertas, 0 pagas e 0 baixas manuais.
- A segunda matrícula não recebeu backfill complementar dos títulos vencidos neste pedido. Nenhuma outra matrícula recebeu job pela regularização manual.
- Migrations remotas complementares: `20260827000704`, `20260827000707`, `20260827000709`, `20260827002350` e `20260827002819`.

## Manifesto explícito

Total: 22 arquivos

- `ai/operacao/registros/alteracoes/2026-08-26-cancelamento-banese-desistencia.md`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/gestao/tecnicos/detalhes/academic-finance-invalidation.contract.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/TurmaAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTurmaAlunosMutations.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoMatriculas.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/useParceiroAlunoMatriculasQueries.ts`
- `supabase/config.toml` — somente o bloco da nova Edge Function pertence a este hotfix
- `supabase/functions/banese-cancellation-worker/index.ts`
- `supabase/functions/banese-cancellation-worker/worker.ts`
- `supabase/functions/banese-cancellation-worker/worker.test.ts`
- `supabase/migrations/20260826224000_create_banese_terminal_cancellation_outbox.sql`
- `supabase/migrations/20260826224010_claim_banese_terminal_cancellation_outbox.sql`
- `supabase/migrations/20260826224020_complete_banese_terminal_cancellation_outbox.sql`
- `supabase/migrations/20260826224030_index_banese_terminal_cancellation_outbox.sql`
- `supabase/migrations/20260826235900_expand_terminal_cancellation_to_all_unpaid.sql`
- `supabase/migrations/20260826235910_claim_all_unpaid_terminal_cancellations.sql`
- `supabase/migrations/20260826235920_complete_all_unpaid_terminal_cancellations.sql`
- `supabase/migrations/20260827001500_harden_all_unpaid_terminal_cancellation.sql`
- `supabase/migrations/20260827002500_require_confirmed_banese_terminal_cancellation.sql`
- `supabase/tests/banese_terminal_cancellation_outbox.contract.test.ts`

## Validação

- Reunião técnica com três agentes: fluxo acadêmico, contrato Banese e interface/cache. Todos os bloqueadores encontrados foram corrigidos antes do deploy.
- Worker: 14/14 testes.
- Contrato SQL: 9/9 testes.
- Validação focada total: 42/42 testes, incluindo worker, cancelamento Banese, baixa manual e contratos SQL.
- Revisão independente encontrou cinco lacunas sem impacto no lote já concluído: reconciliação de `SUSPENSO`, proteção explícita de `data_pagamento`, confirmação do estado terminal vigente, normalização de Banese já cancelado e um atalho legado que não exigia prova canônica em título futuro. Todas foram corrigidas e revalidadas antes do fechamento.
- Parecer final da revisão independente: nenhum blocker Critical ou Important; `Ready — yes`.
- Interface/cache: 3/3 testes.
- `deno check`, `deno fmt --check`, lint Deno e ESLint focado: aprovados.
- Todos os arquivos manuais do hotfix permanecem com até 500 linhas.
- Respostas reais do worker: primeiro lote HTTP 200 com `claimed=8` e `completed=8`; segundo lote HTTP 200 com `claimed=6` e `completed=6`. Ambos tiveram `failed=0`, `reviewRequired=0` e `auditFailures=0`.
- Banco de produção após o complemento: primeira matrícula com 13/13 títulos cancelados, 12/12 títulos Banese confirmados como `CANCELED`, 0 títulos abertos, 0 pagamentos e 0 baixas manuais.
- Contrato usado pela tela `A receber`: 0 itens pendentes e 13 itens cancelados para o grupo da matrícula; cron ativo e fila pronta vazia.
- Smoke transacional em produção: tentativa de reabrir título local ou Banese já cancelado permaneceu `CANCELADO`; título com pagamento simulado permaneceu fora do cancelamento automático. Todas as simulações foram revertidas por `ROLLBACK`.
- O fluxo de baixa em dinheiro foi revalidado: o cancelamento remoto antecede a finalização local e falha fechado.
- Edge Function `asaas-api` versão 81 ativa contém o caminho de baixa manual, a baixa Banese e o estado intermediário `REMOTE_CANCELED_LOCAL_PENDING`.
- Logs de produção: todos os RPCs `start` e `complete` responderam HTTP 200; nenhuma chamada `fail` no lote.
- Advisor de segurança: nenhuma advertência nova ligada à ampliação; a outbox aparece apenas como informação por usar RLS sem policies, desenho intencional que nega clientes e deixa acesso somente ao `service_role`.
- Advisor de performance: nenhuma advertência nova ligada à ampliação; os índices da outbox ainda aparecem como não utilizados, esperado para estruturas recentes.
- TypeScript global encontrou somente erro fora do manifesto em `modules/gestor/relatorios/services/relatorio-turmas.contract.ts:205`; nenhum arquivo deste hotfix apresentou erro no lint focado.
- Verificação global do teto não concluiu porque o arquivo operacional paralelo `ai/operacao/LOTE_ATIVO.md` não estava presente no fechamento; todos os arquivos deste hotfix foram medidos diretamente e permanecem abaixo de 500 linhas.

## Pendências fora do hotfix

- Publicar os ajustes de interface em uma entrega web autorizada; o backend automático já está ativo independentemente dela.
- Backfills históricos continuam explícitos e individualizados; a ampliação não varre matrículas antigas automaticamente.
