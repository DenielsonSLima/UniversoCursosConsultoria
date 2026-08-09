// File: modules/gestor/financeiro/despesas/despesas.service.ts

import { supabase } from '../../../../lib/supabase';
import {
  CategoriaFinanceiraTipo,
  DespesaTipo,
  DespesasFilters,
} from './despesas.queryKeys';

// ============================================================
// Interfaces
// ============================================================

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: CategoriaFinanceiraTipo;
  descricao?: string;
  status: 'ativo' | 'inativo';
  createdAt?: string;
}

export interface DespesaLancamento {
  id: string;
  /** Id físico da conta. Para uma linha derivada, é diferente de `id`. */
  despesaLancamentoId?: string;
  poloId?: string;
  poloNome?: string;
  tipo: DespesaTipo;
  descricao: string;
  valorBase: number;
  jurosValor: number;
  multaValor: number;
  descontoValor: number;
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
  anexoBucket?: string;
  anexoPath?: string;
  anexoNome?: string;
  anexoMime?: string;
  anexoTamanho?: number;
  createdAt: string;
  /** Linha econômica de rateio: informativa, sem baixa, exclusão ou recibo próprios. */
  isRateioDerived?: boolean;
  rateioMode?: 'SEM_RATEIO' | 'TODOS' | 'SELECIONADOS';
  rateioPolosQuantidade?: number;
  poloMatrizId?: string;
  poloMatrizNome?: string;
}

export interface DespesaBaixaParams {
  requestId: string;
  contaBancariaId: string;
  dataPagamento: string;
  formaPagamento: string;
  jurosValor?: number;
  multaValor?: number;
  descontoValor?: number;
}

/**
 * Escopo informado pela tela para o rateio canônico. O backend resolve os
 * polos elegíveis, divide os valores e mantém a baixa física na Matriz.
 */
export interface DespesaRateioInput {
  modo: 'TODOS' | 'SELECIONADOS';
  poloIds?: string[];
}

export interface CreateDespesaInput {
  requestId: string;
  poloId: string;
  tipo: DespesaTipo;
  descricao: string;
  valor: number;
  jurosValor?: number;
  multaValor?: number;
  descontoValor?: number;
  dataLancamento?: string;
  dataVencimento: string;
  categoriaFinanceiraId?: string;
  fornecedorId?: string;
  observacao?: string;
  turmaId?: string;
  // Parcelas
  totalParcelas?: number;
  intervaloQuantidade?: number;
  intervaloUnidade?: 'DIAS' | 'SEMANAS' | 'MESES';
  /** Divide o valor total entre as parcelas no RPC, preservando os centavos. */
  splitTotal?: boolean;
  // Baixa imediata
  markAsPaid?: boolean;
  formaPagamento?: string;
  contaBancariaId?: string;
  /** Presente somente para uma conta lançada pela Matriz com rateio econômico. */
  rateio?: DespesaRateioInput;
  anexo?: File;
}

export interface CreateCategoriaFinanceiraInput {
  nome: string;
  tipo: CategoriaFinanceiraTipo;
  descricao?: string;
  status?: 'ativo' | 'inativo';
}


// ============================================================
// Mapper
// ============================================================

const mapLancamento = (row: any): DespesaLancamento => ({
  id: row.id,
  despesaLancamentoId: row.despesa_lancamento_id ?? row.id,
  poloId: row.polo_id,
  poloNome: row.polo_nome ?? row.polos?.nome ?? '',
  tipo: row.tipo,
  descricao: row.descricao,
  valorBase: Number(row.valor_base ?? row.valor ?? 0),
  jurosValor: Number(row.juros_valor || 0),
  multaValor: Number(row.multa_valor || 0),
  descontoValor: Number(row.desconto_valor || 0),
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
  anexoBucket: row.anexo_bucket ?? undefined,
  anexoPath: row.anexo_path ?? undefined,
  anexoNome: row.anexo_nome ?? undefined,
  anexoMime: row.anexo_mime ?? undefined,
  anexoTamanho: row.anexo_tamanho !== null ? Number(row.anexo_tamanho) : undefined,
  createdAt: row.created_at,
  isRateioDerived: Boolean(row.is_rateio_derivado),
  rateioMode: row.rateio_modo ?? 'SEM_RATEIO',
  rateioPolosQuantidade: row.rateio_polos_quantidade !== null && row.rateio_polos_quantidade !== undefined
    ? Number(row.rateio_polos_quantidade)
    : undefined,
  poloMatrizId: row.polo_matriz_id ?? undefined,
  poloMatrizNome: row.polo_matriz_nome ?? undefined,
});

const toUpper = (value?: string | null) => (value || '').trim().toLocaleUpperCase('pt-BR');

const mapCategoriaFinanceira = (row: any): CategoriaFinanceira => ({
  id: row.id,
  nome: toUpper(row.nome),
  tipo: row.tipo,
  descricao: row.descricao ? toUpper(row.descricao) : undefined,
  status: row.status,
  createdAt: row.created_at,
});

