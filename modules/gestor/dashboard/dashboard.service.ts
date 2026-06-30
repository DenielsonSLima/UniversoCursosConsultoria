// File: modules/gestor/dashboard/dashboard.service.ts

import { supabase } from '../../../lib/supabase';

export interface DashboardKpis {
  alunosAtivos: number;
  alunosAtivosMudanca: number;
  receitaMes: number;
  receitaMesMudanca: number;
  taxaInadimplencia: number;
  taxaInadimplenciaMudanca: number;
  novasMatriculas: number;
  novasMatriculasMudanca: number;
}

export interface ChartDataPoint {
  mesNum: number;
  anoNum: number;
  mesNome: string;
  receitas: number;
  despesas: number;
}

export interface RecentActivityItem {
  tipoAtividade: 'matricula' | 'pagamento' | 'documento';
  titulo: string;
  descricao: string;
  dataEvento: string;
}

export type DashboardAlunoModalidade = 'EAD' | 'LIVRE' | 'ESPECIALIZACAO' | 'TECNICO';

const hasModalidadeFilter = (modalidades?: DashboardAlunoModalidade[]) => Boolean(modalidades && modalidades.length > 0);

const inCurrentMonth = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};

const inPreviousMonth = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return date.getFullYear() === previous.getFullYear() && date.getMonth() === previous.getMonth();
};

const calculateChange = (current: number, previous: number) => Number((((current - previous) / (previous || 1)) * 100).toFixed(1));

const getRecordDate = (record: any) => record.data_pagamento || record.data_vencimento;

const filterByPolo = (record: any, poloId?: string | null) => {
  if (!poloId) return true;
  if (record.polo_id === poloId) return true;
  return Array.isArray(record.polo_ids) && record.polo_ids.includes(poloId);
};

const getAlunoModalidadeSet = async (modalidades: DashboardAlunoModalidade[]) => {
  const { data, error } = await supabase
    .from('matriculas')
    .select('aluno_id, status, turmas!inner(cursos!inner(modalidade))')
    .in('status', ['ATIVO', 'CONCLUIDO', 'PENDENTE']);

  if (error) throw error;

  const alunoIds = new Set<string>();
  (data || []).forEach((matricula: any) => {
    const turma = Array.isArray(matricula.turmas) ? matricula.turmas[0] : matricula.turmas;
    const curso = turma && (Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos);
    if (modalidades.includes(curso?.modalidade) && matricula.aluno_id) {
      alunoIds.add(matricula.aluno_id);
    }
  });

  return alunoIds;
};

const getMatriculasByModalidade = async (modalidades: DashboardAlunoModalidade[]) => {
  const { data, error } = await supabase
    .from('matriculas')
    .select('id, aluno_id, data_matricula, turmas!inner(id, nome, cursos!inner(nome, modalidade))')
    .order('data_matricula', { ascending: false });

  if (error) throw error;

  return (data || []).filter((matricula: any) => {
    const turma = Array.isArray(matricula.turmas) ? matricula.turmas[0] : matricula.turmas;
    const curso = turma && (Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos);
    return modalidades.includes(curso?.modalidade);
  });
};

