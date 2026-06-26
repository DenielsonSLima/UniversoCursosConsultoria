import { supabase } from '../../../../lib/supabase';
import { Curso } from '../cadastros.types';

export type EadGroupMode = 'area' | 'none';
export type EadSortMode = 'nome_asc' | 'nome_desc' | 'area_asc';
export type EadStatusFilter = 'ativo' | 'inativo';

export interface EadCoursesListParams {
  statusFilter: EadStatusFilter;
  searchTerm: string;
  areaFilter: string;
  groupMode: EadGroupMode;
  sortMode: EadSortMode;
  currentPage: number;
  pageSize: number;
}

export const cursosEadQueryKeys = {
  dashboard: ['ead-dashboard'] as const,
  listRoot: ['ead-cursos-list'] as const,
  list: (params: EadCoursesListParams) => [
    'ead-cursos-list',
    params.statusFilter,
    params.searchTerm,
    params.areaFilter,
    params.groupMode,
    params.sortMode,
    params.currentPage,
    params.pageSize,
  ] as const,
  areas: ['ead-cursos-areas'] as const,
};

export const cursosEadService = {
  async getDashboard() {
    const { data, error } = await supabase.rpc('ead_get_dashboard');
    if (error) throw error;
    return data;
  },

  async getCoursesList(params: EadCoursesListParams) {
    const normalizedSearch = params.searchTerm.trim();
    const from = (params.currentPage - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = supabase
      .from('cursos')
      .select('*, turmas(id)', { count: 'exact' })
      .eq('modalidade', 'EAD')
      .eq('status', params.statusFilter);

    if (params.areaFilter !== 'Todas') {
      query = query.eq('area', params.areaFilter);
    }

    if (normalizedSearch) {
      query = query.or(`nome.ilike.%${normalizedSearch}%,descricao.ilike.%${normalizedSearch}%`);
    }

    if (params.sortMode === 'nome_desc') {
      query = query.order('nome', { ascending: false });
    } else if (params.sortMode === 'area_asc') {
      query = query.order('area', { ascending: true }).order('nome', { ascending: true });
    } else {
      query = query.order('nome', { ascending: true });
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const rows = (data || []).map((curso: any) => ({
      ...curso,
      total_turmas: (curso.turmas || []).length
    }));

    const rowsByArea = new Map<string, Curso[]>();
    for (const curso of rows) {
      const area = curso.area || 'Outros';
      if (!rowsByArea.has(area)) rowsByArea.set(area, []);
      rowsByArea.get(area)!.push(curso as Curso);
    }

    const grouped = Array.from(rowsByArea.entries()).map(([area, cursos]) => ({
      area,
      total: cursos.length,
      cursos: cursos as Curso[]
    }));

    if (params.groupMode === 'area') {
      grouped.sort((a, b) => a.area.localeCompare(b.area));
    }

    return {
      groups: params.groupMode === 'none' ? [{
        area: 'Todos os cursos',
        total: rows.length,
        cursos: rows as Curso[]
      }] : grouped,
      total: count || 0
    };
  },

  async getAreaOptions(): Promise<string[]> {
    const { data, error } = await supabase
      .from('cursos')
      .select('area')
      .eq('modalidade', 'EAD');

    if (error) throw error;

    const areasSet = new Set<string>();
    for (const curso of data || []) {
      const area = (curso as any).area || 'Outros';
      areasSet.add(area);
    }
    return Array.from(areasSet).sort((a, b) => a.localeCompare(b));
  }
};
