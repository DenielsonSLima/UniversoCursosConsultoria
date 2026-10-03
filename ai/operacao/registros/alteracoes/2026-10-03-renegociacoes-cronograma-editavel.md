# Cronograma editável da renegociação — 4.8.164

## Pedido e aceite

Usuário solicitou editar vencimento e valor individual na revisão, mostrar o desconto concedido
e motivos de aprovação em português. Autorizou expressamente aplicar no banco e publicar em produção
após testes, sem emissão ou cancelamento de cobranças durante a implantação.

## Escopo e implementação

- Base publicada main 95c73c6, em overlay isolado para preservar alterações paralelas.
- Editor coleta datas/valores; somente RPC confere soma, cronologia, política e cronograma canônico.
- Entrada preservada; soma das parcelas deve corresponder ao saldo parcelado.
- Alterações pendentes impedem salvar; erro mantém rascunho; sucesso atualiza identificação canônica.
- Retry dentro do modal preserva requestId e payload; não promete recuperação após fechar/reabrir.
- Desconto comercial destacado e pontualidade futura separados; aprovação continua exigida.
- Custom usa snapshot v3, permanece sujeito à aprovação e sem ativação bancária.
- PR249 de efetivação continua fora desta publicação.
- Duas migrations v2 já aplicadas são incluídas sem alteração para reconstrução e ensaio:
  schedule_v2 (ledger 20261003153539) e terms_v2 (ledger 20261003153612).
  Paridade das três funções verificadas por hash pg_get_functiondef em PGlite e catálogo remoto.
- Somente duas migrations novas custom_schedule serão aplicadas; não há alteração em títulos reais.

## Manifesto explícito

Total: 19 arquivos.

- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoScheduleEditor.tsx`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacaoScheduleDraft.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.types.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.presentation.ts`
- `modules/gestor/financeiro/renegociacoes/components/CanonicalSummary.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CanonicalSummary.test.mjs`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.approval-labels.ts`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizardSchedule.test.mjs`
- `supabase/migrations/20261003153539_receivable_renegotiation_schedule_v2.sql`
- `supabase/migrations/20261003153612_receivable_renegotiation_terms_v2.sql`
- `supabase/migrations/20261003190000_receivable_renegotiation_custom_schedule_helper.sql`
- `supabase/migrations/20261003190001_receivable_renegotiation_custom_schedule_snapshot.sql`
- `scripts/test-renegociacao-cronograma-custom.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-03-renegociacoes-cronograma-editavel.md`

## Validação e limites

- Reprodução: cronograma somente leitura e RPC rejeitando scheduleEntries.
- PGlite: ausência de custom preserva v2; datas/centavos/sequência/soma; entrada/política;
  round-trip de fingerprints; CAS, justificativa, save/detail/replay e títulos originais intactos.
- JSDOM: editar, validar, erro e recuperação, restauração, voltar às Condições e retry idêntico.
- Apresentação: motivos em português, desconto comercial e pontualidade distintos, detalhes readonly.
- Regressão do resumo Parcelas → Condições mantida; lint focado aprovado.
- Manifesto com teto 500; CI completo e Preview antes de merge; produção conferida no artefato público.
- Teste em navegador autenticado dispensado pelo usuário; JSDOM não é validação visual.
- Nenhuma emissão, cancelamento, baixa ou exclusão de dados reais em teste/implantação.
- Aplicação remota, CI e URL final registrados no PR; não há promessa de efetivação bancária.