const getFilteredKpisClientSide = async (poloId?: string | null, modalidades: DashboardAlunoModalidade[] = []): Promise<DashboardKpis> => {
  const alunoIds = await getAlunoModalidadeSet(modalidades);
  const [parceirosRes, contasRes, matriculas] = await Promise.all([
    supabase.from('parceiros').select('id, status, tipo, created_at, polo_id, polo_ids').eq('tipo', 'Aluno'),
    supabase.from('contas_receber').select('cliente_id, polo_id, status, valor, valor_pago, data_vencimento, data_pagamento'),
    getMatriculasByModalidade(modalidades)
  ]);

  if (parceirosRes.error) throw parceirosRes.error;
  if (contasRes.error) throw contasRes.error;

  const parceiros = (parceirosRes.data || []).filter((p: any) => filterByPolo(p, poloId) && alunoIds.has(p.id));
  const parceiroById = new Map((parceirosRes.data || []).map((p: any) => [p.id, p]));
  const alunosAtivos = parceiros.filter((p: any) => p.status === 'ATIVO').length;
  const alunosAtivosAnterior = parceiros.filter((p: any) => p.status === 'ATIVO' && !inCurrentMonth(p.created_at)).length;
  const contas = (contasRes.data || []).filter((c: any) => filterByPolo(c, poloId) && alunoIds.has(c.cliente_id));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const receitaMes = contas
    .filter((c: any) => c.status === 'PAGO' && inCurrentMonth(getRecordDate(c)))
    .reduce((sum: number, c: any) => sum + Number(c.valor_pago || c.valor || 0), 0);
  const receitaMesAnterior = contas
    .filter((c: any) => c.status === 'PAGO' && inPreviousMonth(getRecordDate(c)))
    .reduce((sum: number, c: any) => sum + Number(c.valor_pago || c.valor || 0), 0);
  const vencido = contas
    .filter((c: any) => c.status !== 'PAGO' && c.data_vencimento && new Date(`${c.data_vencimento}T00:00:00`) < today)
    .reduce((sum: number, c: any) => sum + Number(c.valor || 0), 0);
  const recebido = contas
    .filter((c: any) => c.status === 'PAGO')
    .reduce((sum: number, c: any) => sum + Number(c.valor_pago || c.valor || 0), 0);
  const inadimplencia = Number(((vencido / ((recebido + vencido) || 1)) * 100).toFixed(1));
  const matriculasFiltradas = matriculas.filter((m: any) => filterByPolo(parceiroById.get(m.aluno_id) || {}, poloId));
  const novasMatriculas = matriculasFiltradas.filter((m: any) => inCurrentMonth(m.data_matricula)).length;
  const novasMatriculasAnterior = matriculasFiltradas.filter((m: any) => inPreviousMonth(m.data_matricula)).length;

  return {
    alunosAtivos,
    alunosAtivosMudanca: calculateChange(alunosAtivos, alunosAtivosAnterior),
    receitaMes,
    receitaMesMudanca: calculateChange(receitaMes, receitaMesAnterior),
    taxaInadimplencia: inadimplencia,
    taxaInadimplenciaMudanca: 0,
    novasMatriculas,
    novasMatriculasMudanca: calculateChange(novasMatriculas, novasMatriculasAnterior),
  };
};

const getFilteredChartDataClientSide = async (poloId?: string | null, months: number = 6, modalidades: DashboardAlunoModalidade[] = []): Promise<ChartDataPoint[]> => {
  const alunoIds = await getAlunoModalidadeSet(modalidades);
  const [contasRes, despesasRes] = await Promise.all([
    supabase.from('contas_receber').select('cliente_id, polo_id, status, valor, valor_pago, data_vencimento, data_pagamento'),
    supabase.from('contas_pagar').select('polo_id, status, valor, valor_pago, data_vencimento, data_pagamento')
  ]);

  if (contasRes.error) throw contasRes.error;
  if (despesasRes.error) throw despesasRes.error;

  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return Array.from({ length: months }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (months - 1 - index), 1);
    const mesNum = date.getMonth() + 1;
    const anoNum = date.getFullYear();
    const matchesMonth = (value?: string | null) => {
      if (!value) return false;
      const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
      return parsed.getMonth() === date.getMonth() && parsed.getFullYear() === date.getFullYear();
    };

    const receitas = (contasRes.data || [])
      .filter((c: any) => c.status === 'PAGO' && filterByPolo(c, poloId) && alunoIds.has(c.cliente_id) && matchesMonth(getRecordDate(c)))
      .reduce((sum: number, c: any) => sum + Number(c.valor_pago || c.valor || 0), 0);
    const despesas = (despesasRes.data || [])
      .filter((d: any) => d.status === 'PAGO' && filterByPolo(d, poloId) && matchesMonth(getRecordDate(d)))
      .reduce((sum: number, d: any) => sum + Number(d.valor_pago || d.valor || 0), 0);

    return { mesNum, anoNum, mesNome: monthNames[date.getMonth()], receitas, despesas };
  });
};

const getFilteredRecentActivityClientSide = async (poloId?: string | null, limit: number = 5, modalidades: DashboardAlunoModalidade[] = []): Promise<RecentActivityItem[]> => {
  const alunoIds = await getAlunoModalidadeSet(modalidades);
  if (alunoIds.size === 0) return [];

  const [matriculas, contasRes] = await Promise.all([
    getMatriculasByModalidade(modalidades),
    supabase.from('contas_receber').select('cliente_id, polo_id, status, descricao, data_pagamento, created_at')
  ]);

  if (contasRes.error) throw contasRes.error;

  const { data: parceiros, error: parceirosError } = await supabase
    .from('parceiros')
    .select('id, nome, polo_id, polo_ids')
    .in('id', Array.from(alunoIds));

  if (parceirosError) throw parceirosError;
  const parceiroById = new Map((parceiros || []).map((p: any) => [p.id, p]));

  const matriculaItems: RecentActivityItem[] = matriculas
    .filter((m: any) => filterByPolo(parceiroById.get(m.aluno_id) || {}, poloId))
    .map((m: any) => {
      const turma = Array.isArray(m.turmas) ? m.turmas[0] : m.turmas;
      const curso = turma && (Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos);
      return {
        tipoAtividade: 'matricula',
        titulo: (parceiroById.get(m.aluno_id) as any)?.nome || 'Aluno',
        descricao: `Realizou matrícula no curso ${curso?.nome || 'curso'} - ${turma?.nome || 'turma'}`,
        dataEvento: m.data_matricula || ''
      };
    });

  const pagamentoItems: RecentActivityItem[] = (contasRes.data || [])
    .filter((c: any) => c.status === 'PAGO' && filterByPolo(c, poloId) && alunoIds.has(c.cliente_id))
    .map((c: any) => ({
      tipoAtividade: 'pagamento',
      titulo: 'Aluno',
      descricao: `Efetuou o pagamento de: ${c.descricao || 'cobrança'}`,
      dataEvento: c.data_pagamento || c.created_at || ''
    }));

  return [...matriculaItems, ...pagamentoItems]
    .sort((a, b) => new Date(b.dataEvento).getTime() - new Date(a.dataEvento).getTime())
    .slice(0, limit);
};

