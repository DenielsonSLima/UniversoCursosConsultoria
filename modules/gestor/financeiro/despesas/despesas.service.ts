// File: modules/gestor/financeiro/despesas/despesas.service.ts

import { supabase } from '../../../../lib/supabase';
import { DespesaTipo, DespesasFilters } from './despesas.queryKeys';

// ============================================================
// Interfaces
// ============================================================

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: DespesaTipo;
  descricao?: string;
  status: 'ativo' | 'inativo';
  createdAt?: string;
}

export interface DespesaLancamento {
  id: string;
  poloId?: string;
  poloNome?: string;
  tipo: DespesaTipo;
  descricao: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  valorPago?: number;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'CANCELADO';
  categoriaFinanceiraId?: string;
  categoriaNome?: string;
  fornecedorId?: string;
  fornecedorNome?: string;
  formaPagamento?: string;
  contaBancariaId?: string;
  parcelaNumero: number;
  totalParcelas: number;
  grupoParcelas?: string;
  observacao?: string;
  turmaId?: string;
  turmaNome?: string;
  createdAt: string;
}

export interface CreateDespesaInput {
  poloId: string;
  tipo: DespesaTipo;
  descricao: string;
  valor: number;
  dataVencimento: string;
  categoriaFinanceiraId?: string;
  fornecedorId?: string;
  observacao?: string;
  turmaId?: string;
  // Parcelas
  totalParcelas?: number;
  intervaloDias?: number;
  // Baixa imediata
  markAsPaid?: boolean;
  formaPagamento?: string;
  contaBancariaId?: string;
}

export interface CreateCategoriaFinanceiraInput {
  nome: string;
  tipo: DespesaTipo;
  descricao?: string;
  status?: 'ativo' | 'inativo';
}


// ============================================================
// Mapper
// ============================================================

const mapLancamento = (row: any): DespesaLancamento => ({
  id: row.id,
  poloId: row.polo_id,
  poloNome: row.polos?.nome || '',
  tipo: row.tipo,
  descricao: row.descricao,
  valor: Number(row.valor || 0),
  dataVencimento: row.data_vencimento,
  dataPagamento: row.data_pagamento ?? undefined,
  valorPago: row.valor_pago !== null ? Number(row.valor_pago) : undefined,
  status: row.status,
  categoriaFinanceiraId: row.categoria_financeira_id ?? undefined,
  categoriaNome: row.categorias_financeiras?.nome ?? undefined,
  fornecedorId: row.fornecedor_id ?? undefined,
  fornecedorNome: row.parceiros?.nome ?? undefined,
  formaPagamento: row.forma_pagamento ?? undefined,
  contaBancariaId: row.conta_bancaria_id ?? undefined,
  parcelaNumero: Number(row.parcela_numero || 1),
  totalParcelas: Number(row.total_parcelas || 1),
  grupoParcelas: row.grupo_parcelas_id ?? undefined,
  observacao: row.observacao ?? undefined,
  turmaId: row.turma_id ?? undefined,
  turmaNome: row.turmas?.nome ?? undefined,
  createdAt: row.created_at,
});

// ============================================================
// Helper: calcula datas de parcelas
// ============================================================

