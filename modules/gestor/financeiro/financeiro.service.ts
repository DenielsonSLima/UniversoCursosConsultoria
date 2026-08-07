// File: modules/gestor/financeiro/financeiro.service.ts

import { supabase } from '../../../lib/supabase';
import { asaasIntegrationService } from '../../asaas/asaas.service';

export interface ContaBancaria {
  id?: string;
  banco: string;
  titular: string;
  agencia: string;
  conta: string;
  tipo: string;
  natureza?: 'BANCARIA' | 'CAIXA_INTERNO';
  poloId: string;
  poloNome?: string;
  poloCnpj?: string;
  poloCidade?: string;
  poloUf?: string;
  polosUso: string[];
  saldoInicial: number;
  dataSaldo?: string;
  ativo?: boolean;
  saldoAtual?: number;
  saldoContabilConta?: number;
  saldoGerencialPolo?: number;
  compartilhada?: boolean;
  recebido?: number;
  pago?: number;
}

export interface FinanceiroPolo {
  id: string;
  nome: string;
  cnpj: string | null;
  cidade: string | null;
  estado: string | null;
  uf?: string | null;
  is_matriz: boolean;
}

export const isContaDisponivelNoPolo = (
  account: ContaBancaria,
  poloId?: string | null,
) => (
  !poloId
  || poloId === 'todos'
  || account.polosUso.includes(poloId)
);

export interface ContasReceber {
  id?: string;
  poloId: string;
  poloNome?: string;
  poloCnpj?: string;
  poloCidade?: string;
  poloUf?: string;
  descricao: string;
  valor: number;
  dataVencimento: string;
  dataEmissao?: string;
  dataPagamento?: string;
  valorPago?: number;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'SUSPENSO' | 'ESTORNADO' | 'CANCELADO' | 'DEVOLVIDO';
  categoria: 'MENSALIDADE' | 'OUTROS_CREDITOS' | 'ADIANTAMENTO_TOMADO';
  categoriaFinanceiraId?: string;
  categoriaFinanceiraNome?: string;
  clienteId?: string;
  clienteNome?: string;
  clienteCpfCnpj?: string;
  clienteTelefone?: string;
  matriculaId?: string;
  turmaId?: string;
  formaPagamento?: 'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO';
  origemPagamento?: string;
  gatewayProvider?: string;
  gatewayPaymentMethod?: string;
  gatewaySettlementChannel?: 'PIX' | 'BOLETO' | 'NAO_IDENTIFICADO' | 'MISTO';
  gatewaySettlementSource?: 'API' | 'CNAB240' | 'MANUAL';
  contaBancariaId?: string;
  nossoNumeroAsaas?: string;
  asaasPaymentId?: string;
  asaasPaymentLinkId?: string;
  asaasInvoiceUrl?: string;
  asaasBankSlipUrl?: string;
  asaasInstallmentId?: string;
  asaasTransactionReceiptUrl?: string;
  asaasStatus?: string;
  asaasLastError?: string;
  taxa?: number;
  valorLiquido?: number;
  descontoAplicado?: number;
  jurosAplicados?: number;
  multaAplicada?: number;
  createdAt?: string;
  tipoLancamento?: 'MATRICULA' | 'PARCELA' | 'REMATRICULA' | 'DEPENDENCIA';
  parcelaNumero?: number;
  origemCronogramaId?: string;
  turmaNome?: string;
  cursoNome?: string;
  cursoModalidade?: string;
}

export interface ContasPagar {
  id?: string;
  poloId: string;
  poloNome?: string;
  descricao: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  valorPago?: number;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'ESTORNADO' | 'CANCELADO';
  categoria: 'DESPESA_VARIAVEL' | 'DESPESA_ADMINISTRATIVA' | 'OUTRAS_DESPESAS' | 'ADIANTAMENTO_CEDIDO' | 'EMPRESTIMO';
  fornecedorId?: string;
  fornecedorNome?: string;
  formaPagamento?: 'BOLETO' | 'PIX' | 'TED' | 'DINHEIRO';
  contaBancariaId?: string;
  createdAt?: string;
}