export const dashboardService = {
  async getKpis(poloId?: string | null, modalidades?: DashboardAlunoModalidade[]): Promise<DashboardKpis> {
    const { data, error } = hasModalidadeFilter(modalidades)
      ? await supabase.rpc('get_dashboard_kpis_filtered', {
          p_polo_id: poloId || null,
          p_modalidades: modalidades
        })
      : await supabase.rpc('get_dashboard_kpis', {
          p_polo_id: poloId || null
        });
    if (error) {
      if (hasModalidadeFilter(modalidades)) {
        console.warn('RPC filtrada indisponível; calculando KPIs do dashboard no cliente.', error);
        return getFilteredKpisClientSide(poloId, modalidades);
      }
      console.error('Erro ao chamar RPC de KPIs do dashboard:', error);
      throw error;
    }
    const res = data && data[0] ? data[0] : {};
    return {
      alunosAtivos: Number(res.alunos_ativos || 0),
      alunosAtivosMudanca: Number(res.alunos_ativos_mudanca || 0),
      receitaMes: Number(res.receita_mes || 0),
      receitaMesMudanca: Number(res.receita_mes_mudanca || 0),
      taxaInadimplencia: Number(res.taxa_inadimplencia || 0),
      taxaInadimplenciaMudanca: Number(res.taxa_inadimplencia_mudanca || 0),
      novasMatriculas: Number(res.novas_matriculas || 0),
      novasMatriculasMudanca: Number(res.novas_matriculas_mudanca || 0)
    };
  },

  async getChartData(poloId?: string | null, months: number = 6, modalidades?: DashboardAlunoModalidade[]): Promise<ChartDataPoint[]> {
    const { data, error } = hasModalidadeFilter(modalidades)
      ? await supabase.rpc('get_dashboard_chart_data_filtered', {
          p_polo_id: poloId || null,
          p_months: months,
          p_modalidades: modalidades
        })
      : await supabase.rpc('get_dashboard_chart_data', {
          p_polo_id: poloId || null,
          p_months: months
        });
    if (error) {
      if (hasModalidadeFilter(modalidades)) {
        console.warn('RPC filtrada indisponível; calculando gráfico do dashboard no cliente.', error);
        return getFilteredChartDataClientSide(poloId, months, modalidades);
      }
      console.error('Erro ao chamar RPC de gráfico do dashboard:', error);
      throw error;
    }
    return (data || []).map((row: any) => ({
      mesNum: Number(row.mes_num || 0),
      anoNum: Number(row.ano_num || 0),
      mesNome: row.mes_nome || '',
      receitas: Number(row.receitas || 0),
      despesas: Number(row.despesas || 0)
    }));
  },

  async getRecentActivity(poloId?: string | null, limit: number = 5, modalidades?: DashboardAlunoModalidade[]): Promise<RecentActivityItem[]> {
    const { data, error } = hasModalidadeFilter(modalidades)
      ? await supabase.rpc('get_dashboard_recent_activity_filtered', {
          p_polo_id: poloId || null,
          p_limit: limit,
          p_modalidades: modalidades
        })
      : await supabase.rpc('get_dashboard_recent_activity', {
          p_polo_id: poloId || null,
          p_limit: limit
        });
    if (error) {
      if (hasModalidadeFilter(modalidades)) {
        console.warn('RPC filtrada indisponível; calculando atividades do dashboard no cliente.', error);
        return getFilteredRecentActivityClientSide(poloId, limit, modalidades);
      }
      console.error('Erro ao chamar RPC de atividades do dashboard:', error);
      throw error;
    }
    return (data || []).map((row: any) => ({
      tipoAtividade: row.tipo_atividade,
      titulo: row.titulo || '',
      descricao: row.descricao || '',
      dataEvento: row.data_evento || ''
    }));
  }
};
