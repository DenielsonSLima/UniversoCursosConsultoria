import { supabase } from '../../lib/supabase';

type PublicCourseModality = 'LIVRE' | 'ESPECIALIZACAO' | 'TECNICO';

const toSingle = (value: any) => Array.isArray(value) ? value[0] : value;
export const PUBLIC_COURSE_COLUMNS = 'id, nome, modalidade, carga_horaria, status, area, descricao, parceiro_instituicao, parceiro_logo_url, imagem_url, duracao_meses, publicar_site, imagem_detalhe_1, imagem_detalhe_2, valor, asaas_payment_link_url';
const PUBLIC_COURSE_DETAIL_COLUMNS = `${PUBLIC_COURSE_COLUMNS}, ead_config`;
const PUBLIC_TURMA_COLUMNS = 'id, curso_id, nome, codigo, turno, data_inicio, vagas_totais, permitir_inscricoes_online, polos(nome, cidade, estado)';

export const fetchPublicCoursesWithOpenTurmas = async (modalidade: PublicCourseModality) => {
  const { data: cursos, error } = await supabase
    .from('cursos')
    .select(PUBLIC_COURSE_COLUMNS)
    .eq('modalidade', modalidade)
    .eq('status', 'ativo')
    .eq('publicar_site', true)
    .order('nome', { ascending: true });

  if (error) throw error;

  const courseIds = (cursos || []).map((curso: any) => curso.id).filter(Boolean);
  if (courseIds.length === 0) return cursos || [];

  const { data: turmas, error: turmasError } = await supabase
    .from('turmas')
    .select(PUBLIC_TURMA_COLUMNS)
    .eq('status', 'EM_ANDAMENTO')
    .eq('permitir_inscricoes_online', true)
    .in('curso_id', courseIds)
    .order('data_inicio', { ascending: true });

  if (turmasError) throw turmasError;

  const turmasByCourse = new Map<string, any[]>();
  for (const turma of turmas || []) {
    if (!turma?.curso_id) continue;
    turmasByCourse.set(turma.curso_id, [...(turmasByCourse.get(turma.curso_id) || []), turma]);
  }

  return (cursos || []).map((curso: any) => ({
    ...curso,
    turmasAbertas: turmasByCourse.get(curso.id) || [],
  }));
};

export const fetchPublicCourseById = async (courseId: string) => {
  const { data, error } = await supabase
    .from('cursos')
    .select(PUBLIC_COURSE_DETAIL_COLUMNS)
    .eq('id', courseId)
    .eq('status', 'ativo')
    .eq('publicar_site', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Curso não encontrado ou indisponível.');
  return data;
};

export const getCursoTurmasAbertas = (curso: any) =>
  Array.isArray(curso?.turmasAbertas) ? curso.turmasAbertas : [];

export const fetchOpenTurmasForCourse = async (courseId: string) => {
  const { data, error } = await supabase
    .from('turmas')
    .select(PUBLIC_TURMA_COLUMNS)
    .eq('curso_id', courseId)
    .eq('status', 'EM_ANDAMENTO')
    .eq('permitir_inscricoes_online', true)
    .order('data_inicio', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getPublicTurmaPoloOptions = (turmas: any[]) => {
  const seen = new Set<string>();
  return (turmas || [])
    .map(formatPublicTurmaPolo)
    .filter((label) => {
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
};

export const formatPublicTurmaPolo = (turma: any) => {
  const polo = toSingle(turma?.polos) || {};
  return [polo.nome, polo.cidade, polo.estado].filter(Boolean).join(' - ') || 'Polo a definir';
};

export const formatPublicTurmaInicio = (turma: any) => {
  if (!turma?.data_inicio) return 'Data a definir';
  const date = new Date(`${turma.data_inicio}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Data a definir';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};
