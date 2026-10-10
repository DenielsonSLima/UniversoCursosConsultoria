import type { ContasReceber } from '../../../../../../financeiro/financeiro.types';
import { mapReceivableFinancialComposition } from '../../../../../../financeiro/financeiro.composition-presentation';
import { mapReceivableIssuance } from '../../../../../../financeiro/financeiro.receivable-issuance';
import { parseProescReceivableEvidence } from '../../../../../../financeiro/financeiro.proesc-evidence';

export interface AlunoExtratoRecebivel extends ContasReceber {
  id: string;
}

const optionalAmount = (value: unknown): number | undefined => (
  value == null ? undefined : Number(value)
);

// The statement presents the same stored title as Contas a Receber. Gateway
// fields are normalized to the shared presentation contract, including legacy
// Asaas titles; no payment or issuance state is inferred from a missing field.
export const mapAlunoExtratoRecebivel = (
  item: Record<string, any>,
  context: { poloId: string; matriculaId: string },
): AlunoExtratoRecebivel => ({
  id: item.id,
  poloId: context.poloId,
  matriculaId: context.matriculaId,
  categoria: item.categoria || 'MENSALIDADE',
  descricao: item.descricao,
  valor: Number(item.valor || 0),
  valorPago: optionalAmount(item.valor_pago),
  ...mapReceivableFinancialComposition(item),
  ...mapReceivableIssuance(item),
  proescEvidence: parseProescReceivableEvidence(item.proesc_evidence),
  dataVencimento: item.data_vencimento,
  dataEmissao: item.data_emissao || undefined,
  dataPagamento: item.data_pagamento || undefined,
  status: item.status,
  formaPagamento: item.forma_pagamento || undefined,
  origemPagamento: item.origem_pagamento || undefined,
  tipoLancamento: item.tipo_lancamento || undefined,
  parcelaNumero: optionalAmount(item.parcela_numero),
  gatewayProvider: item.gateway_provider || undefined,
  gatewayPaymentMethod: item.gateway_payment_method || undefined,
  gatewaySettlementChannel: item.gateway_settlement_channel || undefined,
  gatewaySettlementSource: item.gateway_settlement_source || undefined,
  asaasStatus: item.gateway_status || item.asaas_status || undefined,
  asaasInvoiceUrl: item.gateway_invoice_url || item.asaas_invoice_url || undefined,
  asaasBankSlipUrl: item.gateway_bank_slip_url || item.asaas_bank_slip_url || undefined,
  asaasPaymentId: item.gateway_payment_id || item.asaas_payment_id || undefined,
  asaasLastError: item.gateway_last_error || item.asaas_last_error || undefined,
  boletoNossoNumero: item.boleto_nosso_numero || undefined,
  boletoDescontoConfigurado: optionalAmount(item.boleto_desconto_configurado),
  boletoDescontoValidoAte: item.boleto_desconto_valido_ate || undefined,
  boletoDescontoSituacao: item.boleto_desconto_situacao || undefined,
  createdAt: item.created_at || undefined,
});