const addDays = (dateStr: string, days: number): string => {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

// ============================================================
// Service
// ============================================================

export const despesasService = {

  // ----------------------------------------------------------
  // Buscar Lançamentos
  // ----------------------------------------------------------
  async getDespesas(filters: DespesasFilters = {}): Promise<DespesaLancamento[]> {
    let query = supabase
      .from('despesas_lancamentos')
      .select(`
        *,
        polos(nome),
        categorias_financeiras(nome),
        parceiros(nome),
        turmas(nome)
      `);

    if (filters.tipo) {
      query = query.eq('tipo', filters.tipo);
    }
    if (filters.poloId && filters.poloId !== 'todos') {
      query = query.eq('polo_id', filters.poloId);
    }
    if (filters.categoriaId) {
      query = query.eq('categoria_financeira_id', filters.categoriaId);
    }
    if (filters.turmaId) {
      query = query.eq('turma_id', filters.turmaId);
    }

    // Filtro por escopo de status
    if (filters.statusScope === 'mes_atual') {
      const now = new Date();
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString().slice(0, 10);
      query = query.gte('data_vencimento', firstDay).lte('data_vencimento', lastDay);
    } else if (filters.statusScope === 'em_aberto') {
      query = query.in('status', ['PENDENTE', 'VENCIDO']);
    }

    // Filtro por data manual
    if (filters.dataInicio) {
      query = query.gte('data_vencimento', filters.dataInicio);
    }
    if (filters.dataFim) {
      query = query.lte('data_vencimento', filters.dataFim);
    }

    const { data, error } = await query.order('data_vencimento', { ascending: true });
    if (error) {
      console.error('Erro ao buscar despesas:', error);
      throw error;
    }
    return (data || []).map(mapLancamento);
  },

  // ----------------------------------------------------------
  // Criar Lançamento (único ou parcelado)
  // ----------------------------------------------------------
  async createDespesa(input: CreateDespesaInput): Promise<DespesaLancamento[]> {
    const totalParcelas = Math.max(1, input.totalParcelas || 1);
    const intervaloDias = Math.max(1, input.intervaloDias || 30);
    const grupoParcelas = totalParcelas > 1 ? crypto.randomUUID() : undefined;

    const rows = Array.from({ length: totalParcelas }, (_, i) => ({
      polo_id: input.poloId,
      tipo: input.tipo,
      descricao: totalParcelas > 1
        ? `${input.descricao} (${i + 1}/${totalParcelas})`
        : input.descricao,
      valor: input.valor,
      data_vencimento: i === 0
        ? input.dataVencimento
        : addDays(input.dataVencimento, intervaloDias * i),
      status: input.markAsPaid ? 'PAGO' : 'PENDENTE',
      categoria_financeira_id: input.categoriaFinanceiraId || null,
      fornecedor_id: input.fornecedorId || null,
      forma_pagamento: input.markAsPaid ? (input.formaPagamento || null) : null,
      conta_bancaria_id: input.markAsPaid ? (input.contaBancariaId || null) : null,
      data_pagamento: input.markAsPaid ? input.dataVencimento : null,
      valor_pago: input.markAsPaid ? input.valor : null,
      parcela_numero: i + 1,
      total_parcelas: totalParcelas,
      grupo_parcelas_id: grupoParcelas || null,
      observacao: input.observacao || null,
      turma_id: input.turmaId || null,
    }));

    const { data, error } = await supabase
      .from('despesas_lancamentos')
      .insert(rows)
      .select(`
        *,
        polos(nome),
        categorias_financeiras(nome),
        parceiros(nome),
        turmas(nome)
      `);

    if (error) {
      console.error('Erro ao criar despesa:', error);
      throw error;
    }
    return (data || []).map(mapLancamento);
  },

  // ----------------------------------------------------------
  // Dar Baixa em um Lançamento Existente
  // ----------------------------------------------------------
  async markDespesaPaga(
    id: string,
    params: {
      contaBancariaId: string;
      valorPago: number;
      dataPagamento: string;
      formaPagamento: string;
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('despesas_lancamentos')
      .update({
        status: 'PAGO',
        conta_bancaria_id: params.contaBancariaId,
        valor_pago: params.valorPago,
        data_pagamento: params.dataPagamento,
        forma_pagamento: params.formaPagamento,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Erro ao dar baixa em despesa:', error);
      throw error;
    }
  },

  // ----------------------------------------------------------
  // Cancelar / Excluir
  // ----------------------------------------------------------
  async cancelarDespesa(id: string): Promise<void> {
    const { error } = await supabase
      .from('despesas_lancamentos')
      .update({ status: 'CANCELADO', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Erro ao cancelar despesa:', error);
      throw error;
    }
  },

  async deleteDespesa(id: string): Promise<void> {
    const { error } = await supabase
      .from('despesas_lancamentos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir despesa:', error);
      throw error;
    }
  },

  // ----------------------------------------------------------
  // Categorias Financeiras
  // ----------------------------------------------------------
  async getCategoriasFinanceiras(tipo?: DespesaTipo): Promise<CategoriaFinanceira[]> {
    let query = supabase
      .from('categorias_financeiras')
      .select('*')
      .eq('status', 'ativo')
      .order('nome', { ascending: true });

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao buscar categorias financeiras:', error);
      throw error;
    }
    return (data || []).map((row: any) => ({
      id: row.id,
      nome: row.nome,
      tipo: row.tipo,
      descricao: row.descricao ?? undefined,
      status: row.status,
      createdAt: row.created_at,
    }));
  },

  async createCategoriaFinanceira(input: CreateCategoriaFinanceiraInput): Promise<CategoriaFinanceira> {
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .insert({
        nome: input.nome,
        tipo: input.tipo,
        descricao: input.descricao || null,
        status: input.status || 'ativo',
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar categoria financeira:', error);
      throw error;
    }
    return {
      id: data.id,
      nome: data.nome,
      tipo: data.tipo,
      descricao: data.descricao ?? undefined,
      status: data.status,
      createdAt: data.created_at,
    };
  },

  async updateCategoriaFinanceira(
    id: string,
    input: Partial<CreateCategoriaFinanceiraInput>
  ): Promise<CategoriaFinanceira> {
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar categoria financeira:', error);
      throw error;
    }
    return {
      id: data.id,
      nome: data.nome,
      tipo: data.tipo,
      descricao: data.descricao ?? undefined,
      status: data.status,
      createdAt: data.created_at,
    };
  },

  async deleteCategoriaFinanceira(id: string): Promise<void> {
    const { error } = await supabase
      .from('categorias_financeiras')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir categoria financeira:', error);
      throw error;
    }
  },

  async getAllCategoriasFinanceiras(): Promise<CategoriaFinanceira[]> {
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .select('*')
      .order('tipo', { ascending: true })
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar todas as categorias financeiras:', error);
      throw error;
    }
    return (data || []).map((row: any) => ({
      id: row.id,
      nome: row.nome,
      tipo: row.tipo,
      descricao: row.descricao ?? undefined,
      status: row.status,
      createdAt: row.created_at,
    }));
  },

  async getDespesasSummary(filters: DespesasFilters = {}): Promise<DespesasSummary> {
    const { data, error } = await supabase.rpc('get_despesas_summary', {
      p_tipo: filters.tipo || null,
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_categoria_id: filters.categoriaId || null,
      p_search: filters.search?.trim() || null,
      p_due_start: filters.dataInicio || null,
      p_due_end: filters.dataFim || null,
      p_status_scope: filters.statusScope || 'todos',
      p_turma_id: filters.turmaId || null
    });

    if (error) {
      console.error('Erro ao buscar resumo de despesas:', error);
      throw error;
    }

    const row = data?.[0] || {};
    return {
      totalValue: Number(row.total_value || 0),
      paidValue: Number(row.paid_value || 0),
      pendingValue: Number(row.pending_value || 0),
      vencidosCount: Number(row.vencidos_count || 0),
    };
  },
};

export interface DespesasSummary {
  totalValue: number;
  paidValue: number;
  pendingValue: number;
  vencidosCount: number;
}
