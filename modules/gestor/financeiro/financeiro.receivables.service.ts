import { supabase } from '../../../lib/supabase';
import { asaasIntegrationService } from '../../asaas/asaas.service';
import type { ContasReceber, ReceivablesSummary, ReceivablesSummaryFilters } from './financeiro.types';
import { mapReceivableRpcRow, mapReceivablesSummary } from './financeiro.receivables-mappers';
import { mapReceivableIssuance } from './financeiro.receivable-issuance';
import { reverseSettlementWithLocalGuard, type ReversalOptions } from './financeiro.local-enrollment-reversal';

const mapReceivable = (cr: any): ContasReceber => ({
  id: cr.id,
  poloId: cr.polo_id,
  poloNome: cr.polos?.nome || '',
  poloCnpj: cr.polos?.cnpj || '',
  poloCidade: cr.polos?.cidade || '',
  poloUf: cr.polos?.estado || '',
  descricao: cr.descricao,
  valor: Number(cr.valor),
  dataVencimento: cr.data_vencimento,
  dataPagamento: cr.data_pagamento,
  valorPago: cr.valor_pago === null || cr.valor_pago === undefined ? undefined : Number(cr.valor_pago),
  status: cr.status,
  categoria: cr.categoria,
  categoriaFinanceiraId: cr.categoria_financeira_id || undefined,
  categoriaFinanceiraNome: cr.categorias_financeiras?.nome || undefined,
  clienteId: cr.cliente_id,
  clienteNome: cr.parceiros?.nome || 'Aluno',
  clienteCpfCnpj: cr.parceiros?.cpf_cnpj || '',
  clienteTelefone: cr.parceiros?.telefone || '',
  matriculaId: cr.matricula_id,
  turmaId: cr.turma_id,
  turmaNome: cr.turmas?.nome || '',
  cursoNome: cr.turmas?.cursos?.nome || '',
  cursoModalidade: cr.turmas?.cursos?.modalidade || '',
  formaPagamento: cr.forma_pagamento,
  origemPagamento: cr.origem_pagamento,
  ...mapReceivableIssuance(cr),
  manualSettlementId: cr.manual_settlement_id || undefined,
  gatewayProvider: cr.gateway_provider,
  contaBancariaId: cr.conta_bancaria_id,
  nossoNumeroAsaas: cr.nosso_numero_asaas,
  asaasPaymentId: cr.asaas_payment_id || cr.gateway_payment_id,
  asaasPaymentLinkId: cr.asaas_payment_link_id || cr.gateway_payment_link_id,
  asaasInvoiceUrl: cr.asaas_invoice_url || cr.gateway_invoice_url,
  asaasBankSlipUrl: cr.asaas_bank_slip_url || cr.gateway_bank_slip_url,
  asaasInstallmentId: cr.asaas_installment_id || cr.gateway_installment_id,
  asaasTransactionReceiptUrl: cr.asaas_transaction_receipt_url || cr.gateway_transaction_receipt_url,
  asaasStatus: cr.asaas_status || cr.gateway_status,
  asaasLastError: cr.asaas_last_error || cr.gateway_last_error,
  createdAt: cr.created_at,
  tipoLancamento: cr.tipo_lancamento,
  outrosCreditosPlanoId: cr.outros_creditos_plano_id || undefined,
  outrosCreditosPapel: cr.outros_creditos_papel || undefined,
  parcelaNumero: cr.parcela_numero,
  origemCronogramaId: cr.origem_cronograma_id,
  taxa: (cr.asaas_fee_value ?? cr.gateway_fee_value) == null ? undefined
    : Number(cr.asaas_fee_value ?? cr.gateway_fee_value),
  valorLiquido: (cr.asaas_net_value ?? cr.gateway_net_value) == null ? undefined
    : Number(cr.asaas_net_value ?? cr.gateway_net_value),
});

const getReceivablesByModality = async (
  modality: 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO',
  poloId?: string,
): Promise<ContasReceber[]> => {
  let query = supabase
    .from('contas_receber')
    .select(`
      *, parceiros(nome, cpf_cnpj, telefone),
      polos!contas_receber_polo_id_fkey(nome, cnpj, cidade, estado),
      turmas!inner(nome, codigo, cursos!inner(nome, modalidade))
    `)
    .eq('categoria', 'MENSALIDADE')
    .eq('turmas.cursos.modalidade', modality);

  if (poloId && poloId !== 'todos') query = query.eq('polo_id', poloId);

  const { data, error } = await query.order('data_vencimento', { ascending: true });
  if (error) {
    console.error(`Erro ao buscar recebíveis da modalidade ${modality}:`, error);
    throw error;
  }
  return (data || []).map(mapReceivable);
};

