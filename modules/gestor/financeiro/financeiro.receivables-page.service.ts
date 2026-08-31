import { supabase } from '../../../lib/supabase';
import type {
  ActiveReceivablesClass,
  ContasReceber,
  ReceivablesGroupsPage,
  ReceivablesPage,
  ReceivablesPageFilters,
  ReceivablesSummary,
  ReceivablesSummaryFilters,
} from './financeiro.types';

type CourseModality = 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO';

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
  boletoNossoNumero: row.boleto_nosso_numero || undefined,
  boletoDescontoConfigurado: row.boleto_desconto_configurado === null
    || row.boleto_desconto_configurado === undefined
    ? undefined
    : Number(row.boleto_desconto_configurado),
  boletoDescontoValidoAte: row.boleto_desconto_valido_ate || undefined,
  boletoDescontoSituacao: row.boleto_desconto_situacao || undefined,
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

const getReceivablesPageByModality = async (
  modality: CourseModality,
  filters: ReceivablesPageFilters,
): Promise<ReceivablesPage> => {
  const { data, error } = await supabase.rpc('get_receivables_modality_page_v3_secure', {
    p_modality: modality,
    p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
    p_turma_id: filters.turmaId || null,
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
};

export const financeiroReceivablesPageServiceMethods = {
  getReceivablesPageByModality,

  async getReceivablesGroupsPageByModality(
    modality: CourseModality,
    filters: ReceivablesPageFilters,
  ): Promise<ReceivablesGroupsPage> {
    const { data, error } = await supabase.rpc('get_receivables_modality_groups_page_v3_secure', {
      p_modality: modality,
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_turma_id: filters.turmaId || null,
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
    modality: CourseModality,
    filters: Omit<ReceivablesPageFilters, 'page' | 'pageSize' | 'groupMode' | 'groupKey'>,
  ): Promise<ContasReceber[]> {
    const rows: ContasReceber[] = [];
    const pageSize = 500;
    let page = 1;

    while (true) {
      const result = await getReceivablesPageByModality(modality, {
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
    modality: CourseModality,
    filters: ReceivablesSummaryFilters = {},
  ): Promise<ReceivablesSummary> {
    const { data, error } = await supabase.rpc('get_receivables_modality_summary_v3_secure', {
      p_modality: modality,
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_turma_id: filters.turmaId || null,
      p_search: filters.search?.trim() || null,
      p_due_start: filters.dueStart || null,
      p_due_end: filters.dueEnd || null,
    });

    if (error) {
      console.error(`Erro ao buscar resumo de recebíveis da modalidade ${modality}:`, error);
      throw error;
    }

    return mapReceivablesSummary(Array.isArray(data) ? data[0] : data);
  },

  async getActiveReceivablesClassesByModality(
    modality: CourseModality,
    poloId?: string,
  ): Promise<ActiveReceivablesClass[]> {
    let query = supabase
      .from('turmas')
      .select('id, nome, codigo, cursos!inner(modalidade)')
      .eq('status', 'EM_ANDAMENTO')
      .eq('cursos.modalidade', modality);

    if (poloId && poloId !== 'todos') query = query.eq('polo_id', poloId);

    const { data, error } = await query.order('nome', { ascending: true });
    if (error) {
      console.error(`Erro ao buscar turmas ativas de ${modality}:`, error);
      throw error;
    }

    return (data || []).map((turma: any) => ({
      id: turma.id,
      nome: turma.nome,
      codigo: turma.codigo || null,
    }));
  },
};
