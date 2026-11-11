# NFS-e: listas, identificação e ambiente

## Pedido e aceite

Busca e filtros por data/tipo em Serviços, paginação, seleção múltipla e exclusão
somente de não emitidos; CPF e cidade/UF ao lado do aluno; indicador de ambiente
compacto. Revisão e publicação em produção solicitadas pelo usuário.

## Entrega e segurança

- Listagem e total financeiro calculados no servidor antes da paginação. Busca
  literal por nome, documento, serviço, modelo ou número; Todos é o padrão para
  preservar PJ, PF e alunos existentes. Datas vazias usam o mês selecionado.
- Seleção geral e revisão em lote preservadas. Seleção mista nunca exclui um
  subconjunto silencioso; atalho seleciona apenas elegíveis da página atual.
- Confirmação de exclusão, request_id estável após resposta incerta e rechecagem
  atômica no servidor. Somente sem operação ou rejeição definitiva comprovada.
- Emitidas, canceladas, prévias, processamento, confirmação pendente ou identidade
  fiscal permanecem protegidos. Histórico, snapshots, títulos e pagamentos ficam
  intactos. Marcas/auditoria append-only com RLS e grants mínimos.
- Locks compatíveis com emissão e guarda no vínculo impedem prévia de serviço
  removido. Resumo e eventos por mês real acompanham as marcas.
- CPF/cidade/UF usam apenas cadastro existente e as mesmas guardas de polo.
- Indicador neutro não comprova saúde do governo. Erro vermelho significa falha
  da consulta interna. O seletor de ambiente permanece nas Configurações.

## Validação

- Lista: 11 testes de contrato, 9 SQL isolados e interação DOM aprovados.
- CPF/cidade: 11 contratos, 2 apresentação, 1 DOM e 5 SQL isolados aprovados.
- Indicador: interação DOM e ESLint focado aprovados.
- Fluxo diário atualizado e aprovado: sete abas, consulta cancelada preservada
  e troca de ambiente exclusivamente pelas Configurações, sem nova emissão.
- Revisão independente de backend sem P1/P2. Revisão UI detectou acoplamento
  seleção/exclusão que foi corrigido e coberto por teste de operação PROCESSING.
- Nenhum registro real excluído, emitido, cancelado ou alterado pelos testes.
- Duas sessões PostgreSQL concorrentes e smoke Safari autenticado não executados;
  concorrência foi avaliada pelo contrato/locks e testes isolados. Mac offline.
- TypeScript global, build completo, lint e regressões da CI devem passar no SHA
  candidato antes da publicação. Migrations via MCP, pré/pós-checagem sem mutação
  de dados operacionais. Nenhuma Edge ou credencial muda neste lote.

## Manifesto explícito

Total: 37 arquivos

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-listas-identificacao-ambiente.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/components/NfseEnvironmentStatus.interaction.test.mjs`
- `modules/gestor/emissor-nfse/components/NfseEnvironmentStatus.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceFilters.tsx`
- `modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab.interaction.test.mjs`
- `modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab.tsx`
- `modules/gestor/emissor-nfse/parceiros/hooks/useNfsePartnerServices.ts`
- `modules/gestor/emissor-nfse/parceiros/nfse-partner-services.css`
- `modules/gestor/emissor-nfse/parceiros/queries/nfse-partner-services.keys.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-list.contract.test.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-list.contract.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.test.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.service-core.ts`
- `modules/gestor/emissor-nfse/parceiros/types/nfse-partner-services.types.ts`
- `modules/gestor/emissor-nfse/preparar/NfseStudentGroups.interaction.test.mjs`
- `modules/gestor/emissor-nfse/preparar/NfseStudentGroups.tsx`
- `modules/gestor/emissor-nfse/preparar/nfse-student-registration.presentation.test.ts`
- `modules/gestor/emissor-nfse/preparar/nfse-student-registration.presentation.ts`
- `modules/gestor/emissor-nfse/preparar/nfse-students.css`
- `modules/gestor/emissor-nfse/preparar/nfse-students.types.ts`
- `modules/gestor/emissor-nfse/preparar/services/nfse-students.contract.test.ts`
- `modules/gestor/emissor-nfse/preparar/services/nfse-students.contract.ts`
- `modules/gestor/emissor-nfse/preparar/types/nfse-students.types.ts`
- `supabase/migrations/20261111105000_nfse_partner_service_removal.sql`
- `supabase/migrations/20261111105001_nfse_partner_service_filters.sql`
- `supabase/migrations/20261111105002_nfse_removed_service_summary.sql`
- `supabase/migrations/20261111110000_nfse_receipt_student_registration.sql`
- `supabase/tests/nfse_partner_service_removal.isolated.test.mjs`
- `supabase/tests/nfse_receipt_student_registration.isolated.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseDailyFlow.interaction.test.mjs`