export const financeiroReceivablesServiceMethods = {
  async getContasReceber(filters?: { poloId?: string; status?: string; categoria?: string }): Promise<ContasReceber[]> {
    let query = supabase.from('contas_receber').select(`
      *, parceiros(nome, cpf_cnpj, telefone), categorias_financeiras(nome),
      polos!contas_receber_polo_id_fkey(nome, cnpj, cidade, estado),
      turmas(nome, codigo, cursos(nome, modalidade))
    `);

    if (filters?.poloId && filters.poloId !== 'todos') query = query.eq('polo_id', filters.poloId);
    if (filters?.status && filters.status !== 'todos') query = query.eq('status', filters.status);
    if (filters?.categoria && filters.categoria !== 'todos') query = query.eq('categoria', filters.categoria);

    const { data, error } = await query.order('data_vencimento', { ascending: true });
    if (error) {
      console.error('Erro ao buscar contas a receber:', error);
      throw error;
    }
    return (data || []).map((cr: any) => mapReceivable({
      ...cr,
      parceiros: cr.parceiros || { nome: 'Cliente Geral' },
    }));
  },

  getReceivablesByModality,

  async getTechnicalReceivables(poloId?: string): Promise<ContasReceber[]> {
    return getReceivablesByModality('TECNICO', poloId);
  },

  async createReceivable(cr: Omit<ContasReceber, 'id'>): Promise<void> {
    const { error } = await supabase.from('contas_receber').insert({
      polo_id: cr.poloId,
      descricao: cr.descricao,
      valor: cr.valor,
      data_vencimento: cr.dataVencimento,
      status: cr.status || 'PENDENTE',
      categoria: cr.categoria,
      cliente_id: cr.clienteId || null,
      matricula_id: cr.matriculaId || null,
      turma_id: cr.turmaId || null,
      forma_pagamento: cr.formaPagamento || null,
      conta_bancaria_id: cr.contaBancariaId || null,
      nosso_numero_asaas: cr.nossoNumeroAsaas || null,
    });
    if (error) {
      console.error('Erro ao criar conta a receber:', error);
      throw error;
    }
  },

  async getOutrosCreditos(poloId?: string): Promise<ContasReceber[]> {
    const { data, error } = await supabase.rpc('listar_outros_creditos_secure', {
      p_polo_id: poloId && poloId !== 'todos' ? poloId : null,
    });
    if (error) {
      console.error('Erro ao buscar outros créditos:', error);
      throw error;
    }

    let payload: unknown = data;
    if (typeof data === 'string') {
      try { payload = JSON.parse(data); } catch { payload = []; }
    }
    return (Array.isArray(payload) ? payload : []).map(mapReceivableRpcRow);
  },

  async getOutrosCreditosSummary(filters: ReceivablesSummaryFilters = {}): Promise<ReceivablesSummary> {
    const { data, error } = await supabase.rpc('get_outros_creditos_summary', {
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_search: filters.search?.trim() || null,
      p_due_start: filters.dueStart || null,
      p_due_end: filters.dueEnd || null,
      p_categoria_id: filters.categoryId || null,
    });
    if (error) {
      console.error('Erro ao buscar resumo de outros créditos:', error);
      throw error;
    }
    return mapReceivablesSummary(data?.[0]);
  },

  async createOtherCredit(input: {
    idempotencyKey: string;
    poloId: string;
    descricao: string;
    valor: number;
    dataVencimento: string;
    clienteId?: string;
    categoriaFinanceiraId?: string;
    formaPagamento?: 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';
    contaBancariaId?: string;
    mode: 'LOCAL_PAGO' | 'LOCAL_RECEBER' | 'GATEWAY';
  }): Promise<ContasReceber> {
    const { receivable: data } = await asaasIntegrationService.createOtherCredit(input);
    return {
      ...mapReceivable({
        ...data,
        polos: {},
        parceiros: { nome: 'Cliente Geral' },
        turmas: {},
      }),
      clienteNome: 'Cliente Geral',
    };
  },

  async markReceivablePaid(
    id: string,
    params: {
      idempotencyKey: string;
      contaBancariaId: string;
      valorPago: number | string;
      valorJuros?: number | string;
      valorMulta?: number | string;
      valorDesconto?: number | string;
      valorAcrescimo?: number | string;
      dataPagamento: string;
      formaPagamento: 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';
    },
  ): Promise<{
    success: boolean;
    asaasCanceled?: boolean;
    asaasPaymentLinkCanceled?: boolean;
    asaasPaymentId?: string;
    baneseCanceled?: boolean;
    gatewayCanceled?: boolean;
    gatewayProvider?: string | null;
    gatewayPaymentId?: string | null;
    futureSyncWarning?: string | null;
    settlementId?: string;
    replayed?: boolean;
  }> {
    return asaasIntegrationService.settleInPerson(id, params);
  },

  async reverseManualSettlement(
    id: string,
    params: ReversalOptions = {},
  ): Promise<{
    success: boolean;
    receivable: any;
    asaasRecreated?: boolean;
    baneseRecreated?: boolean;
    gatewayRecreated?: boolean;
    gatewayProvider?: string | null;
    requiresDependencyCheckout?: boolean;
  }> {
    return reverseSettlementWithLocalGuard(id, params, {
      reverseLocal: (input) => supabase.rpc('estornar_matricula_local_sem_boleto_secure', input),
      reverseLegacy: (receivableId, options) => asaasIntegrationService.reverseInPersonSettlement(receivableId, options),
    });
  },

  async deleteReceivable(id: string): Promise<void> {
    const { error } = await supabase.from('contas_receber').delete().eq('id', id);
    if (error) {
      console.error('Erro ao deletar conta a receber:', error);
      throw error;
    }
  },
};
