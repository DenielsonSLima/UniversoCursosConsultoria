# Outros Créditos: polo válido e recebimento na tela

Estado: PUBLICADO — PR #188, produção 4.8.100 confirmada no Safari.
Versão: 4.8.100 / revisão 109.

## Objetivo e diagnóstico

- Corrigir “Polo inválido”: regex exigia variante RFC em ID legado válido no Postgres; falhava antes da emissão bancária.
- Rota OUTROS_CREDITOS/BOLETO/production permaneceu desligada pela etapa antiga de homologação. Runtime e credencial já estão habilitados para EAD/Técnico.
- Acrescentar Receber na tela ao modal existente, mantendo Link bancário. Abrir cobrança existente faz somente leitura; emissão continua única e idempotente.
- Erros de cancelamento esperado no Caixa são diferenciados de erro real. CNAB400 é independente: EDI7 ausente/inválido, não requisito da API BolePix.
- O gráfico do Caixa já exibe somente três meses; a consulta agora busca esses mesmos três meses, reduzindo leituras sem retirar pontos visíveis.

## Manifesto explícito

- `supabase/functions/asaas/api/other-credit.service.ts`
- `supabase/functions/asaas/api/other-credit.service.test.ts`
- `supabase/functions/gateways/api/config.ts`
- `supabase/functions/gateways/api/config.test.ts`
- `supabase/migrations/20260926151500_enable_other_credit_bolepix_production.sql`
- `modules/gestor/caixa/caixa.service.ts`
- `modules/gestor/caixa/caixa-request-orchestration.test.tsx`
- `supabase/functions/gestor-other-credit-payment/payment-reader.test.ts`
- `supabase/functions/gestor-other-credit-payment/payment-capabilities.test.ts`
- `supabase/functions/gestor-other-credit-payment/index.ts`
- `supabase/functions/gestor-other-credit-payment/payment-reader.ts`
- `modules/gestor/financeiro/outros-creditos/useOutrosCreditos.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditCreateModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.test.tsx`
- `modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPaymentModal.tsx`
- `modules/gestor/financeiro/outros-creditos/useOtherCreditPayment.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-payment.service.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-payment.test.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-26-outros-creditos-pdv.md`

- `ai/operacao/qualidade/limite-linhas-manifestos.json`

- `modules/gestor/financeiro/outros-creditos/OtherCreditPaymentContent.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPdvModal.tsx`
- `modules/gestor/financeiro/outros-creditos/PdvPartnerSearch.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-pdv.test.tsx`
- `supabase/migrations/20260926173500_scope_other_credits_to_standalone_receivables.sql`
- `supabase/tests/other_credits_standalone.isolated.test.mjs`

Total: 31 arquivos.

## Aceite e guardas

- Autorização antes de replay, mesmo payload imutável e polo/cliente/conta/categoria existentes continuam obrigatórios.
- Reader exige gestor ativo, aba Outros Créditos e polo; exclui Proesc acadêmico e financiamento. Valores e confirmação vêm do backend.
- Pago/cancelado/ambíguo/quarentena não oferecem QR/boleto. Pix exige payload/imagem oficiais validados; leitura e consulta não criam cobrança.
- Acompanhamento local de 15s apenas modal aberto/visível, por até 10min; para em falha/estado final. Consulta bancária manual limitada a 20s, sem retry automático.
- API BolePix é principal; não ativar Pix avulso/cartão, não inventar EDI7, não imprimir e não emitir título real como fixture.

## Validação

- UUID: reprodução falhou antes; 11 testes Deno após correção.
- Rota: 9 testes específicos (20 junto com UUID) e 20 cenários SQL locais; preflight remoto somente leitura aprovado.
- Reader: 18 testes incluindo autorização,escopo, identidade bancária e estados.
- Interface/Caixa/PDV: 25 testes passando;lint focado aprovado.
- Total backend: 38 testes Deno; TypeScript, build completo e teto de linhas aprovados.
- Safari: PDV dedicado com campos vazios; busca do pagador por teclado, seleção com foco transferido para Valor, edição do valor e vencimento. Gerar cobrança permanece desabilitado até completar os três campos. Layout inspecionado; estados de pagamento também conferidos nos testes de renderização.
- Nenhuma nova cobrança emitida durante a validação. A confirmação bancária ponta a ponta depende de uma cobrança legítima; não foi simulada como pagamento real.

## Backend aplicado

- `asaas-api` v99: somente correção de ID de entidade sobre o bundle remoto anterior.
- `payment-gateway-api` v33: somente allowlist da rota revisada.
- `gestor-other-credit-payment` v1: leitura privada para o PDV, JWT obrigatório.
- Readback dos três bundles: conteúdo integral idêntico ao pacote enviado.
- Migration aplicada por MCP, ledger `20260926171712_enable_other_credit_bolepix_production`; arquivo local preservado com a versão preparada. Nenhum título emitido pela migration.
- Publicação contém somente os 31 caminhos deste manifesto; a registry usa a base remota mais este registro, preservando alterações paralelas locais.

## PDV dedicado e separação das entradas

- PDV em tela cheia, pagador pesquisável, valor e vencimento vazios a cada atendimento; descrição e categoria opcionais. Mantém criação única e abre o pagamento na sequência.
- Recebimento com QR oficial ampliado, copia e cola, boleto, consulta manual e novo atendimento. Link bancário e lançamentos locais preservados.
- Reproduzida a inclusão indevida de 2.940 parcelas acadêmicas da Matriz em Outros Créditos. Corrigidos ambos RPCs de lista/resumo, sem alterar títulos.
- Guarda estrutural exclui matrícula, turma, cronograma, tipo acadêmico e vínculos acadêmicos indiretos; aluno continua pagador válido de uma entrada avulsa.
- Total lançado usa principal nominal; recebido mantém o valor efetivamente pago.
- Migration ledger `20260926173551_scope_other_credits_to_standalone_receivables`; 22 fixtures SQL locais, reprodução vermelha anterior, contratos/ACL/rollback por drift aprovados.
- Pós-aplicação: RPC lista/resumo avulsos zero, contagens e valores agregados dos 6.071 acadêmicos preservados (2.940 na Matriz); fontes remotos correspondem exatamente ao patch.

## Base de publicação

Pacote recomposto sobre `b70042dbf342fa8293ddda0652ea159737b2d1a0`, preservando as versões 4.8.96, 4.8.97 e 4.8.99 publicadas em paralelo. Esta entrega usa 4.8.100 / revisão 109 e somente os 31 caminhos listados. Implementação, testes e migrations aplicadas permanecem idênticos ao pacote validado; apenas metadados foram reconciliados. PR #188 integrado em `8e3c9dc9ca0d4d39c05919c491e0e610ed82bf47`. CI de qualidade/versão e Vercel aprovados; comparação dos blobs confirmou 31/31 arquivos do pacote. Smoke autenticado no Safari confirmou versão 4.8.100, lista avulsa sem parcelas acadêmicas, PDV vazio, busca/seleção do pagador, geração bloqueada até preencher os campos e novo atendimento limpo. Nenhuma cobrança real foi emitida; liquidação bancária ponta a ponta permanece não exercitada.
