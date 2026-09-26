import { supabase } from '../../../../lib/supabase';
import { formatMatricula } from '../../../../lib/academicUtils';
import type {
  SecretariaAlunoResumo, SecretariaContext, SecretariaDocumentoId,
  SecretariaMatriculaResumo, SecretariaModuloResumo, SecretariaTurmaResumo,
} from './secretaria-documentos.types';

const normalizeSearchTerm = (term: string) =>
  term.trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ');

const normalizeCursoModalidadeFilter = (modalidade?: string | null) => {
  const normalized = String(modalidade || '').trim().toUpperCase();
  if (normalized === 'ESPECIALIZACAO') {
    return ['ESPECIALIZACAO', 'SUPERIOR'] as const;
  }
  return normalized ? [normalized] as const : [];
};

const searchSecretariaStudents = async (
  poloId: string,
  term: string,
  documento?: SecretariaDocumentoId,
) => {
  const safeTerm = normalizeSearchTerm(term);
  if (safeTerm.length < 2) return [];

  const { data, error } = await supabase.rpc('search_secretaria_students_secure', {
    p_polo_id: poloId,
    p_search: safeTerm,
    p_limit: 20,
    p_documento: documento || null,
  });
  if (error) throw error;

  return (Array.isArray(data) ? data : []).map((aluno: any) => ({
    ...aluno,
    matricula: aluno.matricula_id
      ? formatMatricula(
          aluno.matricula_id,
          aluno.matricula_data,
          aluno.turma_polo_id || poloId,
        )
      : '',
    cursoNome: aluno.curso_nome || '',
    turmaNome: aluno.turma_nome || '',
    turmaCodigo: aluno.turma_codigo || '',
    matriculaStatus: aluno.matricula_status || '',
  }));
};

export const getSecretariaContext = (): SecretariaContext => ({
  userId:
    window.sessionStorage.getItem('logged_user_id') ||
    'f1111111-1111-1111-1111-111111111111',
  poloId:
    window.sessionStorage.getItem('current_polo_id') ||
    window.sessionStorage.getItem('active_polo_id') ||
    '44444444-4444-4444-4444-444444444444',
});

