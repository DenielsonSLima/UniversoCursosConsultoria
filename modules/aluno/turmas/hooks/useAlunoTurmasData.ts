import { useEffect, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { alunoCourseAccessKeys } from '../../shared/aluno-course-access.queries';
import type {
  AulaTurmaAluno,
  CertificadoAluno,
  FrequenciaAluno,
  MatriculaAluno,
  ProgressDisplayState,
  QueryDisplayState,
  ResultadoDiarioAluno,
  TurmaDisciplinaAluno,
} from '../turmas.types';
import {
  buildDisciplineSummaries,
  calculateAcademicProgress,
  getMatriculaModalidade,
  getProgressPercent,
  hasTechnicalAcademicAccess,
  isEadMatricula,
  isPortalEnrollmentVisible,
} from '../turmas.utils';
import { useAlunoInternships } from './useAlunoInternships';

interface TechnicalAcademicData {
  disciplines: TurmaDisciplinaAluno[];
  results: ResultadoDiarioAluno[];
  progress: number;
}

const toError = (error: unknown) => error instanceof Error ? error : null;

const ensureOwnResults = (data: unknown, alunoId: string) => {
  const rows = (Array.isArray(data) ? data : []) as ResultadoDiarioAluno[];
  if (rows.some((row) => row.aluno_id !== alunoId)) {
    throw new Error('A consulta acadêmica retornou dados fora do escopo do aluno.');
  }
  return rows;
};

const toQueryState = (query: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}): QueryDisplayState => ({
  isLoading: query.isLoading,
  isError: query.isError,
  error: toError(query.error),
  refetch: query.refetch,
});

