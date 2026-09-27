import { supabase } from '../../../../lib/supabase';
import type { DespesasFilters } from './despesas.queryKeys';
import { mapLancamento } from './despesas.mapper';
import { validateConvenioExpenseMvp } from './despesas-convenios.model';
import {
  cleanupDespesaAnexoIfRequestFailed,
  getDespesaAnexoUrl,
  uploadDespesaAnexo,
} from './despesas-anexos.service';
import type {
  CancelarOuEstornarDespesaInput,
  CreateDespesaInput,
  DespesaBaixaParams,
  DespesaLancamento,
  DespesaReciboSnapshot,
  UpdateDespesaInput,
} from './despesas.types';

const isDetailedExpenseReadUnavailable = (error: any) => (
  error?.code === 'PGRST202'
  || /listar_despesas_economicas_detalhadas_secure/i.test(error?.message || '')
);

const enrichLegacyRowsWithLaunchDate = async (rows: any[]) => {
  const ids = Array.from(new Set(rows
    .filter((row) => !row.is_rateio_derivado)
    .map((row) => row.despesa_lancamento_id ?? row.id)
    .filter(Boolean)));
  if (ids.length === 0) return rows;
  const { data, error } = await supabase
    .from('despesas_lancamentos')
    .select('id, data_lancamento')
    .in('id', ids);
  if (error || !Array.isArray(data)) return rows;
  const dates = new Map(data.map((row: any) => [row.id, row.data_lancamento]));
  return rows.map((row) => ({
    ...row,
    data_lancamento: row.data_lancamento
      ?? dates.get(row.despesa_lancamento_id ?? row.id)
      ?? null,
  }));
};

export const getDespesas = async (
  filters: DespesasFilters = {},
): Promise<DespesaLancamento[]> => {
  const scopedPoloId = filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null;
  if (scopedPoloId && filters.tipo) {
    const params = {
      p_tipo: filters.tipo,
      p_polo_id: scopedPoloId,
      p_categoria_id: filters.categoriaId || null,
      p_search: filters.search?.trim() || null,
      p_due_start: filters.dataInicio || null,
      p_due_end: filters.dataFim || null,
      p_status_scope: filters.statusScope || 'todos',
      p_turma_id: filters.turmaId || null,
    };
    let response = await supabase.rpc('listar_despesas_economicas_detalhadas_secure', params);
    let legacy = false;
    if (response.error && isDetailedExpenseReadUnavailable(response.error)) {
      response = await supabase.rpc('listar_despesas_economicas_secure', params);
      legacy = true;
    }
    if (response.error) throw response.error;
    const rows = Array.isArray(response.data) ? response.data : [];
    return (legacy ? await enrichLegacyRowsWithLaunchDate(rows) : rows).map(mapLancamento);
  }

  let query = supabase.from('despesas_lancamentos').select(`
    *, polos(nome), categorias_financeiras(nome), parceiros(nome), turmas(nome)
  `);
  if (filters.tipo) query = query.eq('tipo', filters.tipo);
  if (scopedPoloId) query = query.eq('polo_id', scopedPoloId);
  if (filters.categoriaId) query = query.eq('categoria_financeira_id', filters.categoriaId);
  if (filters.turmaId) query = query.eq('turma_id', filters.turmaId);
  if (filters.statusScope === 'mes_atual') {
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    query = query.gte('data_vencimento', firstDay).lte('data_vencimento', lastDay);
  } else if (filters.statusScope === 'em_aberto') {
    query = query.in('status', ['PENDENTE', 'VENCIDO']);
  }
  if (filters.dataInicio) query = query.gte('data_vencimento', filters.dataInicio);
  if (filters.dataFim) query = query.lte('data_vencimento', filters.dataFim);
  const { data, error } = await query.order('data_vencimento', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapLancamento);
};

