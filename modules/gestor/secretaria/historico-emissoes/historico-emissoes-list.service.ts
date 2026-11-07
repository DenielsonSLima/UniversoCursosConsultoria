import { supabase } from '../../../../lib/supabase';
import { PAGE_SIZE } from './historico-emissoes.constants';
import type { CursoEmissionFilter, EmissionLog, TurmaFilter } from './historico-emissoes.types';

export const historicoEmissoesListService = {
  async loadFilters(poloId: string): Promise<{
    turmas: TurmaFilter[];
    cursos: CursoEmissionFilter[];
    systemUsers: Record<string, string>;
  }> {
    const [turmasResult, usersResult] = await Promise.all([
      supabase.from('turmas')
        .select('id, nome, codigo, curso_id, curso:cursos(id, nome, modalidade)')
        .or(`polo_id.eq.${poloId},polo_id.is.null`)
        .order('nome', { ascending: true }),
      supabase.from('usuarios_sistema').select('id, nome'),
    ]);
    if (turmasResult.error) throw turmasResult.error;
    if (usersResult.error) throw usersResult.error;
    const cursos = new Map<string, CursoEmissionFilter>();
    const turmas = (turmasResult.data || []).map((row: any) => {
      const curso = Array.isArray(row.curso) ? row.curso[0] : row.curso;
      if (curso) cursos.set(curso.id, { id: curso.id, nome: curso.nome, modalidade: curso.modalidade });
      return { id: row.id, nome: row.nome, codigo: row.codigo,
        cursoId: row.curso_id, modalidade: curso?.modalidade };
    });
    return {
      turmas,
      cursos: [...cursos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      systemUsers: Object.fromEntries((usersResult.data || []).map((user) => [user.id, user.nome])),
    };
  },

  async loadEmissions(params: {
    poloId: string; activeTab: string; turmaId: string;
    modalidade?: string; cursoId?: string; search: string; page: number;
  }): Promise<{ emissions: EmissionLog[]; total: number }> {
    const { data, error } = await supabase.rpc('search_secretaria_emissions_filtered_secure', {
      p_polo_id: params.poloId,
      p_documento: params.activeTab === 'todos' ? null : params.activeTab,
      p_turma_id: params.turmaId === 'todos' ? null : params.turmaId,
      p_modalidade: !params.modalidade || params.modalidade === 'todos' ? null : params.modalidade,
      p_curso_id: !params.cursoId || params.cursoId === 'todos' ? null : params.cursoId,
      p_search: params.search.trim(),
      p_offset: (params.page - 1) * PAGE_SIZE,
      p_limit: PAGE_SIZE,
    });
    if (error) throw error;
    return { emissions: data?.items || [], total: Number(data?.total || 0) };
  },
};
