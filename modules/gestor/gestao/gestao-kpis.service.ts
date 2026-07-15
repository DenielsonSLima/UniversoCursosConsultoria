import { supabase } from '../../../lib/supabase';

export type GestaoResumoModalidade = {
  modalidade: 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO' | 'EAD';
  label: string;
  turmasAtivas: number;
  alunos: number;
  inscricoesMesAtual: number | null;
};

export type GestaoResumoKpis = {
  totalTurmasAtivas: number;
  totalAlunos: number;
  totalInscricoesEadMesAtual: number;
  cards: GestaoResumoModalidade[];
};

export const gestaoKpisService = {
  async getGestaoKpis(poloId?: string): Promise<{ activeTurmas: number; activeMatriculas: number }> {
    let turmasQuery = supabase.from('turmas')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'EM_ANDAMENTO');
    if (poloId) turmasQuery = turmasQuery.eq('polo_id', poloId);
    const { count: activeTurmas, error: turmasError } = await turmasQuery;
    if (turmasError) throw turmasError;

    const matriculasQuery = poloId
      ? supabase.from('matriculas')
        .select('id, turmas!inner(polo_id)', { count: 'exact', head: true })
        .eq('status', 'ATIVO')
        .eq('turmas.polo_id', poloId)
      : supabase.from('matriculas')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ATIVO');
    const { count: activeMatriculas, error: matriculasError } = await matriculasQuery;
    if (matriculasError) throw matriculasError;
    return { activeTurmas: activeTurmas || 0, activeMatriculas: activeMatriculas || 0 };
  },

  async getGestaoResumoKpis(poloId?: string): Promise<GestaoResumoKpis> {
    const { data, error } = await supabase.rpc('get_gestao_resumo_kpis', {
      p_polo_id: poloId || null,
    });
    if (error) throw error;
    if (!data) throw new Error('O banco não retornou os indicadores de gestão.');
    return data as any;
  },
};