const fetchCreatedExpense = async (id: string) => {
  const { data, error } = await supabase
    .from('despesas_lancamentos')
    .select('*, polos(nome), categorias_financeiras(nome), parceiros(nome), turmas(nome)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return mapLancamento(data);
};

export const createDespesa = async (
  input: CreateDespesaInput,
): Promise<DespesaLancamento[]> => {
  validateConvenioExpenseMvp(input);

  const uploaded = await uploadDespesaAnexo(input);
  const commonParams = {
    p_request_id: input.requestId,
    p_polo_id: input.poloId,
    p_tipo: input.tipo,
    p_descricao: input.descricao,
    p_data_lancamento: input.dataLancamento || input.dataVencimento,
    p_data_vencimento: input.dataVencimento,
    p_categoria_financeira_id: input.categoriaFinanceiraId || null,
    p_fornecedor_id: input.fornecedorId || null,
    p_observacao: input.observacao || null,
    p_turma_id: input.turmaId || null,
    p_total_parcelas: Math.max(1, input.totalParcelas || 1),
    p_intervalo_quantidade: Math.max(1, input.intervaloQuantidade || 1),
    p_intervalo_unidade: input.intervaloUnidade || 'MESES',
    p_anexo_bucket: uploaded?.bucket || null,
    p_anexo_path: uploaded?.path || null,
    p_anexo_nome: uploaded?.nome || null,
    p_anexo_mime: uploaded?.mime || null,
    p_anexo_tamanho: uploaded?.tamanho || null,
  };

  let request;
  if (input.convenioMesId) {
    request = supabase.rpc('criar_despesa_convenio_secure', {
      ...commonParams,
      p_convenio_mes_id: input.convenioMesId,
      p_valor_base: input.valor,
      p_juros_valor: input.jurosValor || 0,
      p_multa_valor: input.multaValor || 0,
      p_desconto_valor: input.descontoValor || 0,
      p_baixa_imediata: Boolean(input.markAsPaid),
      p_forma_pagamento: input.formaPagamento || null,
      p_conta_bancaria_id: input.contaBancariaId || null,
    });
  } else if (input.rateio) {
    request = supabase.rpc('criar_despesa_rateada_matriz_secure', {
      ...commonParams,
      p_valor: input.valor,
      p_juros_valor: input.jurosValor || 0,
      p_multa_valor: input.multaValor || 0,
      p_desconto_valor: input.descontoValor || 0,
      p_split_total: Boolean(input.splitTotal),
      p_baixa_imediata: Boolean(input.markAsPaid),
      p_forma_pagamento: input.formaPagamento || null,
      p_conta_bancaria_id: input.contaBancariaId || null,
      p_rateio_modo: input.rateio.modo,
      p_rateio_polo_ids: input.rateio.modo === 'SELECIONADOS' ? input.rateio.poloIds || [] : null,
    });
  } else if (input.splitTotal) {
    request = supabase.rpc('criar_despesa_com_desdobramento_secure', {
      ...commonParams,
      p_valor_total: input.valor,
      p_juros_total: input.jurosValor || 0,
      p_multa_total: input.multaValor || 0,
      p_desconto_total: input.descontoValor || 0,
    });
  } else {
    request = supabase.rpc('criar_despesa_secure', {
      ...commonParams,
      p_valor_base: input.valor,
      p_juros_valor: input.jurosValor || 0,
      p_multa_valor: input.multaValor || 0,
      p_desconto_valor: input.descontoValor || 0,
      p_baixa_imediata: Boolean(input.markAsPaid),
      p_forma_pagamento: input.formaPagamento || null,
      p_conta_bancaria_id: input.contaBancariaId || null,
    });
  }

  const { data, error } = await request;
  if (error) {
    await cleanupDespesaAnexoIfRequestFailed(input.requestId, uploaded);
    throw error;
  }
  if (input.convenioMesId) {
    const result = Array.isArray(data) ? data[0] : data;
    const createdId = result && typeof result === 'object'
      ? (result as { despesa_id?: string }).despesa_id
      : undefined;
    if (!createdId) throw new Error('O vínculo com o convênio não retornou a despesa confirmada.');
    return [await fetchCreatedExpense(createdId)];
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('O lançamento não retornou nenhuma despesa confirmada. Tente novamente.');
  }
  return data.map(mapLancamento);
};

export const markDespesaPaga = async (id: string, params: DespesaBaixaParams) => {
  const { error } = await supabase.rpc('baixar_despesa_secure', {
    p_despesa_id: id,
    p_request_id: params.requestId,
    p_conta_bancaria_id: params.contaBancariaId,
    p_data_pagamento: params.dataPagamento,
    p_forma_pagamento: params.formaPagamento,
    p_juros_valor: params.jurosValor || 0,
    p_multa_valor: params.multaValor || 0,
    p_desconto_valor: params.descontoValor || 0,
  });
  if (error) throw error;
};

export const updateDespesa = async (id: string, input: UpdateDespesaInput) => {
  const { data, error } = await supabase.rpc('atualizar_despesa_secure', {
    p_despesa_id: id,
    p_request_id: input.requestId,
    p_descricao: input.descricao,
    p_valor_base: input.valorBase,
    p_data_lancamento: input.dataLancamento,
    p_data_vencimento: input.dataVencimento,
    p_juros_valor: input.jurosValor || 0,
    p_multa_valor: input.multaValor || 0,
    p_desconto_valor: input.descontoValor || 0,
    p_categoria_financeira_id: input.categoriaFinanceiraId || null,
    p_fornecedor_id: input.fornecedorId || null,
    p_observacao: input.observacao || null,
    p_turma_id: input.turmaId || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('A edição não retornou a despesa confirmada.');
  return mapLancamento(row);
};

export const cancelarOuEstornarDespesa = async (
  id: string,
  input: CancelarOuEstornarDespesaInput,
) => {
  const { data, error } = await supabase.rpc('cancelar_ou_estornar_despesa_secure', {
    p_despesa_id: id,
    p_request_id: input.requestId,
    p_motivo: input.motivo,
    p_confirmar_estorno: Boolean(input.confirmarEstorno),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('O cancelamento não retornou a despesa confirmada.');
  return mapLancamento(row);
};

export const getDespesaReciboSnapshot = async (
  id: string,
): Promise<DespesaReciboSnapshot | null> => {
  const { data, error } = await supabase.rpc('preparar_recibo_despesa_secure', { p_despesa_id: id });
  if (error?.code === 'PGRST202' || /preparar_recibo_despesa_secure/i.test(error?.message || '')) return null;
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('O recibo não retornou um snapshot válido.');
  return data as unknown as DespesaReciboSnapshot;
};

export { getDespesaAnexoUrl };
