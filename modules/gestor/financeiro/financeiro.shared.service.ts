import { supabase } from '../../../lib/supabase';
import type {
  ContaBancaria,
  FinanceiroPolo,
  FinanceiroSummary,
  FluxoMensal,
} from './financeiro.types';

export const financeiroSharedServiceMethods = {
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
      ativo: cb.ativo,
    }));
  },

  async getFinanceiroSummary(
    poloId?: string,
    dataInicio?: string,
    dataFim?: string,
  ): Promise<FinanceiroSummary> {
    const { data, error } = await supabase.rpc('get_financeiro_summary', {
      p_polo_id: poloId || null,
      p_data_inicio: dataInicio || '1970-01-01',
      p_data_fim: dataFim || '2999-12-31',
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
      saldoCaixa: Number(res.saldo_caixa || 0),
    };
  },

  async getFluxoConsolidado3Meses(poloId?: string): Promise<FluxoMensal[]> {
    const { data, error } = await supabase.rpc('get_fluxo_consolidado_3_meses', {
      p_polo_id: poloId || null,
    });
    if (error) {
      console.error('Erro ao buscar fluxo consolidado:', error);
      throw error;
    }
    return (data || []).map((row: any) => ({
      mes: row.mes,
      ano: Number(row.ano),
      mesNome: row.mes_nome,
      creditos: Number(row.creditos || 0),
      debitos: Number(row.debitos || 0),
      atrasoReceber: Number(row.atraso_receber || 0),
      atrasoPagar: Number(row.atraso_pagar || 0),
    }));
  },

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
    if (err1) console.error('Erro ao contar alunos ativos:', err1);

    const todayStr = new Date().toISOString().split('T')[0];
    let overdueQuery = supabase
      .from('contas_receber')
      .select('*', { count: 'exact', head: true })
      .or(`status.eq.VENCIDO,and(status.eq.PENDENTE,data_vencimento.lt.${todayStr})`);

    if (poloId && poloId !== 'todos') {
      overdueQuery = overdueQuery.eq('polo_id', poloId);
    }

    const { count: overdueCount, error: err2 } = await overdueQuery;
    if (err2) console.error('Erro ao contar parcelas em atraso:', err2);

    return {
      alunosAtivos: activeStudents || 0,
      parcelasAtraso: overdueCount || 0,
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
      formaPagamento: cr.forma_pagamento,
    }));
  },
};
