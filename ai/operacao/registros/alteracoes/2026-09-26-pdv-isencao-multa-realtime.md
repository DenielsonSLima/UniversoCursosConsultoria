# PDV: isenção Banese, Realtime e preenchimento

Estado: VALIDADO LOCALMENTE — publicação em andamento.

## Causa e escopo

- O parser rejeitava TipoMulta=3, documentado como isento no manual oficial Banese (páginas 18–19 do PDF, versão 1.6). A resposta real apresentou tipo 3, valor e data nulos.
- A criação ficava API_AMBIGUOUS após o POST. Corrigida a leitura sem repetir emissão; consulta recuperou uma única transação e boleto registrado para o atendimento afetado.
- O GET observado não trouxe candidato Pix. Não houve QR fabricado, baixa ou reemissão; recuperação do Pix desse título continua pendente.
- Query do modal não continha polo e não era invalidada pelo filtro de Realtime do módulo. Assinatura agora escopa entity_id da cobrança e releitura na reconexão.
- Formulário recebe máscara monetária, data civil local editável, documento mascarado e cadastro inline de categoria com botões não submetentes.

## Aceite e validação

- 36 testes Deno de termos/adapter/reconciliação, 29 testes UI/serviço/Caixa; TypeScript e ESLint focado aprovados.
- Backend aplicado pelo MCP: asaas-api v100, payment-gateway-api v34 e banese-reconciliation-worker v102, preservando bundles remotos e alterando somente o parser.
- Valores e estados financeiros continuam canônicos no servidor. Nenhuma cobrança emitida pelo agente.
- Smoke Safari local confirmou máscara durante digitação (123456 → 1.234,56) e vencimento inicial de hoje. A sessão remota ficou indisponível antes da conferência final de categoria e produção; pendência registrada.
- Usuário autorizou cancelar e substituir especificamente o título avulso afetado se GET não recuperar Pix; operação ainda não executada, condicionada à confirmação bancária de ausência de pagamento e cancelamento.

## Manifesto explícito

Total: 18 arquivos

- `modules/gestor/financeiro/outros-creditos/PdvPartnerSearch.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPdvModal.tsx`
- `modules/gestor/financeiro/outros-creditos/useOutrosCreditos.ts`
- `modules/gestor/financeiro/outros-creditos/outros-creditos.presentation.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-pdv.test.tsx`
- `modules/gestor/financeiro/outros-creditos/useOtherCreditPayment.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-payment.service.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPaymentModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPaymentContent.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-payment.test.tsx`
- `modules/gestor/financeiro/despesas/components/CategoriaFinanceiraInlineModal.tsx`
- `supabase/functions/banese/internal/financial-terms-response.ts`
- `supabase/functions/banese/internal/financial-terms-response.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-26-pdv-isencao-multa-realtime.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