export const useAlunoTurmasData = (alunoId: string, selectedMatricula: MatriculaAluno | null) => {
  const queryClient = useQueryClient();
  const selectedTurmaId = selectedMatricula?.turmas?.id || selectedMatricula?.turma_id || null;
  const selectedIsEad = isEadMatricula(selectedMatricula);

  const matriculasQuery = useQuery<MatriculaAluno[]>({
    queryKey: alunoCourseAccessKeys.enrollments(alunoId),
    enabled: Boolean(alunoId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select('*, turmas(*, cursos(*))')
        .eq('aluno_id', alunoId)
        .order('data_matricula', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MatriculaAluno[];
    },
  });

  const matriculas = matriculasQuery.data || [];
  const matriculasLiberadas = useMemo(
    () => matriculas.filter(isPortalEnrollmentVisible),
    [matriculas],
  );
  const eadMatriculas = useMemo(
    () => matriculasLiberadas.filter((item) => isEadMatricula(item) && item.turmas?.cursos?.id),
    [matriculasLiberadas],
  );
  const technicalMatriculas = useMemo(
    () => matriculasLiberadas.filter((item) =>
      getMatriculaModalidade(item) === 'TECNICO'
      && hasTechnicalAcademicAccess(item)
      && (item.turmas?.id || item.turma_id),
    ),
    [matriculasLiberadas],
  );
  const selectedIsTechnical = getMatriculaModalidade(selectedMatricula) === 'TECNICO';
  const selectedHasAcademicAccess = !selectedIsTechnical || hasTechnicalAcademicAccess(selectedMatricula);

  const eadProgressQueries = useQueries({
    queries: eadMatriculas.map((item) => ({
      queryKey: ['aluno-turma-ead-progress', alunoId, item.turmas?.cursos?.id, item.status],
      enabled: Boolean(alunoId && item.turmas?.cursos?.id),
      staleTime: 30_000,
      queryFn: async () => {
        const { data, error } = await supabase.rpc('ead_get_aluno_progress', {
          p_aluno_id: alunoId,
          p_curso_id: item.turmas?.cursos?.id,
        });
        if (error) throw error;
        return data as Record<string, any>;
      },
    })),
  });

  const technicalAcademicQueries = useQueries({
    queries: technicalMatriculas.map((item) => {
      const turmaId = item.turmas?.id || item.turma_id || '';
      return {
        queryKey: ['aluno-turma-technical-academic', alunoId, item.id, turmaId, item.status],
        enabled: Boolean(alunoId && turmaId),
        staleTime: 30_000,
        queryFn: async (): Promise<TechnicalAcademicData> => {
          const { data: disciplineData, error: disciplineError } = await supabase
            .from('turmas_disciplinas')
            .select(`
              *, disciplinas(*),
              periodo_letivo:periodos_letivos!turmas_disciplinas_periodo_letivo_id_fkey(
                id, nome, ordem, status, data_inicio, data_fim
              )
            `)
            .eq('turma_id', turmaId);
          if (disciplineError) throw disciplineError;
          const disciplines = (disciplineData || []) as unknown as TurmaDisciplinaAluno[];
          const disciplineIds = disciplines
            .map((discipline) => discipline.disciplinas?.id || discipline.disciplina_id)
            .filter((id): id is string => Boolean(id));
          const { data: resultData, error: resultError } = await supabase.rpc(
            'get_aluno_diario_resultados',
            { p_turma_id: turmaId, p_disciplina_ids: disciplineIds },
          );
          if (resultError) throw resultError;
          const resultRows = ensureOwnResults(resultData, alunoId);

          const byDiscipline = new Map<string, ResultadoDiarioAluno>();
          resultRows.forEach((result) => {
            if (result?.disciplina_id) byDiscipline.set(result.disciplina_id, result);
          });
          return {
            disciplines,
            results: resultRows,
            progress: calculateAcademicProgress(disciplines, byDiscipline),
          };
        },
      };
    }),
  });

  const progressByMatricula = useMemo(() => {
    const map = new Map<string, number>();
    eadMatriculas.forEach((item, index) => {
      map.set(item.id, getProgressPercent(eadProgressQueries[index]?.data || null));
    });
    technicalMatriculas.forEach((item, index) => {
      const technicalData = technicalAcademicQueries[index]?.data as TechnicalAcademicData | undefined;
      const progress = technicalData?.progress;
      if (progress !== undefined) map.set(item.id, progress);
    });
    return map;
  }, [eadMatriculas, eadProgressQueries, technicalAcademicQueries, technicalMatriculas]);

  const progressStateByMatricula = useMemo(() => {
    const map = new Map<string, ProgressDisplayState>();
    eadMatriculas.forEach((item, index) => {
      const query = eadProgressQueries[index];
      map.set(item.id, { isLoading: query?.isLoading ?? false, isError: query?.isError ?? false });
    });
    technicalMatriculas.forEach((item, index) => {
      const query = technicalAcademicQueries[index];
      map.set(item.id, { isLoading: query?.isLoading ?? false, isError: query?.isError ?? false });
    });
    return map;
  }, [eadMatriculas, eadProgressQueries, technicalAcademicQueries, technicalMatriculas]);

  const selectedTechnicalQuery = selectedMatricula && selectedIsTechnical && selectedHasAcademicAccess
    ? technicalAcademicQueries[technicalMatriculas.findIndex((item) => item.id === selectedMatricula.id)]
    : null;
  const selectedTechnicalData = selectedTechnicalQuery?.data as TechnicalAcademicData | undefined;

  const selectedEadProgress = selectedMatricula && selectedIsEad
    ? eadProgressQueries[eadMatriculas.findIndex((item) => item.id === selectedMatricula.id)]?.data || null
    : null;

  const certificatesQuery = useQuery<CertificadoAluno[]>({
    queryKey: ['aluno-certificados-matricula', alunoId, selectedMatricula?.id, selectedTurmaId],
    enabled: Boolean(
      alunoId && selectedMatricula?.id && selectedTurmaId && selectedHasAcademicAccess,
    ),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('certificados_academicos')
        .select('id, matricula_id, turma_id, status, data_conclusao, nota_final, codigo_validacao')
        .eq('aluno_id', alunoId)
        .eq('matricula_id', selectedMatricula!.id)
        .eq('turma_id', selectedTurmaId!)
        .eq('status', 'FINALIZADO')
        .not('codigo_validacao', 'is', null)
        .order('data_conclusao', { ascending: false });
      if (error) throw error;
      return (data || []) as CertificadoAluno[];
    },
  });

  const disciplinesQuery = useQuery<TurmaDisciplinaAluno[]>({
    queryKey: ['turma-disciplinas', selectedTurmaId],
    enabled: Boolean(selectedTurmaId && !selectedIsEad && !selectedIsTechnical && selectedHasAcademicAccess),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turmas_disciplinas')
        .select(`
          *, disciplinas(*),
          periodo_letivo:periodos_letivos!turmas_disciplinas_periodo_letivo_id_fkey(
            id, nome, ordem, status, data_inicio, data_fim
          )
        `)
        .eq('turma_id', selectedTurmaId!);
      if (error) throw error;
      return (data || []) as unknown as TurmaDisciplinaAluno[];
    },
  });
  const disciplines = selectedIsTechnical
    ? selectedTechnicalData?.disciplines || []
    : disciplinesQuery.data || [];
  const disciplineIds = useMemo(
    () => disciplines
      .map((item) => item.disciplinas?.id || item.disciplina_id)
      .filter((id): id is string => Boolean(id)),
    [disciplines],
  );

  const classesQuery = useQuery<AulaTurmaAluno[]>({
    queryKey: ['aluno-turma-aulas', selectedTurmaId],
    enabled: Boolean(selectedTurmaId && !selectedIsEad && selectedHasAcademicAccess),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aulas_turma')
        .select('id, titulo, carga_horaria, data_aula, disciplina_id, sessao')
        .eq('turma_id', selectedTurmaId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as AulaTurmaAluno[];
    },
  });

  const attendanceQuery = useQuery<FrequenciaAluno[]>({
    queryKey: ['aluno-turma-frequencia', selectedTurmaId, alunoId],
    enabled: Boolean(selectedTurmaId && alunoId && !selectedIsEad && selectedHasAcademicAccess),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('diario_frequencia')
        .select('disciplina_id, aula_id, status')
        .eq('turma_id', selectedTurmaId!)
        .eq('aluno_id', alunoId);
      if (error) throw error;
      return (data || []) as FrequenciaAluno[];
    },
  });

  const resultsQuery = useQuery<ResultadoDiarioAluno[]>({
    queryKey: ['aluno-turma-resultados', selectedTurmaId, alunoId, disciplineIds],
    enabled: Boolean(
      selectedTurmaId
      && alunoId
      && !selectedIsEad
      && !selectedIsTechnical
      && selectedHasAcademicAccess
      && disciplineIds.length > 0,
    ),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('diario_notas')
        .select('*')
        .eq('turma_id', selectedTurmaId!)
        .eq('aluno_id', alunoId)
        .in('disciplina_id', disciplineIds);
      if (error) throw error;
      return (data || []) as ResultadoDiarioAluno[];
    },
  });
  const results = selectedIsTechnical
    ? selectedTechnicalData?.results || []
    : resultsQuery.data || [];
  const disciplinesState = selectedIsTechnical && selectedTechnicalQuery
    ? toQueryState(selectedTechnicalQuery)
    : toQueryState(disciplinesQuery);
  const resultsState = selectedIsTechnical && selectedTechnicalQuery
    ? toQueryState(selectedTechnicalQuery)
    : toQueryState(resultsQuery);

  const internshipDisciplines = useMemo(
    () => disciplines.filter((item) => (
      Number(item.disciplinas?.carga_horaria_estagio || 0) > 0
    )),
    [disciplines],
  );
  const internshipDisciplineIds = useMemo(
    () => internshipDisciplines
      .map((item) => item.disciplinas?.id || item.disciplina_id)
      .filter((id): id is string => Boolean(id)),
    [internshipDisciplines],
  );
  const hasInternship = selectedHasAcademicAccess
    && !disciplinesState.isLoading
    && !disciplinesState.isError
    && internshipDisciplineIds.length > 0;
  const internshipsQuery = useAlunoInternships({
    alunoId,
    turmaId: selectedTurmaId,
    disciplineIds: internshipDisciplineIds,
    enabled: Boolean(!selectedIsEad && hasInternship),
  });

  const resultsByDiscipline = useMemo(() => {
    const map = new Map<string, ResultadoDiarioAluno>();
    results.forEach((result) => {
      if (result.disciplina_id) map.set(result.disciplina_id, result);
    });
    return map;
  }, [results]);

  const attendanceByDiscipline = useMemo(() => {
    const map = new Map<string, { presentes: number; faltas: number; total: number }>();
    disciplineIds.forEach((id) => map.set(id, { presentes: 0, faltas: 0, total: 0 }));
    (attendanceQuery.data || []).forEach((item) => {
      if (!item.disciplina_id) return;
      const current = map.get(item.disciplina_id) || { presentes: 0, faltas: 0, total: 0 };
      const status = String(item.status || '').toUpperCase();
      current.total += 1;
      if (status === 'P') current.presentes += 1;
      if (status === 'F') current.faltas += 1;
      map.set(item.disciplina_id, current);
    });
    return map;
  }, [attendanceQuery.data, disciplineIds]);

  const disciplineSummaries = useMemo(
    () => buildDisciplineSummaries(disciplines, resultsByDiscipline, attendanceByDiscipline),
    [attendanceByDiscipline, disciplines, resultsByDiscipline],
  );

  useEffect(() => {
    if (!alunoId) return undefined;
    const channel = supabase
      .channel(`aluno_matriculas_realtime_${alunoId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matriculas', filter: `aluno_id=eq.${alunoId}`,
      }, () => queryClient.invalidateQueries({
        queryKey: alunoCourseAccessKeys.enrollments(alunoId),
        exact: true,
        refetchType: 'active',
      }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [alunoId, queryClient]);

  return {
    matriculas,
    matriculasLiberadas,
    matriculasState: toQueryState(matriculasQuery),
    progressByMatricula,
    progressStateByMatricula,
    selectedEadProgress,
    selectedTurmaId,
    selectedIsEad,
    selectedIsTechnical,
    selectedHasAcademicAccess,
    certificates: certificatesQuery.data || [],
    certificatesState: toQueryState(certificatesQuery),
    disciplines,
    disciplinesState,
    classes: classesQuery.data || [],
    classesState: toQueryState(classesQuery),
    attendance: attendanceQuery.data || [],
    attendanceState: toQueryState(attendanceQuery),
    results,
    resultsState,
    internships: internshipsQuery.data || [],
    internshipsState: toQueryState(internshipsQuery),
    internshipDisciplines,
    hasInternship,
    disciplineSummaries,
  };
};