const DESPESAS_ANEXOS_BUCKET = 'despesas-anexos';
const DESPESAS_ANEXOS_MAX_BYTES = 10 * 1024 * 1024;
const DESPESAS_ANEXOS_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const createFinanceRequestId = () => (
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const random = Math.floor(Math.random() * 16);
        return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
      })
);

const validateDespesaAnexo = (file: File) => {
  const extension = DESPESAS_ANEXOS_EXTENSIONS[file.type];
  if (!extension) {
    throw new Error('Anexe um arquivo PDF, JPG, PNG ou WEBP.');
  }
  if (file.size <= 0 || file.size > DESPESAS_ANEXOS_MAX_BYTES) {
    throw new Error('O anexo deve ter no máximo 10 MB.');
  }
  return extension;
};

// ============================================================
// Service
// ============================================================

export const despesasService = {

  // ----------------------------------------------------------
  // Buscar Lançamentos
  // ----------------------------------------------------------
  async getDespesas(filters: DespesasFilters = {}): Promise<DespesaLancamento[]> {
    const scopedPoloId = filters.poloId && filters.poloId !== 'todos'
      ? filters.poloId
      : null;

    // A leitura por polo é canônica: ela combina a conta própria com os
    // rateios econômicos recebidos de uma Matriz, sem criar títulos ou baixas
    // duplicadas no navegador.
    if (scopedPoloId && filters.tipo) {
      const { data, error } = await supabase.rpc('listar_despesas_economicas_secure', {
        p_tipo: filters.tipo,
        p_polo_id: scopedPoloId,
        p_categoria_id: filters.categoriaId || null,
        p_search: filters.search?.trim() || null,
        p_due_start: filters.dataInicio || null,
        p_due_end: filters.dataFim || null,
        p_status_scope: filters.statusScope || 'todos',
        p_turma_id: filters.turmaId || null,
      });

      if (error) {
        console.error('Erro ao buscar contas a pagar econômicas:', error);
        throw error;
      }
      return (data || []).map(mapLancamento);
    }

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
    let uploadedPath: string | undefined;

    if (input.anexo) {
      const extension = validateDespesaAnexo(input.anexo);
      uploadedPath = `${input.poloId}/${input.requestId}/anexo.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(DESPESAS_ANEXOS_BUCKET)
        .upload(uploadedPath, input.anexo, {
          cacheControl: '3600',
          contentType: input.anexo.type,
          upsert: true,
        });

      if (uploadError) throw uploadError;
    }

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
      p_anexo_bucket: uploadedPath ? DESPESAS_ANEXOS_BUCKET : null,
      p_anexo_path: uploadedPath || null,
      p_anexo_nome: uploadedPath ? input.anexo?.name || null : null,
      p_anexo_mime: uploadedPath ? input.anexo?.type || null : null,
      p_anexo_tamanho: uploadedPath ? input.anexo?.size || null : null,
    };

    const request = input.rateio
      ? supabase.rpc('criar_despesa_rateada_matriz_secure', {
          ...commonParams,
          // A RPC recebe um único contrato e decide no backend se o valor é
          // total do desdobramento ou valor por parcela. O navegador apenas
          // repassa as entradas escolhidas pelo gestor.
          p_valor: input.valor,
          p_juros_valor: input.jurosValor || 0,
          p_multa_valor: input.multaValor || 0,
          p_desconto_valor: input.descontoValor || 0,
          p_split_total: Boolean(input.splitTotal),
          p_baixa_imediata: Boolean(input.markAsPaid),
          p_forma_pagamento: input.formaPagamento || null,
          p_conta_bancaria_id: input.contaBancariaId || null,
          p_rateio_modo: input.rateio.modo,
          p_rateio_polo_ids: input.rateio.modo === 'SELECIONADOS'
            ? input.rateio.poloIds || []
            : null,
        })
      : input.splitTotal
        ? supabase.rpc('criar_despesa_com_desdobramento_secure', {
          ...commonParams,
          p_valor_total: input.valor,
          p_juros_total: input.jurosValor || 0,
          p_multa_total: input.multaValor || 0,
          p_desconto_total: input.descontoValor || 0,
        })
        : supabase.rpc('criar_despesa_secure', {
          ...commonParams,
          p_valor_base: input.valor,
          p_juros_valor: input.jurosValor || 0,
          p_multa_valor: input.multaValor || 0,
          p_desconto_valor: input.descontoValor || 0,
          p_baixa_imediata: Boolean(input.markAsPaid),
          p_forma_pagamento: input.formaPagamento || null,
          p_conta_bancaria_id: input.contaBancariaId || null,
        });

    const { data, error } = await request;

    if (error) {
      if (uploadedPath) {
        // Uma falha de rede pode ocorrer depois de o RPC confirmar a transação.
        // Só remova o arquivo quando o backend provar que o request não existe.
        const { data: persistedRows, error: verificationError } = await supabase
          .from('despesas_lancamentos')
          .select('id')
          .eq('request_id', input.requestId)
          .limit(1);

        if (!verificationError && (!persistedRows || persistedRows.length === 0)) {
          const { error: cleanupError } = await supabase.storage
            .from(DESPESAS_ANEXOS_BUCKET)
            .remove([uploadedPath]);
          if (cleanupError) {
            console.error('Não foi possível remover o anexo da despesa não criada:', cleanupError);
          }
        } else if (verificationError) {
          console.warn(
            'O anexo foi preservado porque não foi possível confirmar o resultado do lançamento:',
            verificationError,
          );
        }
      }
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
    params: DespesaBaixaParams
  ): Promise<void> {
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

    if (error) {
      console.error('Erro ao dar baixa em despesa:', error);
      throw error;
    }
  },

  async getDespesaAnexoUrl(item: DespesaLancamento): Promise<string> {
    if (!item.anexoPath) throw new Error('Esta despesa não possui anexo.');

    const { data, error } = await supabase.storage
      .from(item.anexoBucket || DESPESAS_ANEXOS_BUCKET)
      .createSignedUrl(item.anexoPath, 300);

    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Não foi possível abrir o anexo.');
    return data.signedUrl;
  },

  // ----------------------------------------------------------
  // Cancelar / Excluir
  // ----------------------------------------------------------
  async cancelarDespesa(id: string): Promise<void> {
    const { error } = await supabase.rpc('cancelar_despesa_secure', {
      p_despesa_id: id,
      p_motivo: 'Cancelada pelo gestor',
    });

    if (error) {
      console.error('Erro ao cancelar despesa:', error);
      throw error;
    }
  },

  async deleteDespesa(id: string): Promise<void> {
    const { error } = await supabase.rpc('cancelar_despesa_secure', {
      p_despesa_id: id,
      p_motivo: 'Excluída da lista pelo gestor',
    });

    if (error) {
      console.error('Erro ao excluir despesa:', error);
      throw error;
    }
  },

  // ----------------------------------------------------------
  // Categorias Financeiras
  // ----------------------------------------------------------
  async getCategoriasFinanceiras(tipo?: CategoriaFinanceiraTipo): Promise<CategoriaFinanceira[]> {
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
    return (data || []).map(mapCategoriaFinanceira);
  },

  async createCategoriaFinanceira(input: CreateCategoriaFinanceiraInput): Promise<CategoriaFinanceira> {
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .insert({
        nome: toUpper(input.nome),
        tipo: input.tipo,
        descricao: input.descricao ? toUpper(input.descricao) : null,
        status: input.status || 'ativo',
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar categoria financeira:', error);
      throw error;
    }
    return mapCategoriaFinanceira(data);
  },

  async updateCategoriaFinanceira(
    id: string,
    input: Partial<CreateCategoriaFinanceiraInput>
  ): Promise<CategoriaFinanceira> {
    const payload = {
      ...input,
      ...(input.nome !== undefined ? { nome: toUpper(input.nome) } : {}),
      ...(input.descricao !== undefined ? { descricao: input.descricao ? toUpper(input.descricao) : null } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('categorias_financeiras')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar categoria financeira:', error);
      throw error;
    }
    return mapCategoriaFinanceira(data);
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
    return (data || []).map(mapCategoriaFinanceira);
  },

  async getDespesasSummary(filters: DespesasFilters = {}): Promise<DespesasSummary> {
    const scopedPoloId = filters.poloId && filters.poloId !== 'todos'
      ? filters.poloId
      : null;
    const rpcName = scopedPoloId && filters.tipo
      ? 'get_despesas_economicas_summary_secure'
      : 'get_despesas_summary';

    const { data, error } = await supabase.rpc(rpcName, {
      p_tipo: filters.tipo || null,
      p_polo_id: scopedPoloId,
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

  async getDespesasGroupSummary(
    filters: DespesasFilters = {},
  ): Promise<DespesaGroupSummary[]> {
    const scopedPoloId = filters.poloId && filters.poloId !== 'todos'
      ? filters.poloId
      : null;
    const rpcName = scopedPoloId && filters.tipo
      ? 'get_despesas_economicas_group_summary_secure'
      : 'get_despesas_group_summary_secure';

    const { data, error } = await supabase.rpc(rpcName, {
      p_tipo: filters.tipo || null,
      p_polo_id: scopedPoloId,
      p_categoria_id: filters.categoriaId || null,
      p_search: filters.search?.trim() || null,
      p_due_start: filters.dataInicio || null,
      p_due_end: filters.dataFim || null,
      p_status_scope: filters.statusScope || 'todos',
      p_turma_id: filters.turmaId || null,
    });

    if (error) {
      console.error('Erro ao buscar resumo agrupado de despesas:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      categoriaId: row.categoria_id || undefined,
      categoriaNome: row.categoria_nome || 'Sem Categoria',
      totalValue: Number(row.total_value || 0),
      paidValue: Number(row.paid_value || 0),
      itemCount: Number(row.item_count || 0),
    }));
  },
};

export interface DespesasSummary {
  totalValue: number;
  paidValue: number;
  pendingValue: number;
  vencidosCount: number;
}

export interface DespesaGroupSummary {
  categoriaId?: string;
  categoriaNome: string;
  totalValue: number;
  paidValue: number;
  itemCount: number;
}