export interface TransferenciaConta {
  id?: string;
  poloId: string;
  poloNome?: string;
  poloCnpj?: string;
  poloCidade?: string;
  poloUf?: string;
  contaOrigemId: string;
  contaOrigemNome?: string;
  contaOrigemBanco?: string;
  contaOrigemTitular?: string;
  contaOrigemAgencia?: string;
  contaOrigemConta?: string;
  poloDestinoId: string;
  poloDestinoNome?: string;
  poloDestinoCnpj?: string;
  poloDestinoCidade?: string;
  poloDestinoUf?: string;
  contaDestinoId: string;
  contaDestinoNome?: string;
  contaDestinoBanco?: string;
  contaDestinoTitular?: string;
  contaDestinoAgencia?: string;
  contaDestinoConta?: string;
  valor: number;
  dataTransferencia: string;
  observacao?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TransferenciasFilters {
  poloId?: string | null;
  search?: string;
  contaOrigemId?: string;
  contaDestinoId?: string;
  dataInicio?: string;
  dataFim?: string;
  mesAtual?: boolean;
}

export interface TransferenciasSummary {
  totalValue: number;
  totalCount: number;
}

export interface TransferenciaInput {
  requestId: string;
  poloOrigemId: string;
  contaOrigemId: string;
  poloDestinoId: string;
  contaDestinoId: string;
  valor: number;
  dataTransferencia: string;
  observacao?: string;
}

export interface FluxoMensal {
  mes: string;
  ano: number;
  mesNome: string;
  creditos: number;
  debitos: number;
  atrasoReceber: number;
  atrasoPagar: number;
}

export interface FinanceiroSummary {
  totalRecebido: number;
  totalAReceber: number;
  totalPago: number;
  totalAPagar: number;
  saldoCaixa: number;
}

export interface ReceivablesSummary {
  pendingCount: number;
  receivedCount: number;
  canceledCount: number;
  allCount: number;
  pendingValue: number;
  receivedValue: number;
  canceledValue: number;
  overdueCount: number;
  overdueValue: number;
  allValue: number;
}

export interface ReceivablesSummaryFilters {
  poloId?: string;
  search?: string;
  dueStart?: string;
  dueEnd?: string;
  categoryId?: string;
}

export type ReceivablesStatusScope = 'pending' | 'received' | 'canceled' | 'all';
export type ReceivablesGroupMode = 'none' | 'student' | 'class' | 'polo';

export interface ReceivablesPageFilters extends ReceivablesSummaryFilters {
  statusScope: ReceivablesStatusScope;
  groupMode: ReceivablesGroupMode;
  page: number;
  pageSize: number;
  groupKey?: string;
}

export interface ReceivablesPage {
  rows: ContasReceber[];
  totalItems: number;
  page: number;
  pageSize: number;
}

export interface ReceivablesGroupSummary {
  key: string;
  label: string;
  itemCount: number;
  pendingCount: number;
  receivedCount: number;
  canceledCount: number;
  nextDue: string;
  first: ContasReceber;
}

export interface ReceivablesGroupsPage {
  groups: ReceivablesGroupSummary[];
  totalItems: number;
  totalReceivables: number;
  page: number;
  pageSize: number;
}

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
    ? undefined
    : Number(row.desconto_aplicado),
  jurosAplicados: row.juros_aplicados === null || row.juros_aplicados === undefined
    ? undefined
    : Number(row.juros_aplicados),
  multaAplicada: row.multa_aplicada === null || row.multa_aplicada === undefined
    ? undefined
    : Number(row.multa_aplicada),
  createdAt: row.created_at || undefined,
  tipoLancamento: row.tipo_lancamento || undefined,
  parcelaNumero: row.parcela_numero === null || row.parcela_numero === undefined ? undefined : Number(row.parcela_numero),
  origemCronogramaId: row.origem_cronograma_id || undefined,
});

