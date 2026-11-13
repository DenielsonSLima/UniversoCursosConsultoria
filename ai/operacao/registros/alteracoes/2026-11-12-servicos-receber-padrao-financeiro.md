# Serviços no padrão de Contas a Receber — 4.8.330

## Pedido e diagnóstico

O usuário comparou a aba Serviços com Técnico/EAD e pediu o mesmo padrão de resumo, filtros, agrupamento, parcelas, ações e modal de recebimento. A lista de Serviços tinha quatro cartões e uma tabela própria sem o padrão já utilizado pelas modalidades.

O título de R$ 14.863,71 exibido sem Receber pertencia à NFS-e nº 6, fiscalmente cancelada. O botão estava bloqueado por essa prova fiscal, mas o motivo não era apresentado. A NFS-e nº 7 ativa é outro serviço cuja preparação preservou a opção antiga NONE, sem recebível vinculado. Não existe relação de substituição canônica que permita mover o título da nº 6 para a nº 7 apenas por valor/cliente.

O usuário confirmou expressamente nesta sessão: encerrar o título local da nº 6 e criar um título local de R$ 14.863,71 para a nº 7, sem BolePix, vencimento em 30/11/2026. A correção usa prova fiscal oficial, guardas de ausência de pagamento/banco e o criador canônico de recebíveis; não altera as notas fiscais.

## Escopo em execução

- Resumo, filtros de período e situação, contagens e modos tabela/cartões no padrão existente.
- Grupos paginados por parceiro e parcelas carregadas sob demanda; totais e valores calculados no backend.
- Mesmo FinancialPaymentModal e API RECEIVABLE usados pelo sistema, preservando composição, baixa parcial e histórico.
- Capabilities autoritativas por papel, polo, status e prova fiscal; motivo visível para títulos bloqueados.
- Guarda de preview/prepare/confirm contra recebimento de serviço fiscalmente cancelado, mantendo a consulta do histórico.
- Duas operações locais, específicas e idempotentes para o ajuste nº 6/nº 7 autorizado.
- Extrato PDF de Serviços com o exportador institucional, snapshot dos filtros selecionados e acesso por polo.

## Correção local executada

As duas operações foram revisadas e testadas antes de executar via MCP. Às 22:16:31 locais, o worker concluiu a baixa LOCAL_CANCELLED da cobrança nº 6, mantendo o job DONE. Às 22:16:56 foi criado o recebível nº 7, ID `180bd4c8-c9bd-441d-ab9d-158efb57e4ff`, PENDENTE, valor R$ 14.863,71, vencimento 30/11/2026, plano EXPLICIT e issue_bolepix=false. Há zero jobs BolePix e zero eventos de pagamento para ambos. Nenhum cancelamento fiscal, emissão bancária ou recebimento real foi solicitado pelo agente.

A capacidade canônica resultante é canSettle=false para o título cancelado e true para o novo título ativo. Não houve reaproveitamento do ID nem do vínculo da nota cancelada.

## Extrato PDF expressamente autorizado

O usuário respondeu “Sim, incluir o Extrato PDF de Serviços” à pergunta específica após a revisão automática recusar a primeira aplicação por considerar a exportação detalhada fora do pedido visual. Com a autorização explícita, a mesma migration 225300 foi aplicada por MCP e as ACLs foram conferidas: execução apenas para authenticated com identidade e acesso Financeiro/Receber, recortada por polo.

O extrato usa o compositor institucional existente. Uma única RPC captura linhas, resumo canônico e horário de geração dos filtros selecionados; nenhum total financeiro é recalculado no navegador. Acima de 5.000 títulos, a operação exige refinar os filtros e não trunca silenciosamente. Respostas de filtros antigos são descartadas. A validação usa dados sintéticos, sem exportar dados financeiros reais como teste.

## Validação e publicação

