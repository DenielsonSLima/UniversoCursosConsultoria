import { supabase } from '../../../lib/supabase';
import { asaasIntegrationService } from '../../asaas/asaas.service';
import type { ContasReceber, ReceivablesSummary, ReceivablesSummaryFilters } from './financeiro.types';

const mapReceivablesSummary = (row: any = {}): ReceivablesSummary => ({
  pendingCount: Number(row.pending_count || 0),
  receivedCount: Number(row.received_count || 0),
  canceledCount: Number(row.canceled_count || 0),
  overdueCount: Number(row.overdue_count || 0),
  allCount: Number(row.all_count || 0),
  pendingValue: Number(row.pending_value || 0),
  receivedValue: Number(row.received_value || 0),
  canceledValue: Number(row.canceled_value || 0),
  overdueValue: Number(row.overdue_value || 0),
  allValue: Number(row.all_value || 0),
});

const mapReceivableRpcRow = (row: any): ContasReceber => ({
  id: row.id,
  poloId: row.polo_id,
  poloNome: row.polo_nome || '',
  poloCnpj: row.polo_cnpj || '',
  poloCidade: row.polo_cidade || '',
  poloUf: row.polo_uf || '',
  descricao: row.descricao,
  valor: Number(row.valor || 0),
  dataVencimento: row.data_vencimento,
  dataEmissao: row.data_emissao || undefined,
  dataPagamento: row.data_pagamento || undefined,
  valorPago: row.valor_pago === null || row.valor_pago === undefined ? undefined : Number(row.valor_pago),
  status: row.status,
  categoria: row.categoria,
  categoriaFinanceiraId: row.categoria_financeira_id || undefined,
  categoriaFinanceiraNome: row.categoria_financeira_nome || undefined,
  clienteId: row.cliente_id || undefined,
  clienteNome: row.cliente_nome || 'Aluno',
  clienteCpfCnpj: row.cliente_cpf_cnpj || '',
  clienteTelefone: row.cliente_telefone || '',
  matriculaId: row.matricula_id || undefined,
  turmaId: row.turma_id || undefined,
  turmaNome: row.turma_nome || '',
  cursoNome: row.curso_nome || '',
  cursoModalidade: row.curso_modalidade || '',
  formaPagamento: row.forma_pagamento || undefined,
  origemPagamento: row.origem_pagamento || undefined,
  gatewayProvider: row.gateway_provider || undefined,
  gatewayPaymentMethod: row.gateway_payment_method || undefined,
  gatewaySettlementChannel: row.gateway_settlement_channel || undefined,
  gatewaySettlementSource: row.gateway_settlement_source || undefined,
  contaBancariaId: row.conta_bancaria_id || undefined,
  nossoNumeroAsaas: row.nosso_numero_asaas || undefined,
  asaasPaymentId: row.asaas_payment_id || undefined,
  asaasPaymentLinkId: row.asaas_payment_link_id || undefined,
  asaasInvoiceUrl: row.asaas_invoice_url || undefined,
  asaasBankSlipUrl: row.asaas_bank_slip_url || undefined,
  asaasInstallmentId: row.asaas_installment_id || undefined,
  asaasTransactionReceiptUrl: row.asaas_transaction_receipt_url || undefined,
  asaasStatus: row.asaas_status || undefined,
  asaasLastError: row.asaas_last_error || undefined,
  taxa: row.taxa === null || row.taxa === undefined ? undefined : Number(row.taxa),
  valorLiquido: row.valor_liquido === null || row.valor_liquido === undefined ? undefined : Number(row.valor_liquido),
  descontoAplicado: row.desconto_aplicado === null || row.desconto_aplicado === undefined
    ? undefined : Number(row.desconto_aplicado),
  jurosAplicados: row.juros_aplicados === null || row.juros_aplicados === undefined
    ? undefined : Number(row.juros_aplicados),
  multaAplicada: row.multa_aplicada === null || row.multa_aplicada === undefined
    ? undefined : Number(row.multa_aplicada),
  createdAt: row.created_at || undefined,
  tipoLancamento: row.tipo_lancamento || undefined,
  parcelaNumero: row.parcela_numero === null || row.parcela_numero === undefined
    ? undefined : Number(row.parcela_numero),
  origemCronogramaId: row.origem_cronograma_id || undefined,
});

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
    params: { recreateAsaas?: boolean; reason?: string } = {},
  ): Promise<{
    success: boolean;
    receivable: any;
    asaasRecreated?: boolean;
    baneseRecreated?: boolean;
    gatewayRecreated?: boolean;
    gatewayProvider?: string | null;
    requiresDependencyCheckout?: boolean;
  }> {
    return asaasIntegrationService.reverseInPersonSettlement(id, params);
  },

  async deleteReceivable(id: string): Promise<void> {
    const { error } = await supabase.from('contas_receber').delete().eq('id', id);
    if (error) {
      console.error('Erro ao deletar conta a receber:', error);
      throw error;
    }
  },
};
