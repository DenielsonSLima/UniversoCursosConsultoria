# Financeiro central por matrícula — 27/10/2026

Estado: publicação autorizada pelo usuário, aguardando CI e aplicação controlada. Versão 4.8.236/revisão 245. Base main 0845b90521fc3ad4fbe7c1fbf948d5055755d7de, posterior à PR329. Nenhuma operação bancária real integra o lote.

## Escopo e arquitetura

- Fonte canônica privada no PostgreSQL projeta origens múltiplas por matrícula, título e ciclo; módulo `modules/shared/financeiro/matricula` centraliza contrato, parser, seleção e rótulos na interface existente.
- Origem histórica, provedor, canal e destino são dimensões distintas. Lançamentos, emissão bancária comprovada, cobrança externa conhecida, taxas, ajustes residuais, pagamento e revisão não se confundem.
- Gestor escolhe C1, C2 ou não emitir. Contagem e consulta Proesc são informativas, não bloqueios por quantidade, quitação ou TTL. Conflito positivo, mesma obrigação já existente e operação ambígua continuam protegidos contra duplicação.
- Decisão server-side imutável no run existente vincula matrícula, ator original, request, fingerprints e itens revisados. Após COMMIT, autorização e primeiro claim continuam a validar RBAC/polo e identidade atual.
- Compatibilidade legada somente leitura exige run LOCAL_CREATED, ledger, auditoria única, hash da intenção reconstruído exatamente, snapshots, IDs e itens imutáveis coerentes. Não preenche manager_decision nem inventa evidência. Pagamentos e estados bancários mutáveis não invalidam a prova histórica da composição.
- Retomada explícita por ciclo mantém a mesma operação; resposta bancária ambígua não é limpa para novo POST. Evidência positiva posterior do mesmo ciclo impede primeiro claim novo, sem bloquear reconciliação da identidade existente.
- Continuidade canônica de transferência, planos individuais e datas por ciclo são preservados. Uma matrícula inválida recebe diagnóstico não operacional sem derrubar as demais.

## Aplicação e reversão

1. Versionar, sem reaplicar, 20261027113154 recuperada byte a byte do ledger: SHA256 35c6445c865f0a425f2a731254a87c589b932f4ba93c1388902591fd94017921.
2. Aplicar 121000: projeções privadas aditivas, sem ativar mudança de elegibilidade/contagem.
3. Aplicar 121100: coluna nullable e provas privadas/guard de imutabilidade, sem backfill.
4. Aplicar 121200: ativação conjunta de contagem, opções, prévia, gerador, guards, autorização e claim na mesma migration/transação. Não separar estes blocos.
5. Readback de corpos, ACL, owner e search_path; comparar contagens/hashes financeiros antes/depois. Só então integrar web e conferir deployment/versão.

Todas as migrations usam lock_timeout e ACL restrita; alterações de corpos existentes exigem hashes e substituições exatas. Nenhuma política de turma, título, pagamento, fato histórico ou autorização é atualizada pela migration. PROTECTED_EXISTING não recebe snapshot nativo artificial.

Rollback operacional: interromper publicação se qualquer guard/readback divergir. Não remover coluna/decisão já registrada nem desfazer registros financeiros. Reverter UI ao commit anterior somente com backend compatível; reversão da ativação requer migration nova revisada e atômica dos corpos preservados, nunca executar apenas parte das rotas antigas.

## Validação

- Três análises independentes; revisão UI/serviço aprovada em 11 cenários e revisão SQL de grants, imutabilidade, legado estrito e pós-COMMIT.
- PostgreSQL isolado executa prévia e gerador reais, COMMIT, replay idempotente, autorização e primeiro claim em outra transação. Fixtures de autenticação/configuração são sintéticas; não há chamada bancária ou Proesc real.
- Casos: 24 PARCELA lançadas e zero emitidas; 12 emitidas e taxa rejeitada; fontes mistas; PROTECTED_EXISTING; aluno novo em turma importada; ausência de policy de turma; escolha sem consulta Proesc; não emitir; isolamento de matrícula inválida; planos/datas; retomada de ambos os ciclos; legado comprovado e provas adulteradas.
- Concorrência é simulada no PostgreSQL isolado; não constitui teste de carga com múltiplas conexões de produção. Aceite autenticado será realizado pelo usuário.
- Checkout local foi reconstruído por SHA de blobs via MCP; alguns binários históricos não pertinentes não foram materializados. CI com checkout completo é obrigatório antes de publicação.
- Nenhuma alteração fora do manifesto. Sem mudanças de AGENTS, skills, credenciais, Edge Functions ou layout geral.

- Gates locais: TypeScript, lint, versão, build e limite de linhas aprovados; 27 testes novos e 56 de recuperação aprovados. Contratos anteriores foram atualizados apenas nas expectativas substituídas pela decisão canônica, data do plano e rótulo de títulos. CI completo ainda é condição para aplicação.

- Primeiro CI identificou alias de import não resolvido pelo Deno. Imports do novo módulo foram convertidos para caminhos relativos, sem alterar regras, testes ou configuração do runner; revalidação completa é exigida no novo head.

## Manifesto explícito
- `.github/workflows/technical-cycle-recovery.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-27-financeiro-central-por-matricula.md`
- `docs/contracts/ciclos-tecnicos-passagem-e-proveniencia.md`
- `docs/decisions/ciclos-tecnicos-cobrancas.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiroTecnico.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroManagerCycleChoice.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroMatriculaSources.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/ciclo-manual-transfer-setup.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financial-row-isolation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-proesc.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-state-recovery.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.types.ts`
- `modules/shared/financeiro/matricula/contract.ts`
- `modules/shared/financeiro/matricula/labels.ts`
- `modules/shared/financeiro/matricula/parser.ts`
- `modules/shared/financeiro/matricula/selectors.ts`
- `supabase/migrations/20261027113154_manager_second_cycle_without_proesc_gate.sql`
- `supabase/migrations/20261027121000_enrollment_financial_source_projection.sql`
- `supabase/migrations/20261027121100_manual_cycle_manager_decision.sql`
- `supabase/migrations/20261027121200_manual_cycle_manager_choice.sql`
- `supabase/tests/fixtures/manager-cycle/calculation.sql`
- `supabase/tests/fixtures/manager-cycle/creation.sql`
- `supabase/tests/fixtures/manager-cycle/fixture.sql`
- `supabase/tests/fixtures/manager-cycle/guards.sql`
- `supabase/tests/fixtures/manager-cycle/legacy-preview-and-proesc.sql`
- `supabase/tests/fixtures/manager-cycle/previews.sql`
- `supabase/tests/fixtures/manager-cycle/snapshots.sql`
- `supabase/tests/fixtures/manager-cycle/state-and-authorization.sql`
- `supabase/tests/fixtures/manager-financial-context/monthly-count-before.sql`
- `supabase/tests/fixtures/manager-financial-context/schema.sql`
- `supabase/tests/manager-cycle-generation.isolated.test.mjs`
- `supabase/tests/manager-cycle-integration-setup.mjs`
- `supabase/tests/manager-cycle-legacy-proof.isolated.test.mjs`
- `supabase/tests/manager-cycle-ui-runtime.mjs`
- `supabase/tests/manager-cycle-ui.test.mjs`
- `supabase/tests/manager_financial_context.isolated.test.mjs`
Total: 50 arquivos.
