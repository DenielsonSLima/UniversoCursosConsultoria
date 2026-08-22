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

interface ManagedEadConfigRow {
  course_id: string;
  ead_config: Curso['ead_config'];
}

const getManagedEadConfigs = async (courseIds: string[]) => {
  const uniqueCourseIds = Array.from(new Set(courseIds.filter(Boolean)));
  if (uniqueCourseIds.length === 0) return new Map<string, Curso['ead_config']>();

  const { data, error } = await supabase.rpc('get_ead_course_configs_for_management', {
    p_course_ids: uniqueCourseIds,
  });
  if (error) throw error;

  const configs = new Map<string, Curso['ead_config']>();
  for (const row of (data || []) as ManagedEadConfigRow[]) {
    if (!row?.course_id || !row.ead_config || typeof row.ead_config !== 'object') continue;
    configs.set(row.course_id, row.ead_config);
  }

  const missingCourseId = uniqueCourseIds.find(courseId => !configs.has(courseId));
  if (missingCourseId) {
    throw new Error('O servidor não devolveu a configuração EAD completa de todos os cursos solicitados.');
  }
  return configs;
};

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

    const rawRows = data || [];
    const managedConfigs = await getManagedEadConfigs(rawRows.map((curso: any) => curso.id));
    const rows = rawRows.map((curso: any) => ({
      ...curso,
      ead_config: managedConfigs.get(curso.id),
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
  },

  async duplicateCourse(courseId: string, name: string, version: string): Promise<Curso> {
    const [courseResult, managedConfigs] = await Promise.all([
      supabase
        .from('cursos')
        .select('id, nome, modalidade, carga_horaria, area, descricao, imagem_url, imagem_detalhe_1, imagem_detalhe_2, valor, financeiro_config, duracao_meses')
        .eq('id', courseId)
        .eq('modalidade', 'EAD')
        .single(),
      getManagedEadConfigs([courseId]),
    ]);

    if (courseResult.error) throw courseResult.error;
    const source = courseResult.data as Curso;
    const eadConfig = managedConfigs.get(courseId);
    if (!eadConfig) throw new Error('Configuração EAD completa não encontrada para duplicação.');

    const { data, error } = await supabase
      .from('cursos')
      .insert({
        nome: name,
        carga_horaria: source.carga_horaria,
        modalidade: 'EAD',
        status: 'ativo',
        area: source.area,
        descricao: source.descricao,
        versao: version,
        imagem_url: source.imagem_url,
        imagem_detalhe_1: source.imagem_detalhe_1,
        imagem_detalhe_2: source.imagem_detalhe_2,
        valor: source.valor,
        ead_config: eadConfig,
        financeiro_config: source.financeiro_config || null,
        duracao_meses: source.duracao_meses || 12,
        publicar_site: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Curso;
  }
};