export const financeiroService = {
  // 1. Bancos & Saldos (Sem criação de conta aqui - agora é em configurações)
  async getContasBancariasSaldos(poloId?: string | null): Promise<ContaBancaria[]> {
    const { data, error } = poloId && poloId !== 'todos'
      ? await supabase.rpc('get_contas_bancarias_para_polo_secure', {
          p_polo_id: poloId,
        })
      : await supabase.rpc('get_contas_bancarias_saldos');
    if (error) {
      console.error('Erro ao buscar contas bancárias e saldos:', error);
      throw error;
    }
    return (data || []).map((cb: any) => ({
      id: cb.id,
      banco: cb.banco,
      titular: cb.titular,
      agencia: cb.agencia,
      conta: cb.conta,
      tipo: cb.tipo,
      natureza: cb.natureza || 'BANCARIA',
      poloId: cb.polo_id,
      poloNome: cb.polo_name || cb.polo_nome || '',
      poloCnpj: cb.polo_cnpj || '',
      poloCidade: cb.polo_cidade || '',
      poloUf: cb.polo_uf || '',
      polosUso: Array.isArray(cb.polos_uso) ? cb.polos_uso : [cb.polo_id].filter(Boolean),
      saldoInicial: Number(cb.saldo_inicial),
      saldoAtual: Number(cb.saldo_atual),
      saldoContabilConta: Number(cb.saldo_contabil_conta ?? cb.saldo_atual ?? 0),
      saldoGerencialPolo: cb.saldo_gerencial_polo === undefined
        ? undefined
        : Number(cb.saldo_gerencial_polo || 0),
      compartilhada: cb.compartilhada === true
        || (Array.isArray(cb.polos_uso) && cb.polos_uso.length > 1),
      recebido: Number(cb.recebido),
      pago: Number(cb.pago),
      ativo: cb.ativo
    }));
  },

  // 2. Resumos Financeiros & Consolidação de 3 Meses
  async getFinanceiroSummary(
    poloId?: string,
    dataInicio?: string,
    dataFim?: string
  ): Promise<FinanceiroSummary> {
    const { data, error } = await supabase.rpc('get_financeiro_summary', {
      p_polo_id: poloId || null,
      p_data_inicio: dataInicio || '1970-01-01',
      p_data_fim: dataFim || '2999-12-31'
    });
    if (error) {
      console.error('Erro ao obter resumo financeiro:', error);
      throw error;
    }
    const res = data?.[0] || {};
    return {
      totalRecebido: Number(res.total_recebido || 0),
      totalAReceber: Number(res.total_a_receber || 0),
      totalPago: Number(res.total_pago || 0),
      totalAPagar: Number(res.total_a_pagar || 0),
      saldoCaixa: Number(res.saldo_caixa || 0)
    };
  },

  async getFluxoConsolidado3Meses(poloId?: string): Promise<FluxoMensal[]> {
    const { data, error } = await supabase.rpc('get_fluxo_consolidado_3_meses', {
      p_polo_id: poloId || null
    });
    if (error) {
      console.error('Erro ao obter fluxo consolidado de 3 meses:', error);
      throw error;
    }
    return (data || []).map((row: any) => ({
      mes: row.mes,
      ano: Number(row.ano),
      mesNome: row.mes_nome,
      creditos: Number(row.creditos || 0),
      debitos: Number(row.debitos || 0),
      atrasoReceber: Number(row.atraso_receber || 0),
      atrasoPagar: Number(row.atraso_pagar || 0)
    }));
  },

  // 3. Contas a Receber (Receitas)
  async getContasReceber(filters?: { poloId?: string; status?: string; categoria?: string }): Promise<ContasReceber[]> {
    let query = supabase
      .from('contas_receber')
      .select(`
        *,
        parceiros(nome, cpf_cnpj, telefone),
        categorias_financeiras(nome),
        polos!contas_receber_polo_id_fkey(nome, cnpj, cidade, estado),
        turmas(
          nome,
          codigo,
          cursos(nome, modalidade)
        )
      `);

    if (filters?.poloId && filters.poloId !== 'todos') {
      query = query.eq('polo_id', filters.poloId);
    }
    if (filters?.status && filters.status !== 'todos') {
      query = query.eq('status', filters.status);
    }
    if (filters?.categoria && filters.categoria !== 'todos') {
      query = query.eq('categoria', filters.categoria);
    }

    const { data, error } = await query.order('data_vencimento', { ascending: true });
    if (error) {
      console.error('Erro ao buscar contas a receber:', error);
      throw error;
    }

    return (data || []).map((cr: any) => ({
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
      valorPago: cr.valor_pago ? Number(cr.valor_pago) : undefined,
      status: cr.status,
      categoria: cr.categoria,
      categoriaFinanceiraId: cr.categoria_financeira_id || undefined,
      categoriaFinanceiraNome: cr.categorias_financeiras?.nome || undefined,
      clienteId: cr.cliente_id,
      clienteNome: cr.parceiros?.nome || 'Cliente Geral',
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
      taxa: (cr.asaas_fee_value ?? cr.gateway_fee_value) !== undefined && (cr.asaas_fee_value ?? cr.gateway_fee_value) !== null ? Number(cr.asaas_fee_value ?? cr.gateway_fee_value) : undefined,
      valorLiquido: (cr.asaas_net_value ?? cr.gateway_net_value) !== undefined && (cr.asaas_net_value ?? cr.gateway_net_value) !== null ? Number(cr.asaas_net_value ?? cr.gateway_net_value) : undefined,
    }));
  },

  async getReceivablesByModality(
    modality: 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO',
    poloId?: string
  ): Promise<ContasReceber[]> {
    let query = supabase
      .from('contas_receber')
        .select(`
        *,
        parceiros(nome, cpf_cnpj, telefone),
        polos!contas_receber_polo_id_fkey(nome, cnpj, cidade, estado),
        turmas!inner(
          nome,
          codigo,
          cursos!inner(nome, modalidade)
        )
      `)
      .eq('categoria', 'MENSALIDADE')
      .eq('turmas.cursos.modalidade', modality);

    if (poloId && poloId !== 'todos') {
      query = query.eq('polo_id', poloId);
    }

    const { data, error } = await query.order('data_vencimento', { ascending: true });

    if (error) {
      console.error(`Erro ao buscar recebíveis da modalidade ${modality}:`, error);
      throw error;
    }

    return (data || []).map((cr: any) => ({
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
      valorPago: cr.valor_pago === null ? undefined : Number(cr.valor_pago),
      status: cr.status,
      categoria: cr.categoria,
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
      taxa: (cr.asaas_fee_value ?? cr.gateway_fee_value) !== undefined && (cr.asaas_fee_value ?? cr.gateway_fee_value) !== null ? Number(cr.asaas_fee_value ?? cr.gateway_fee_value) : undefined,
      valorLiquido: (cr.asaas_net_value ?? cr.gateway_net_value) !== undefined && (cr.asaas_net_value ?? cr.gateway_net_value) !== null ? Number(cr.asaas_net_value ?? cr.gateway_net_value) : undefined,
      tipoLancamento: cr.tipo_lancamento,
      parcelaNumero: cr.parcela_numero,
      origemCronogramaId: cr.origem_cronograma_id,
      createdAt: cr.created_at,
    }));
  },

  async getTechnicalReceivables(poloId?: string): Promise<ContasReceber[]> {
    return this.getReceivablesByModality('TECNICO', poloId);
  },

  async getReceivablesPageByModality(
    modality: 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO',
    filters: ReceivablesPageFilters,
  ): Promise<ReceivablesPage> {
    const { data, error } = await supabase.rpc('get_receivables_modality_page_secure', {
      p_modality: modality,
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_search: filters.search?.trim() || null,
      p_due_start: filters.dueStart || null,
      p_due_end: filters.dueEnd || null,
      p_status_scope: filters.statusScope,
      p_group_mode: filters.groupMode,
      p_group_key: filters.groupKey || null,
      p_page: filters.page,
      p_page_size: filters.pageSize,
    });

    if (error) {
      console.error(`Erro ao buscar página de recebíveis da modalidade ${modality}:`, error);
      throw error;
    }

    const payload: any = Array.isArray(data) ? data[0] : data || {};
    return {
      rows: (payload.rows || []).map(mapReceivableRpcRow),
      totalItems: Number(payload.total_items || 0),
      page: Number(payload.page || filters.page),
      pageSize: Number(payload.page_size || filters.pageSize),
    };
  },

  async getReceivablesGroupsPageByModality(
    modality: 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO',
    filters: ReceivablesPageFilters,
  ): Promise<ReceivablesGroupsPage> {
    const { data, error } = await supabase.rpc('get_receivables_modality_groups_page_secure', {
      p_modality: modality,
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_search: filters.search?.trim() || null,
      p_due_start: filters.dueStart || null,
      p_due_end: filters.dueEnd || null,
      p_status_scope: filters.statusScope,
      p_group_mode: filters.groupMode,
      p_page: filters.page,
      p_page_size: filters.pageSize,
    });

    if (error) {
      console.error(`Erro ao buscar grupos de recebíveis da modalidade ${modality}:`, error);
      throw error;
    }

    const payload: any = Array.isArray(data) ? data[0] : data || {};
    return {
      groups: (payload.groups || []).map((group: any) => ({
        key: String(group.key),
        label: group.label || 'Não informado',
        itemCount: Number(group.item_count || 0),
        pendingCount: Number(group.pending_count || 0),
        receivedCount: Number(group.received_count || 0),
        canceledCount: Number(group.canceled_count || 0),
        nextDue: group.next_due || '',
        first: mapReceivableRpcRow(group.first_row || {}),
      })),
      totalItems: Number(payload.total_items || 0),
      totalReceivables: Number(payload.total_receivables || 0),
      page: Number(payload.page || filters.page),
      pageSize: Number(payload.page_size || filters.pageSize),
    };
  },

  async getReceivablesExportByModality(
    modality: 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO',
    filters: Omit<ReceivablesPageFilters, 'page' | 'pageSize' | 'groupMode' | 'groupKey'>,
  ): Promise<ContasReceber[]> {
    const rows: ContasReceber[] = [];
    const pageSize = 500;
    let page = 1;

    while (true) {
      const result = await this.getReceivablesPageByModality(modality, {
        ...filters,
        groupMode: 'none',
        page,
        pageSize,
      });
      rows.push(...result.rows);
      if (rows.length >= result.totalItems) break;
      page += 1;
    }

    return rows;
  },

  async getReceivablesModalitySummary(
    modality: 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO',
    filters: ReceivablesSummaryFilters = {}
  ): Promise<ReceivablesSummary> {
    const { data, error } = await supabase.rpc('get_receivables_modality_summary_v2_secure', {
      p_modality: modality,
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_search: filters.search?.trim() || null,
      p_due_start: filters.dueStart || null,
      p_due_end: filters.dueEnd || null,
    });

    if (error) {
      console.error(`Erro ao buscar resumo de recebíveis da modalidade ${modality}:`, error);
      throw error;
    }

    const payload = Array.isArray(data) ? data[0] : data;
    return mapReceivablesSummary(payload);
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
      nosso_numero_asaas: cr.nossoNumeroAsaas || null
    });
    if (error) {
      console.error('Erro ao criar conta a receber:', error);
      throw error;
    }
  },

  async getOutrosCreditos(poloId?: string): Promise<ContasReceber[]> {
    return this.getContasReceber({ categoria: 'OUTROS_CREDITOS', poloId });
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
      id: data.id,
      poloId: data.polo_id,
      poloNome: '',
      poloCnpj: '',
      poloCidade: '',
      poloUf: '',
      descricao: data.descricao,
      valor: Number(data.valor),
      dataVencimento: data.data_vencimento,
      dataPagamento: data.data_pagamento,
      valorPago: data.valor_pago === null ? undefined : Number(data.valor_pago),
      status: data.status,
      categoria: data.categoria,
      categoriaFinanceiraId: data.categoria_financeira_id || undefined,
      categoriaFinanceiraNome: data.categorias_financeiras?.nome || undefined,
      clienteId: data.cliente_id,
      clienteNome: 'Cliente Geral',
      clienteCpfCnpj: '',
      formaPagamento: data.forma_pagamento,
      origemPagamento: data.origem_pagamento,
      gatewayProvider: data.gateway_provider,
      contaBancariaId: data.conta_bancaria_id,
      nossoNumeroAsaas: data.nosso_numero_asaas,
      asaasPaymentId: data.asaas_payment_id || data.gateway_payment_id,
      asaasPaymentLinkId: data.asaas_payment_link_id || data.gateway_payment_link_id,
      asaasInvoiceUrl: data.asaas_invoice_url || data.gateway_invoice_url,
      asaasBankSlipUrl: data.asaas_bank_slip_url || data.gateway_bank_slip_url,
      asaasInstallmentId: data.asaas_installment_id || data.gateway_installment_id,
      asaasTransactionReceiptUrl: data.asaas_transaction_receipt_url || data.gateway_transaction_receipt_url,
      asaasStatus: data.asaas_status || data.gateway_status,
      asaasLastError: data.asaas_last_error || data.gateway_last_error,
      createdAt: data.created_at,
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
    }
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
    params: {
      recreateAsaas?: boolean;
      reason?: string;
    } = {}
  ): Promise<{
    success: boolean;
    receivable: any;
    asaasRecreated?: boolean;
    baneseRecreated?: boolean;
    gatewayRecreated?: boolean;
    gatewayProvider?: string | null;
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

  // 4. Contas a Pagar (Despesas)
  async getContasPagar(filters?: { poloId?: string; status?: string; categoria?: string }): Promise<ContasPagar[]> {
    let query = supabase
      .from('contas_pagar')
      .select('*, parceiros(nome), polos(nome)');

    if (filters?.poloId && filters.poloId !== 'todos') {
      query = query.eq('polo_id', filters.poloId);
    }
    if (filters?.status && filters.status !== 'todos') {
      query = query.eq('status', filters.status);
    }
    if (filters?.categoria && filters.categoria !== 'todos') {
      query = query.eq('categoria', filters.categoria);
    }

    const { data, error } = await query.order('data_vencimento', { ascending: true });
    if (error) {
      console.error('Erro ao buscar contas a pagar:', error);
      throw error;
    }

    return (data || []).map((cp: any) => ({
      id: cp.id,
      poloId: cp.polo_id,
      poloNome: cp.polos?.nome || '',
      descricao: cp.descricao,
      valor: Number(cp.valor),
      dataVencimento: cp.data_vencimento,
      dataPagamento: cp.data_pagamento,
      valorPago: cp.valor_pago ? Number(cp.valor_pago) : undefined,
      status: cp.status,
      categoria: cp.categoria,
      fornecedorId: cp.fornecedor_id,
      fornecedorNome: cp.parceiros?.nome || 'Fornecedor Geral',
      formaPagamento: cp.forma_pagamento,
      contaBancariaId: cp.conta_bancaria_id,
      createdAt: cp.created_at
    }));
  },

  async createPayable(cp: Omit<ContasPagar, 'id'>): Promise<void> {
    const { error } = await supabase.from('contas_pagar').insert({
      polo_id: cp.poloId,
      descricao: cp.descricao,
      valor: cp.valor,
      data_vencimento: cp.dataVencimento,
      // Uma obrigação nasce em aberto. A baixa exige a RPC transacional abaixo,
      // que valida conta, data, valor e idempotência no backend.
      status: 'PENDENTE',
      categoria: cp.categoria,
      fornecedor_id: cp.fornecedorId || null,
      forma_pagamento: cp.formaPagamento || null,
      conta_bancaria_id: null
    });
    if (error) {
      console.error('Erro ao criar conta a pagar:', error);
      throw error;
    }
  },

  async markPayablePaid(
    id: string,
    params: {
      contaBancariaId: string;
      valorPago: number;
      dataPagamento: string;
      formaPagamento: 'BOLETO' | 'PIX' | 'TED' | 'DINHEIRO';
    }
  ): Promise<void> {
    const requestId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const { error } = await supabase.rpc('baixar_conta_pagar_secure', {
      p_conta_pagar_id: id,
      p_request_id: requestId,
      p_conta_bancaria_id: params.contaBancariaId,
      p_data_pagamento: params.dataPagamento,
      p_forma_pagamento: params.formaPagamento,
    });
    if (error) {
      console.error('Erro ao liquidar conta a pagar:', error);
      throw error;
    }
  },

  async deletePayable(id: string): Promise<void> {
    const { error } = await supabase.from('contas_pagar').delete().eq('id', id);
    if (error) {
      console.error('Erro ao deletar conta a pagar:', error);
      throw error;
    }
  },

  // 5. Transferências entre Contas
  async getTransferencias(filters: TransferenciasFilters = {}): Promise<TransferenciaConta[]> {
    const { data, error } = await supabase.rpc('get_transferencias_contas', {
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_search: filters.search?.trim() || null,
      p_conta_origem_id: filters.contaOrigemId || null,
      p_conta_destino_id: filters.contaDestinoId || null,
      p_data_inicio: filters.dataInicio || null,
      p_data_fim: filters.dataFim || null,
      p_mes_atual: filters.mesAtual === true
    });
    if (error) {
      console.error('Erro ao buscar transferências:', error);
      throw error;
    }

    return (data || []).map((t: any) => ({
      id: t.id,
      poloId: t.polo_origem_id,
      poloNome: t.polo_origem_nome || '',
      poloCnpj: t.polo_origem_cnpj || '',
      poloCidade: t.polo_origem_cidade || '',
      poloUf: t.polo_origem_uf || '',
      contaOrigemId: t.conta_origem_id,
      contaOrigemBanco: t.conta_origem_banco || '',
      contaOrigemTitular: t.conta_origem_titular || '',
      contaOrigemAgencia: t.conta_origem_agencia || '',
      contaOrigemConta: t.conta_origem_conta || '',
      contaOrigemNome: `${t.conta_origem_banco || ''} - ${t.conta_origem_conta || ''}`,
      poloDestinoId: t.polo_destino_id,
      poloDestinoNome: t.polo_destino_nome || '',
      poloDestinoCnpj: t.polo_destino_cnpj || '',
      poloDestinoCidade: t.polo_destino_cidade || '',
      poloDestinoUf: t.polo_destino_uf || '',
      contaDestinoId: t.conta_destino_id,
      contaDestinoBanco: t.conta_destino_banco || '',
      contaDestinoTitular: t.conta_destino_titular || '',
      contaDestinoAgencia: t.conta_destino_agencia || '',
      contaDestinoConta: t.conta_destino_conta || '',
      contaDestinoNome: `${t.conta_destino_banco || ''} - ${t.conta_destino_conta || ''}`,
      valor: Number(t.valor),
      dataTransferencia: t.data_transferencia,
      observacao: t.observacao,
      createdAt: t.created_at,
      updatedAt: t.updated_at
    }));
  },

  async getTransferenciasSummary(
    filters: TransferenciasFilters = {},
  ): Promise<TransferenciasSummary> {
    const { data, error } = await supabase.rpc('get_transferencias_summary_secure', {
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_search: filters.search?.trim() || null,
      p_conta_origem_id: filters.contaOrigemId || null,
      p_conta_destino_id: filters.contaDestinoId || null,
      p_data_inicio: filters.dataInicio || null,
      p_data_fim: filters.dataFim || null,
      p_mes_atual: filters.mesAtual === true,
    });
    if (error) {
      console.error('Erro ao buscar resumo de transferências:', error);
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      totalValue: Number(row?.total_value || 0),
      totalCount: Number(row?.total_count || 0),
    };
  },

  async createTransferencia(t: TransferenciaInput): Promise<string> {
    const { data, error } = await supabase.rpc('registrar_transferencia_conta', {
      p_polo_origem_id: t.poloOrigemId,
      p_conta_origem_id: t.contaOrigemId,
      p_polo_destino_id: t.poloDestinoId,
      p_conta_destino_id: t.contaDestinoId,
      p_valor: t.valor,
      p_data_transferencia: t.dataTransferencia,
      p_observacao: t.observacao || null,
      p_request_id: t.requestId,
    });
    if (error) {
      console.error('Erro ao registrar transferência:', error);
      throw error;
    }
    return data as string;
  },

  async updateTransferencia(id: string, t: TransferenciaInput): Promise<void> {
    const { error } = await supabase.rpc('editar_transferencia_conta', {
      p_transferencia_id: id,
      p_polo_origem_id: t.poloOrigemId,
      p_conta_origem_id: t.contaOrigemId,
      p_polo_destino_id: t.poloDestinoId,
      p_conta_destino_id: t.contaDestinoId,
      p_valor: t.valor,
      p_data_transferencia: t.dataTransferencia,
      p_observacao: t.observacao || null
    });
    if (error) {
      console.error('Erro ao editar transferência:', error);
      throw error;
    }
  },

  async deleteTransferencia(id: string): Promise<void> {
    const { error } = await supabase.rpc('excluir_transferencia_conta', {
      p_transferencia_id: id
    });
    if (error) {
      console.error('Erro ao excluir transferência:', error);
      throw error;
    }
  },

  // 6. Auxiliares
  async getPolos(): Promise<FinanceiroPolo[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, cnpj, cidade, estado, is_matriz')
      .eq('status', 'ativo')
      .order('nome', { ascending: true });
    if (error) {
      console.error('Erro ao buscar polos no financeiro:', error);
      throw error;
    }
    return data || [];
  },

  async getParceiros(poloId?: string): Promise<any[]> {
    if (poloId && poloId !== 'todos') {
      const { data, error } = await supabase.rpc(
        'get_financeiro_credores_por_polo_secure',
        { p_polo_id: poloId },
      );
      if (error) {
        console.error('Erro ao buscar credores do polo no financeiro:', error);
        throw error;
      }
      return Array.isArray(data) ? data : [];
    }

    const { data, error } = await supabase
      .from('parceiros')
      .select('id, nome, tipo, cpf_cnpj, email, telefone, foto_url, polo_id, polo_ids')
      .eq('status', 'ATIVO')
      .order('nome', { ascending: true });
    if (error) {
      console.error('Erro ao buscar parceiros no financeiro:', error);
      throw error;
    }
    return data || [];
  },

  async getTurmas(poloId?: string): Promise<any[]> {
    let query = supabase
      .from('turmas')
      .select('id, nome, codigo, polo_id, cursos(modalidade)');
    if (poloId && poloId !== 'todos') {
      query = query.eq('polo_id', poloId);
    }
    const { data, error } = await query.order('nome', { ascending: true });
    if (error) {
      console.error('Erro ao buscar turmas no financeiro:', error);
      throw error;
    }
    return data || [];
  },

  async getResumoKpis(poloId?: string): Promise<{ alunosAtivos: number; parcelasAtraso: number }> {
    let activeStudentsQuery = supabase
      .from('matriculas')
      .select('*, turmas!inner(polo_id)', { count: 'exact', head: true })
      .eq('status', 'ATIVO');

    if (poloId && poloId !== 'todos') {
      activeStudentsQuery = activeStudentsQuery.eq('turmas.polo_id', poloId);
    }

    const { count: activeStudents, error: err1 } = await activeStudentsQuery;
      
    if (err1) {
      console.error('Erro ao contar alunos ativos:', err1);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let overdueQuery = supabase
      .from('contas_receber')
      .select('*', { count: 'exact', head: true })
      .or(`status.eq.VENCIDO,and(status.eq.PENDENTE,data_vencimento.lt.${todayStr})`);

    if (poloId && poloId !== 'todos') {
      overdueQuery = overdueQuery.eq('polo_id', poloId);
    }

    const { count: overdueCount, error: err2 } = await overdueQuery;

    if (err2) {
      console.error('Erro ao contar parcelas em atraso:', err2);
    }

    return {
      alunosAtivos: activeStudents || 0,
      parcelasAtraso: overdueCount || 0
    };
  },

  async searchAlunoReceivables(searchQuery: string, poloId?: string): Promise<any[]> {
    const normalizedSearch = searchQuery.trim();
    if (normalizedSearch.length < 2) return [];

    const { data, error } = await supabase.rpc('search_financeiro_aluno_receivables_secure', {
      p_search: normalizedSearch,
      p_polo_id: poloId && poloId !== 'todos' ? poloId : null,
      p_limit: 50,
    });
    if (error) {
      console.error('Erro ao buscar contas a receber de alunos:', error);
      throw error;
    }

    return (Array.isArray(data) ? data : []).map((cr: any) => ({
      id: cr.id,
      poloNome: cr.polo_nome || '',
      descricao: cr.descricao,
      valor: Number(cr.valor),
      dataVencimento: cr.data_vencimento,
      dataPagamento: cr.data_pagamento,
      status: cr.status,
      categoria: cr.categoria,
      clienteNome: cr.cliente_nome || 'Cliente Geral',
      clienteCpf: cr.cliente_cpf || '',
      formaPagamento: cr.forma_pagamento
    }));
  }
};
