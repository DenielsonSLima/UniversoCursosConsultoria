# Ciclos técnicos individuais — 24/09/2026

## Objetivo e aceite

- Solicitação explícita de análise com três agentes, correção e publicação em produção.
- Primeiro ciclo individual em turma em andamento/transferência sem histórico próprio; matrícula e doze parcelas revisáveis com termos canônicos da turma.
- Segundo ciclo por intenção explícita após emissão integral do primeiro; cobranças externas, importações e histórico da origem nunca autorizam reinício.
- Matrícula opcional no boleto, sem registrar pagamento, baixa ou quitação por essa escolha.
- Não alterar fatos financeiros existentes, parser Banese, compositor/modelo PDF ou fluxos EAD/Livre.

## Diagnóstico

- Matrícula investigada ativa, sem recebíveis/fontes Proesc; turma sem política manual, com matrícula desabilitada/zero e primeira data antiga.
- A seleção por política da turma acionava gerador legado; o formulário não permitia corrigir a data rejeitada.
- Guardas adicionais de implantação e histórico da origem identificadas no smoke transacional e tratadas pelo contrato individual, sem liberar importações.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualChargeRows.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualItemEditor.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useCicloManualRevision.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaCicloManual.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.parser.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.keys.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.ts`
- `supabase/functions/technical-manual-cycle-issuance/dependencies.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/revision.ts`
- `supabase/functions/technical-manual-cycle-issuance/revision.test.ts`
- `supabase/functions/banese-carnet-document/document-policy.ts`
- `supabase/functions/banese-carnet-document/index.ts`
- `supabase/functions/banese-carnet-document/manual-cycle-carnet.test.ts`
- `supabase/functions/secretaria-banese-document-groups/index.ts`
- `supabase/functions/secretaria-banese-document-groups/document-groups.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.types.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.contract.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.contract.test.ts`
- `modules/gestor/secretaria/carnes-alunos/components/BaneseDocumentGroupCard.tsx`
- `supabase/migrations/20260924150000_individual_technical_cycle_eligibility.sql`
- `supabase/migrations/20260924150100_individual_technical_cycle_guards.sql`
- `supabase/migrations/20260924150200_review_manual_cycle_items.sql`
- `supabase/migrations/20260924150300_review_manual_cycle_preview.sql`
- `supabase/migrations/20260924150350_freeze_reviewed_manual_cycle_snapshot.sql`
- `supabase/migrations/20260924150400_generate_reviewed_manual_cycle.sql`
- `supabase/migrations/20260924150500_prepare_reviewed_manual_cycle.sql`
- `supabase/migrations/20260924150600_allow_individual_manual_cycle_implantation.sql`
- `supabase/tests/individual_technical_cycles.transaction.sql`
- `supabase/tests/reviewed_manual_cycle.rollback.sql`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-09-24-ciclos-tecnicos-individuais.md`
- `supabase/tests/individual_manual_implantation.transaction.sql`

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-issuance-progress.contract.test.ts`

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.contract.test.ts`

Total: 46 arquivos.

## Implementação

- Análise individual inclui fontes Proesc, vínculos, cobertura externa, cobranças avulsas e demais matrículas da pessoa.
- Backend calcula e valida cada item, ordenação/datas/valores, totais e fingerprints. Run congela os itens revisados; trigger reconstrói o snapshot v2 a partir desse registro.
- Autorização precede replay; locks por pessoa/matrícula e request preservam idempotência. Revisão diferente não reutiliza request.
- Modal exige recalcular alterações antes de confirmar; campos continuam disponíveis após rejeição e boleto da matrícula pode ser excluído/reincluído.
- Matrícula de ciclo C1 canônico pode integrar o carnê; catálogo conta matrícula separadamente de mensalidade/rematrícula.

## Validação

- Três agentes: elegibilidade/guardas, modal/Edge e revisão/publicação/documentos.
- 20 testes Deno contratuais legados, 50 testes UI/Edge e 45 testes documentais aprovados; duas Edges documentais tipadas.
- Selftests SQL sintéticos executados atomicamente com a migration de guardas.
- Build completo aprovado; aviso de chunks grandes preexistente sem erro de compilação.
- Smoke CUA no modal real com serviço simulado: lista de 13 itens, opção de 12 itens, edição individual, bloqueio enquanto alterado, recálculo e confirmação do payload. Segundo ciclo exibe data editável e recarrega prévia.
- PDF canônico sintético de 13 títulos/5 páginas com primeira/última páginas renderizadas; textos e logo isolada conferidos, sem alteração de compositor.
- Smoke autenticado em produção pendente: Safari exige autenticação local do responsável; solicitado na conversa. Validação real do backend é independente da sessão.
- Geração real em transação revertida aprovada nas variantes de 13/12 itens: snapshots por item, termos RPC/Edge, replay sem duplicação, alteração de intenção e falta de autorização rejeitadas. Autorização por recebível e replay também exercitados com ator ativo autorizado no polo; termos Banese v2 preservados e chamada sem identidade rejeitada. Nenhum POST bancário executado.

## Publicação e preservação

- Base remota main 7735a109; local HEAD antigo não usado para publicar.
- Versão 4.8.78/revisão 87; alterações paralelas do Caixa 4.8.77 preservadas localmente e excluídas da publicação.
- Changelog e registro de manifestos remotos construídos sobre main com apenas a entrada deste lote.
- Migrações já aplicadas são imutáveis; fontes preservadas com IDs remotos registrados no fechamento.
- Baseline financeiro: 6.837 recebíveis, principal 1.876.839,27; 395 transações; 6.417 vínculos Proesc; 6 runs; 2 coberturas. Verificação pós-operação abaixo confirmou preservação.

## Aplicações remotas confirmadas

- Supabase projeto `kfekgwyqozhicpfuunpo`, via MCP.
- Elegibilidade: `20260924161203`; guardas/selftests: `20260924161206`.
- Revisão: `20260924161209`; prévia: `20260924161212`; snapshots: `20260924161214`.
- Geração: `20260924161217`; preparação: `20260924161220`.
- Guarda de implantação/selftests: `20260924161802`.
- Edges: `technical-manual-cycle-issuance` v4, `banese-carnet-document` v25, `secretaria-banese-document-groups` v7; JWT preservado em todas. Payloads partem dos bundles remotos e substituem somente arquivos deste lote.
- Pós-operação: 6.837 recebíveis, principal 1.876.839,27, 395 transações, 6.417 vínculos Proesc, 6 runs e 2 coberturas — iguais ao baseline. Caso investigado continua com 0 cobranças; prévia real apresenta 13 itens e exige revisar matrícula configurada em zero ou desmarcar seu boleto.
- Advisors: sem novo acesso anônimo; três novas RPCs autenticadas SECURITY DEFINER são as interfaces previstas, com grants mínimos/search_path vazio e teste negativo de autorização antes do replay.

## Revisão de publicação

- PR #170: https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/170.
- CI inicial identificou duas asserções estruturais anteriores ao payload de revisão; atualizadas preservando validação de valores, prévia e trava contra envio duplo. Etapa exata do workflow aprovada localmente: 42 testes.
- Rótulo individual ajustado para “Geração manual por ciclo”, válido antes do primeiro ciclo e nas continuações.
- Merge condicionado ao CI e à prévia Vercel aprovados no commit final; confirmação de produção registrada no PR.