export const secretariaDocumentosCatalogo = {
  async searchAlunos(
    poloId: string,
    term: string,
    documento?: SecretariaDocumentoId,
  ): Promise<SecretariaAlunoResumo[]> {
    const alunos = await searchSecretariaStudents(poloId, term, documento);
    return alunos.map((aluno: any) => ({
      id: aluno.id,
      nome: aluno.nome,
      cpf: aluno.cpf_cnpj,
      email: aluno.email,
      telefone: aluno.telefone,
      fotoUrl: aluno.foto_url,
      matricula: aluno.matricula,
      cursoNome: aluno.cursoNome,
      turmaNome: aluno.turmaNome,
      turmaCodigo: aluno.turmaCodigo,
      matriculaStatus: aluno.matriculaStatus,
    }));
  },

  async searchAlunosDetalhados(
    poloId: string,
    term: string,
    documento?: SecretariaDocumentoId,
  ): Promise<any[]> {
    return searchSecretariaStudents(poloId, term, documento);
  },

  async getMatriculas(
    alunoId: string,
    poloId: string,
    technicalOnly: boolean,
    completedOnly = false,
    activeEnrollmentOnly = false,
    activeTurmaOnly = false,
    enrollmentStatuses: string[] = [],
    internshipOnly = false
  ): Promise<SecretariaMatriculaResumo[]> {
    let query = supabase
      .from('matriculas')
      .select('id, status, data_matricula, turma_id, turmas!inner(id, nome, codigo, status, polo_id, cursos!inner(id, nome, modalidade))')
      .eq('aluno_id', alunoId)
      .or(`polo_id.eq.${poloId},polo_id.is.null`, { foreignTable: 'turmas' });

    if (technicalOnly) query = query.eq('turmas.cursos.modalidade', 'TECNICO');
    if (activeEnrollmentOnly) query = query.in('status', ['ATIVO', 'PENDENTE', 'EM_ANDAMENTO']);
    if (activeTurmaOnly) query = query.eq('turmas.status', 'EM_ANDAMENTO');
    if (enrollmentStatuses.length) query = query.in('status', enrollmentStatuses);
    if (completedOnly) query = query.eq('status', 'CONCLUIDO');

    const { data, error } = await query.order('data_matricula', { ascending: false });
    if (error) throw error;

    let eligibleRows = data || [];
    if (internshipOnly && eligibleRows.length) {
      const turmaIds = [...new Set(eligibleRows.map((matricula: any) => matricula.turma_id).filter(Boolean))];
      const { data: estagios, error: estagiosError } = await supabase
        .from('matriculas_estagios')
        .select('aluno_id, turma_id')
        .eq('aluno_id', alunoId)
        .in('turma_id', turmaIds);
      if (estagiosError) throw estagiosError;
      const turmasComEstagio = new Set((estagios || []).map((estagio: any) => estagio.turma_id));
      eligibleRows = eligibleRows.filter((matricula: any) => turmasComEstagio.has(matricula.turma_id));
    }

    return eligibleRows.map((matricula: any) => ({
      id: matricula.id,
      status: matricula.status,
      dataMatricula: matricula.data_matricula || null,
      turmaId: matricula.turma_id,
      turmaNome: matricula.turmas?.nome || '',
      turmaCodigo: matricula.turmas?.codigo || '',
      cursoId: matricula.turmas?.cursos?.id || '',
      cursoNome: matricula.turmas?.cursos?.nome || '',
      modalidade: matricula.turmas?.cursos?.modalidade || '',
      poloId: matricula.turmas?.polo_id || poloId,
    }));
  },

  async getTurmas(
    poloId: string,
    technicalOnly: boolean,
    activeTurmaOnly = false,
    internshipOnly = false,
    modalidadeFilter?: string | null
  ): Promise<SecretariaTurmaResumo[]> {
    let query = supabase
      .from('turmas')
      .select('id, nome, codigo, turno, status, cursos!inner(id, nome, modalidade)')
      .or(`polo_id.eq.${poloId},polo_id.is.null`)
      .order('nome', { ascending: true });

    if (technicalOnly) query = query.eq('cursos.modalidade', 'TECNICO');
    const modalidades = normalizeCursoModalidadeFilter(
      modalidadeFilter || (technicalOnly ? 'TECNICO' : '')
    );
    if (modalidades.length > 1) {
      query = query.in('cursos.modalidade', modalidades);
    } else if (modalidades.length === 1) {
      query = query.eq('cursos.modalidade', modalidades[0]);
    }
    if (activeTurmaOnly) query = query.eq('status', 'EM_ANDAMENTO');

    const { data, error } = await query;
    if (error) throw error;

    let turmas = data || [];
    const internshipCounts = new Map<string, number>();
    if (internshipOnly && turmas.length) {
      const { data: estagios, error: estagiosError } = await supabase
        .from('matriculas_estagios')
        .select('turma_id, aluno_id')
        .in('turma_id', turmas.map((turma: any) => turma.id));
      if (estagiosError) throw estagiosError;
      const turmaIds = new Set((estagios || []).map((estagio: any) => estagio.turma_id));
      const alunosPorTurma = new Map<string, Set<string>>();
      (estagios || []).forEach((estagio: any) => {
        const alunos = alunosPorTurma.get(estagio.turma_id) || new Set<string>();
        alunos.add(estagio.aluno_id);
        alunosPorTurma.set(estagio.turma_id, alunos);
      });
      alunosPorTurma.forEach((alunos, turmaId) => internshipCounts.set(turmaId, alunos.size));
      turmas = turmas.filter((turma: any) => turmaIds.has(turma.id));
    }
    const activeEnrollmentCounts = new Map<string, number>();
    if (!internshipOnly && turmas.length) {
      const { data: activeEnrollments, error: activeEnrollmentsError } = await supabase
        .from('matriculas')
        .select('turma_id')
        .in('turma_id', turmas.map((turma: any) => turma.id))
        .in('status', ['ATIVO', 'PENDENTE', 'EM_ANDAMENTO']);
      if (activeEnrollmentsError) throw activeEnrollmentsError;
      (activeEnrollments || []).forEach((enrollment: any) => {
        activeEnrollmentCounts.set(
          enrollment.turma_id,
          (activeEnrollmentCounts.get(enrollment.turma_id) || 0) + 1
        );
      });
    }

    return turmas.map((turma: any) => ({
      id: turma.id,
      nome: turma.nome,
      codigo: turma.codigo,
      cursoId: turma.cursos?.id || '',
      cursoNome: turma.cursos?.nome || '',
      modalidade: turma.cursos?.modalidade || '',
      turno: turma.turno,
      status: turma.status,
      totalAlunos: internshipOnly
        ? internshipCounts.get(turma.id) || 0
        : activeEnrollmentCounts.get(turma.id) || 0,
    }));
  },

  async getTurmaModulos(turmaId: string): Promise<SecretariaModuloResumo[]> {
    const { data, error } = await supabase
      .from('turmas_disciplinas')
      .select('disciplinas!inner(modulos!inner(id, nome, created_at))')
      .eq('turma_id', turmaId);
    if (error) throw error;

    const modulesById = new Map<string, SecretariaModuloResumo>();
    (data || []).forEach((item: any) => {
      const modulo = item.disciplinas?.modulos;
      if (!modulo?.id || modulesById.has(modulo.id)) return;
      modulesById.set(modulo.id, {
        id: modulo.id,
        nome: modulo.nome || 'Módulo',
        ordem: new Date(modulo.created_at || 0).getTime(),
      });
    });

    return [...modulesById.values()].sort((a, b) => {
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  },

};
