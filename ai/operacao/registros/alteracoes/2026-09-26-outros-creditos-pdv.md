# Outros Créditos: polo válido e recebimento na tela

Estado: VALIDADO PARA PUBLICAÇÃO — produção solicitada pelo usuário na conversa.
Versão: 4.8.98 / revisão 107.

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

Pacote recomposto localmente sobre `dc5348cef91e37a99789ac7f8ae61e4e484bf96a` após as versões 4.8.96 e 4.8.97 da Secretaria chegarem ao main. A versão deste lote é 4.8.98 / revisão 107. O histórico e os registros dos lotes paralelos são preservados; os corpos das migrations aplicadas permanecem inalterados. Smoke e revisão do escopo ampliado concluídos; publicação autorizada.
