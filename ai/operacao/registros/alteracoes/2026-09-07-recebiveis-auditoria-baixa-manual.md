# Auditoria da baixa manual em A Receber

Estado: implementação validada, migration aplicada; publicação 4.8.34 em andamento.

## Pedido e aceite

Continuação do ajuste de A Receber: identificar o usuário que deu baixa manual,
com data e horário. Preservar a data do pagamento, os cálculos no backend,
os filtros e a auditoria já persistida. Lista e cartões usam a mesma apresentação.
Entrega segue o pedido de atualização do GitHub e publicação feito nesta conversa.

## Manifesto explícito

- `supabase/migrations/20260908023000_expose_receivable_manual_settlement_audit.sql`
- `supabase/tests/receivables_manual_settlement_audit.contract.test.ts`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/financeiro.receivables-page.service.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ManualSettlementAudit.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `scripts/test-manual-settlement-audit.mjs`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-07-recebiveis-auditoria-baixa-manual.md`
- `ai/operacao/registros/alteracoes/2026-09-07-recebiveis-periodo-indicadores.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 14 arquivos.

## Contrato

- RPC v4 autoriza pelo mesmo escopo financeiro e chama v3 sem alterar filtros,
  ordem, paginação ou valores; acrescenta somente nome do ator e completed_at.
- Auditoria ligada pelo manual_settlement_id, cobrança, polo, estado COMPLETED
  e ausência de estorno. Nome vem de usuarios_sistema, como na Conciliação.
- Enriquecimento limitado à página, sem consulta de usuário no navegador.
- Conclusão apresentada em America/Maceio com segundos. Não usar created_at,
  updated_at, data do pagamento nem usuário atual como substitutos.
- Registros sem evidência mostram ausência de informação. Rotina de baixa,
  recibos e cálculos financeiros permanecem inalterados.
- Migration aditiva; v3 permanece compatível com a versão anterior do frontend.
  Aplicar v4 antes de publicar o frontend que a consome.

## Validação

- Fluxo reproduzido pelas capturas e pelo caminho real da RPC; 26 baixas
  PRESENCIAL pagas possuem vínculo e completed_at na base consultada via MCP.
- 7 testes focados de renderização e contrato SQL aprovados; lint dos arquivos
  TypeScript alterados aprovado.
- Revisão independente: sem bloqueadores; confirmar contrato remoto e smoke.
- Migration aplicada via MCP, ledger `20260908020937` / `expose_receivable_manual_settlement_audit`.
- Comparação real v3/v4: 16 combinações modalidade/situação com identidade
  integral de valores, campos anteriores, ordem e metadados; 26 baixas auditadas.
- Guarda sem identidade bloqueia RPC; anon sem EXECUTE, authenticated autorizado
  somente após guarda interna. Nenhuma cobrança de teste alterada.
- Build 4.8.34, TypeScript completo e auditoria de linhas aprovados.
- Comparação com a main remota confirmou somente as alterações pretendidas
  nos três arquivos de implementação preexistentes.
- Pendente: CI/Preview e smoke autenticado após deploy. Preview deste projeto
  está sem configuração Supabase (limitação já confirmada na entrega anterior).
  Não foi realizada baixa financeira de teste em produção.
