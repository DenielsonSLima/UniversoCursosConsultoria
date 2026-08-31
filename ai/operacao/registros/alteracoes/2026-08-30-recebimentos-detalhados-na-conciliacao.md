# Recebimentos detalhados na Conciliação & Baixas

Data: 2026-08-30  
Estado: concluído e publicado em produção

## Pedido e escopo

Reaproveitar `Financeiro > Conciliação > Conciliação & Baixas` como visão
detalhada de recebimentos, sem criar um segundo módulo e sem criar outra rotina
de baixa. Cada cobrança deve ocupar duas faixas: identificação do título e
detalhes financeiros da baixa.

## Diagnóstico confirmado

- Produção possui 263 recebimentos: 48 automáticos Banese, 26 manuais e 189
  históricos migrados.
- A consulta anterior se restringia a `gateway_provider = banese_card`, por isso
  a lista de pagos cobria somente 49 registros.
- Os 48 recebimentos Banese e os 26 manuais possuem timestamp canônico de
  registro no sistema. O histórico migrado conserva somente a data, sem hora.
- A composição é explícita nas 26 baixas manuais. Entre as 48 baixas Banese, 46
  podem ser reconciliadas deterministicamente pelas regras do título e duas
  permanecem não discriminadas. O histórico não recebe juros ou descontos
  inferidos.

## Implementação

- A visão abre em `Pago` e usa uma RPC paginada, somente leitura, com busca,
  período da baixa, origem, empresa e polo aplicados no servidor.
- A tabela existente ganhou duas faixas por cobrança e versão equivalente em
  cartões responsivos.
- São mostrados pagador, CPF/CNPJ mascarado, título, curso, turma, matrícula,
  parcela, nosso número, vencimento, valor nominal e situação.
- A faixa da baixa mostra data/hora e proveniência do timestamp, valor pago,
  desconto, juros, multa, acréscimos, forma, conta mascarada, empresa, polo,
  operador, origem e comprovante seguro quando disponível.
- Banese, manual, CNAB240, Mercado Pago, histórico migrado e outras origens são
  separados. Um título pago sem evidência de baixa manual não é classificado
  artificialmente como Caixa/Manual.
- O filtro de período só fica ativo em `Pago`; ao sair dessa visão o período é
  limpo para não sugerir um recorte que a consulta de pendências não aplicaria.
- O Realtime continua agrupado em dois segundos, mas eventos de recebíveis
  invalidam somente a lista ativa. Na visão paga, a assinatura recebe apenas
  eventos com `status = PAGO`; nas demais, permanece restrita ao Banese. Os oito
  indicadores auxiliares deixam de ser consultados na visão paga e só são
  habilitados quando necessários.

## Segurança e desempenho

- A RPC exige usuário autenticado, módulo Financeiro, aba A Receber e polo
  permitido. `PUBLIC`, `anon` e `service_role` não possuem execução.
- `SECURITY DEFINER` usa `search_path` vazio; CPF/CNPJ expõe somente os dois
  últimos dígitos e a conta é mascarada no SQL; payload bancário bruto e
  evidências internas não são retornados.
- Busca por documento exige CPF/CNPJ completo. Histórico não passa pelo
  resolvedor de composição, e comprovante legado só é liberado para origem
  gateway/CNAB comprovada e por URL HTTPS.
- O feed recebe explicitamente `production` ou `sandbox`; baixas manuais e
  histórico permanecem canônicos, enquanto registros de gateway respeitam o
  ambiente selecionado.
- A composição financeira canônica ocorre somente depois de `LIMIT/OFFSET`,
  evitando cálculo sobre todo o conjunto.
- `EXPLAIN ANALYZE` somente leitura, executado contra o schema real para página
  de 20 itens sobre os 263 pagos, levou cerca de 30 ms e utilizou
  `contas_receber_pago_polo_data_idx`.
- A publicação deve aplicar e verificar primeiro a migration e somente depois o
  frontend. A visão paga não usa a consulta Banese anterior como fallback,
  porque ela ocultaria baixas manuais e históricas sem avisar.

## Validação

- Os 48 testes do domínio passaram; a expectativa antiga que classificava
  indevidamente título Banese cancelado como baixa manual foi corrigida.
- Os 25 contratos diretamente afetados passaram integralmente.
- ESLint focado, TypeScript e build de produção passaram.
- Todos os arquivos manuais do lote permanecem abaixo de 500 linhas.
- A revisão independente terminou sem achado `Critical` ou `Important`.
- A migration foi aplicada remotamente como `20260831010512`; a assinatura,
  owner, estabilidade, `search_path` e privilégios foram conferidos no catálogo.
- A chamada autenticada real retornou 263 recebimentos — 48 Banese, 26 manuais e
  189 históricos — com paginação correta e sem campos sensíveis no payload.
- Chamadas sem identidade e com polo fora do escopo falharam com `42501`.
- O advisor registrou apenas o alerta intencional de função `SECURITY DEFINER`
  executável por `authenticated`; as guardas internas e grants mínimos foram
  preservados.
- A entrega foi versionada como `4.8.14` e publicada no `main` para o deploy de
  produção. O navegador integrado permaneceu indisponível para smoke visual
  autenticado; essa limitação continua registrada sem simular uma sessão.

## Riscos conhecidos

- O horário Banese exibido é o instante em que a confirmação foi registrada no
  sistema, não uma hora bancária inventada.
- Histórico migrado mostra `horário não disponível` e, quando há diferença de
  valor sem prova dos componentes, mantém a composição como não discriminada.
- Paginação por offset é adequada ao volume atual; crescimento material do
  histórico poderá justificar cursor em lote futuro.
- Uma reversão externa que retire um título de `PAGO` pode aparecer somente no
  próximo foco da janela ou em `Atualizar Dados`; o filtro Realtime evita
  reintroduzir a rajada de todas as contas a receber.
- Comprovantes exigem HTTPS, mas a allowlist de hosts ficou para um lote futuro
  porque as origens legítimas ainda não possuem cadastro canônico único.

## Manifesto explícito

Total: 21 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/alteracoes/2026-08-30-recebimentos-detalhados-na-conciliacao.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/conciliacao-bancaria/ConciliacaoBancariaTab.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoOrigemBaixaPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoFilters.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.fetch.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.filter-state.contract.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.formatters.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.utils.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.utils.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-recebimentos.fetch.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-recebimentos.model.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-recebimentos.model.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/hooks/useBaneseConciliacaoQueries.ts`
- `supabase/migrations/20260830215000_create_secure_financial_receipts_feed.sql`
- `supabase/tests/secure_financial_receipts_feed.contract.test.ts`
