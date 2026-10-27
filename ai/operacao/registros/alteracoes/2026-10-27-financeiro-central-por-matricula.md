# Financeiro central por matrícula — 27/10/2026

Estado: PUBLICADO E CONFERIDO. PR330 integrada em 5c309c74239bf2f7ec5c2e71e29c591fbfbfcc1b; CI completo aprovado no head 2b33cf56622b5d679128fcbe517b4a341fe6184c. Versão 4.8.236/revisão 245. Base main 0845b90521fc3ad4fbe7c1fbf948d5055755d7de, posterior à PR329. Nenhuma operação bancária real integra o lote.

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
2. Aplicada 20261027151005: projeções privadas aditivas, sem ativar mudança de elegibilidade/contagem.
3. Aplicada 20261027151011: coluna nullable e provas privadas/guard de imutabilidade, sem backfill.
4. Aplicada 20261027151020: ativação conjunta de contagem, opções, prévia, gerador, guards, autorização e claim na mesma migration/transação. Não separar estes blocos.
5. Readback de corpos, ACL, owner e search_path aprovado; contagens e hashes financeiros preservados. UI nova retrocompatível foi publicada primeiro, conforme validação independente e decisão coordenada, evitando backend novo diante do parser antigo.

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

- Primeiro CI identificou alias de import não resolvido pelo Deno. Imports do novo módulo foram convertidos para caminhos relativos, sem alterar regras, testes ou configuração do runner; todos os 10 workflows passaram no head final2b33cf56.

## Evidência de produção

- Vercel production dpl_8qaaRHEGRnX4hh9BQXb6iX5362NE READY, commit 5c309c74 e aliases universocc.com.br/www.universocc.com.br. Árvore do merge igual à árvore validada cd516c330f3fa1acb16e21e03cd34088ba3e7ea4.
- GET público /gestor retornou HTTP200, título Portal do Gestor; asset real main-vblFdGtE.js contém versão 4.8.236. Nenhum smoke autenticado ou chamada bancária foi executado.
- UI nova/backend antigo validada em 4 cenários independentes. Abas já abertas com JS v235 não são atualizadas automaticamente; usuário foi orientado a evitar ações durante ativação e recarregar/conferir 4.8.236 antes do aceite manual.
- Antes da DDL: zero runs GENERATING, zero API_AMBIGUOUS, zero claims/autorização recentes e zero chamadas ativas de geração/claim. API_REVIEW existente não estava em execução recente.
- SQL aplicado às 15:10 via MCP; versões reais 151005/151011/151020, nomes alinhados ao ledger sem alteração de bytes. SHA256 respectivos: 4a011ceaad10e2b3da17a57168239e9698a62a667ad7dc03cb36edbda6d5ec7f;9d4d64a7020b13613516072f936e5ce01599bc097a197a8cdb5c6119af195b4d;739287e8e87126c93876f08fc8c3bb6cd8b89978006a3f171eb2a1b71caab045.
- Auditor independente confirmou 24 definições exatas, grants/RLS/tabelas/constraints/triggers antigos preservados e coluna/trigger novos esperados. Zero alteração nos 21 fingerprints financeiros/proveniência/proteção entre baseline 15:09 e readback 15:10. 7.219 recebíveis, 38 runs, 454 autorizações e 411 fatos preservados.
- 29 runs legados passaram prova histórica completa na leitura; isto não elimina outras validações operacionais. O único API_REVIEW possui run comprovado e mantém token/autorização e updated_at original; nenhuma baixa, reemissão ou novo vencimento foi criado.
- Aceite consciente na sessão do gestor permanece com o usuário. Pagamentos legítimos anteriores ou posteriores à janela comparada não são atribuídos à migration. Regressões simuladas não substituem resposta real do banco.

O alinhamento dos nomes ao ledger e dos caminhos de teste exige avanço de versão pelo gate do repositório: candidato4.8.237/revisão246, sem alteração de lógica financeira ou bytes SQL. A versão funcional4.8.236 já foi verificada em produção; o commit de alinhamento exige CI próprio antes da integração.

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
- `supabase/migrations/20261027151005_enrollment_financial_source_projection.sql`
- `supabase/migrations/20261027151011_manual_cycle_manager_decision.sql`
- `supabase/migrations/20261027151020_manual_cycle_manager_choice.sql`
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