Quatro migrations de capacidades, grupos, guarda fiscal do preview e snapshot de exportação foram aplicadas por MCP após os testes focados. Os nove testes de grupos, oito de guarda e cinco de exportação foram aprovados. As RPCs novas sem identidade recusaram a leitura antes de obter dados. Interface concluída; candidato 4.8.330 em validação final de publicação. Os testes do novo fluxo e o manifesto final serão registrados antes da publicação. O agente não usa Safari ou outro navegador, nem realiza pagamento real como teste.

## Verificações de fechamento

- Grupos/capacidades: nove testes SQL aprovados; guarda fiscal do preview: oito aprovados; operações autorizadas: três aprovados com nove cenários negativos.
- Modal real: ponte Serviços e retomada legada aprovadas; historyOnly bloqueia nova prévia/baixa de serviços cancelados, preservando o histórico. readOnly legado mantém a conferência da intenção imutável enviada em Técnico/EAD. Revisão independente sem bloqueantes.
- Interface: cinco contratos e dois smokes DOM de grupos/parcelas/filtros/Realtime e snapshot de exportação aprovados. Dois testes PDF preservam 31 parcelas sintéticas e totais canônicos em três páginas nativas, com rodapé e marca institucional conferidos. DTOs gerados pelas RPCs em PGlite passaram no parser real. TypeScript, lint e build completo aprovados.
- A apresentação reutiliza os componentes e classes de Técnico/EAD. Nenhuma interface ou navegador foi controlado pelo agente; conferência geométrica autenticada permanece com o usuário.

## Manifesto explícito

Total: 35 arquivos

- `modules/gestor/financeiro/receber/servicos/ServicosReceberTab.tsx`
- `modules/gestor/financeiro/receber/servicos/ServiceReceivableRow.tsx`
- `modules/gestor/financeiro/receber/servicos/useServicosReceber.ts`
- `modules/gestor/financeiro/receber/servicos/servicos-receber.contract.ts`
- `modules/gestor/financeiro/receber/servicos/servicos-receber.service.ts`
- `modules/gestor/financeiro/receber/servicos/service-receivable.presentation.ts`
- `modules/gestor/financeiro/receber/servicos/ServiceReceivablesToolbar.tsx`
- `modules/gestor/financeiro/receber/servicos/ServiceReceivablesList.tsx`
- `modules/gestor/financeiro/receber/servicos/ServicosReceberTab.interaction.test.mjs`
- `modules/gestor/financeiro/receber/servicos/servicos-receber.contract.test.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesSummaryCards.tsx`
- `supabase/migrations/20261112225000_nfse_service_receivable_capabilities.sql`
- `supabase/migrations/20261112225100_nfse_service_receivable_groups.sql`
- `supabase/tests/nfse_service_groups.fixture.mjs`
- `supabase/tests/nfse_service_groups.isolated.test.mjs`
- `modules/gestor/financeiro/settlements/FinancialPaymentModal.tsx`
- `modules/gestor/financeiro/settlements/useFinancialPaymentForm.ts`
- `modules/gestor/financeiro/receber/servicos/ServicePaymentBridge.interaction.test.mjs`
- `supabase/tests/nfse_service_authorized_local_operations.test.mjs`
- `supabase/operations/nfse-service-local-cancellation-20261112.sql`
- `supabase/operations/nfse-service-active-receivable-20261112.sql`
- `supabase/migrations/20261112225200_nfse_service_payment_fiscal_guard.sql`
- `supabase/tests/nfse_service_payment_fiscal_guard.isolated.test.mjs`
- `.github/workflows/nfse-service-financial.yml`
- `modules/gestor/financeiro/settlements/financial-payment.service.ts`
- `modules/gestor/financeiro/receber/servicos/useServiceReceivablesReport.tsx`
- `modules/gestor/financeiro/receber/servicos/service-receivables-report.test.tsx`
- `supabase/migrations/20261112225300_nfse_service_receivable_export.sql`
- `supabase/tests/nfse_service_export.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-11-12-servicos-receber-padrao-financeiro.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versoes-4-8-259-a-260.md`
