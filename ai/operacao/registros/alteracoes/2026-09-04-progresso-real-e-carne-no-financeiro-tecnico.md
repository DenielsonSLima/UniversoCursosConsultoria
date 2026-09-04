# Progresso real e carnê no financeiro técnico

Estado: backend aplicado; publicação GitHub/Vercel em andamento.

## Objetivo

Substituir a barra indeterminada da emissão técnica por progresso persistido e
levar a geração documental do carnê já emitido para a tabela financeira da
turma, sem duplicar fluxo bancário ou compositor PDF.

## Decisão da revisão em três frentes

- Progresso: usar `emitidosBanese/quantidadeItens` do estado canônico do ciclo e
  acordar o workspace pelo Broadcast privado após cada registro confirmado.
- Tabela: extrair a grade para respeitar o teto de 500 linhas, projetar CPF pelo
  contrato existente e remover a coluna redundante de matrícula.
- Carnê: filtrar o catálogo read-only pelo UUID da matrícula e reutilizar
  `carnesAlunosService.prepareDocument` e `CarnesDocumentPreviewModal`.

## Guardas

- Nenhum contador temporizado ou percentual artificial.
- Nenhum POST Banese no botão de carnê.
- Nenhum PDF parcial quando a emissão do ciclo estiver incompleta.
- Escopo de polo, RBAC e validação do documento Banese permanecem obrigatórios.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-04-progresso-real-e-carne-no-financeiro-tecnico.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-24-parte-2.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunoCarneAction.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualIssuanceProgress.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financeiro-alunos-table.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-issuance-progress.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-modal-ux.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-progress-realtime.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/technical-financial-student-identity.contract.test.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.types.ts`
- `supabase/functions/_shared/authz.test.ts`
- `supabase/functions/_shared/authz.ts`
- `supabase/functions/secretaria-banese-document-groups/enrollment-filter.contract.test.ts`
- `supabase/functions/secretaria-banese-document-groups/index.ts`
- `supabase/migrations/20260904010000_broadcast_manual_technical_banese_progress.sql`
- `supabase/migrations/20260904010100_project_student_cpf_in_technical_financial_workspace.sql`

Total: 27 arquivos

## Validação

- Três revisões independentes concluídas sobre progresso, tabela e carnê. Os
  apontamentos de acessibilidade, Realtime excessivo, valor nulo e clique duplo
  foram corrigidos antes do fechamento.
- Nenhum fluxo desta mudança cria, reemite ou altera título Banese pelo botão de
  carnê; ele apenas monta o documento dos títulos já emitidos.
- 83 contratos focados aprovados, sem falha.
- TypeScript global, ESLint focado e `deno fmt --check` aprovados.
- Teto de 500 linhas aprovado para os 977 arquivos manuais auditados.
- Build de produção aprovado com 3.962 módulos transformados.
- As duas migrations foram aplicadas em produção e verificadas diretamente; os
  dois gatilhos Realtime estão ativos e a projeção canônica contém o CPF.
- Edge Functions `secretaria-banese-document-groups` v6 e
  `banese-carnet-document` v24 estão ativas, com JWT obrigatório.
- Nenhuma chamada bancária ou criação de título foi executada na validação.
