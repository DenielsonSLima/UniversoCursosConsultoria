import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { textMatchesSearch } from '../../../../lib/search';
import {
  alunoCourseAccessKeys,
  invalidateAlunoCourseAccessQueries,
} from '../../shared/aluno-course-access.queries';
import { alunoPerfilKeys, alunoPerfilService } from '../../perfil/perfil.service';
import { getTechnicalEnrollmentMissingFields } from '../../../shared/utils/technicalEnrollmentRequirements';
import {
  PUBLIC_ENROLLMENT_TURMA_STATUSES,
  isEligiblePublicTurmaStatus,
} from '../../../public/courseAvailability';
import type { CourseCatalogTab, EadProgressState } from '../cursosPage.types';
import {
  EAD_PENDING_STATUSES,
  ONLINE_CLASS_MODALITIES,
  RECEIVABLE_PENDING_STATUSES,
  getCourseEnrollmentAvailability,
  getEnrollmentRank,
  hasEadAccess,
  normalizeStatus,
} from '../cursosPage.utils';

const COURSE_PAGE_SIZE = 9;

export const useAlunoCoursesCatalog = (alunoId?: string) => {
  const queryClient = useQueryClient();
  const hasAlunoContext = Boolean(alunoId);
  const [activeTab, setActiveTab] = useState<CourseCatalogTab>('ead');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [coursePage, setCoursePage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const invalidateStudentCourseAccess = useCallback(() => {
    invalidateAlunoCourseAccessQueries(queryClient, alunoId);
  }, [alunoId, queryClient]);

  const { data: courses = [], isLoading, isError } = useQuery<any[]>({
    queryKey: alunoCourseAccessKeys.catalog(alunoId || ''),
    queryFn: async () => {
      const [coursesResult, matriculasResult, turmasOnlineResult] = await Promise.all([
        supabase.from('cursos').select('*').eq('status', 'ativo').order('nome', { ascending: true }),
        hasAlunoContext
          ? supabase
              .from('matriculas')
              .select('id, status, data_matricula, turma_id, turmas(id, curso_id, cursos(id, modalidade))')
              .eq('aluno_id', alunoId)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('turmas')
          .select(`
            id,
            curso_id,
            nome,
            data_inicio,
            vagas_totais,
            permitir_inscricoes_online,
            qtd_vagas_minima,
            bloquear_matriculas_apos_completar_vagas,
            data_inicio_inscricao,
            data_fim_inscricao,
            status,
            cursos!inner(id, modalidade),
            polos(nome, cidade, estado),
            matriculas(status)
          `)
          .in('status', [...PUBLIC_ENROLLMENT_TURMA_STATUSES])
          .eq('permitir_inscricoes_online', true)
          .in('cursos.modalidade', ['LIVRE', 'ESPECIALIZACAO', 'TECNICO'])
          .order('data_inicio', { ascending: true }),
      ]);

      if (coursesResult.error) throw coursesResult.error;
      if (matriculasResult.error) throw matriculasResult.error;
      if (turmasOnlineResult.error) throw turmasOnlineResult.error;

      const allMatriculas = matriculasResult.data || [];
      const turmasByCourse = new Map<string, any[]>();
      const eligibleOnlineTurmas = (turmasOnlineResult.data || []).filter((turma: any) => {
        const curso = Array.isArray(turma?.cursos) ? turma.cursos[0] : turma?.cursos;
        return isEligiblePublicTurmaStatus(turma?.status, curso?.modalidade);
      });
      for (const turma of eligibleOnlineTurmas) {
        if (!turma?.curso_id) continue;
        turmasByCourse.set(turma.curso_id, [...(turmasByCourse.get(turma.curso_id) || []), turma]);
      }

      const pendingMatriculaIds = allMatriculas
        .filter((matricula: any) => EAD_PENDING_STATUSES.has(normalizeStatus(matricula.status)))
        .map((matricula: any) => matricula.id)
        .filter(Boolean);
      const pendingReceivableByMatricula = new Set<string>();
      if (pendingMatriculaIds.length > 0) {
        const { data: receivables = [], error: receivablesError } = await supabase
          .from('contas_receber')
          .select('matricula_id')
          .in('matricula_id', pendingMatriculaIds)
          .in('status', Array.from(RECEIVABLE_PENDING_STATUSES));
        if (receivablesError) throw receivablesError;
        for (const receivable of receivables) {
          if (receivable?.matricula_id) pendingReceivableByMatricula.add(receivable.matricula_id);
        }
      }

      const enrollmentByCourse = new Map<string, any>();
      for (const matricula of allMatriculas) {
        const turma = Array.isArray(matricula.turmas) ? matricula.turmas[0] : matricula.turmas;
        const curso = Array.isArray(turma?.cursos) ? turma.cursos[0] : turma?.cursos;
        const courseId = turma?.curso_id || curso?.id;
        if (!courseId) continue;
        const hasActivePendingReceivable = pendingReceivableByMatricula.has(matricula.id);
        const current = enrollmentByCourse.get(courseId);
        const currentRank = current ? getEnrollmentRank(current.status) : -1;
        const nextRank = getEnrollmentRank(matricula.status);
        const shouldReplace = !current
          || nextRank > currentRank
          || (nextRank === currentRank && nextRank === 2 && !current.hasActivePendingReceivable && hasActivePendingReceivable);
        if (shouldReplace) {
          enrollmentByCourse.set(courseId, {
            id: matricula.id,
            status: matricula.status,
            dataMatricula: matricula.data_matricula,
            turmaId: matricula.turma_id,
            hasActivePendingReceivable,
          });
        }
      }

      return (coursesResult.data || []).map((course: any) => {
        const modality = String(course.modalidade || '').toUpperCase();
        const onlineAvailability = ONLINE_CLASS_MODALITIES.has(modality)
          ? getCourseEnrollmentAvailability(turmasByCourse.get(course.id) || [])
          : null;
        return { ...course, alunoMatricula: enrollmentByCourse.get(course.id) || null, onlineAvailability };
      });
    },
  });

  const { data: technicalEnrollmentProfile, isLoading: loadingTechnicalEnrollmentProfile } = useQuery<any>({
    queryKey: alunoPerfilKeys.profile(alunoId || ''),
    queryFn: () => alunoPerfilService.getProfile(alunoId || ''),
    enabled: hasAlunoContext && !!alunoId,
  });
  const technicalEnrollmentMissingFields = useMemo(
    () => getTechnicalEnrollmentMissingFields(technicalEnrollmentProfile),
    [technicalEnrollmentProfile],
  );

  const currentTypeFilter = useMemo(() => {
    if (activeTab === 'live') return 'LIVRE';
    if (activeTab === 'especializacao') return 'ESPECIALIZACAO';
    if (activeTab === 'tecnico') return 'TECNICO';
    return 'EAD';
  }, [activeTab]);
  const availableCategories = useMemo(() => Array.from(new Set(courses
    .filter((course) => {
      const isEadCourse = course.modalidade?.toUpperCase() === 'EAD';
      return course.modalidade?.toUpperCase() === currentTypeFilter
        && (!isEadCourse || course.publicar_site !== false || hasEadAccess(course));
    })
    .map((course) => String(course.area || 'Outros').trim() || 'Outros')))
    .sort((a, b) => a.localeCompare(b, 'pt-BR')), [courses, currentTypeFilter]);
  const currentTabCourses = useMemo(() => courses
    .filter((course) => {
      const isEadCourse = course.modalidade?.toUpperCase() === 'EAD';
      return course.modalidade?.toUpperCase() === currentTypeFilter
        && textMatchesSearch(searchTerm, [course.nome, course.descricao, course.area])
        && (categoryFilter === 'todas' || String(course.area || 'Outros').trim() === categoryFilter)
        && (!isEadCourse || course.publicar_site !== false || hasEadAccess(course));
    })
    .sort((a, b) => {
      const compare = String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
      return sortDirection === 'asc' ? compare : -compare;
    }), [categoryFilter, courses, currentTypeFilter, searchTerm, sortDirection]);
  const totalCoursePages = Math.max(1, Math.ceil(currentTabCourses.length / COURSE_PAGE_SIZE));
  const currentPageCourses = useMemo(() => {
    const start = (coursePage - 1) * COURSE_PAGE_SIZE;
    return currentTabCourses.slice(start, start + COURSE_PAGE_SIZE);
  }, [coursePage, currentTabCourses]);
  const groupedCurrentPageCourses = useMemo(() => {
    const groups = new Map<string, any[]>();
    currentPageCourses.forEach((course) => {
      const key = String(course.area || 'Outros').trim() || 'Outros';
      groups.set(key, [...(groups.get(key) || []), course]);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [currentPageCourses]);

  useEffect(() => setCoursePage(1), [activeTab, categoryFilter, searchTerm, sortDirection]);
  useEffect(() => setCategoryFilter('todas'), [activeTab]);
  useEffect(() => {
    if (coursePage > totalCoursePages) setCoursePage(totalCoursePages);
  }, [coursePage, totalCoursePages]);

  const accessibleEadCourses = courses.filter((course) =>
    course.modalidade?.toUpperCase() === 'EAD' && hasEadAccess(course));
  const courseProgressQueries = useQueries({
    queries: accessibleEadCourses.map((course) => ({
      queryKey: ['ead-aluno-progresso', alunoId, course.id],
      enabled: hasAlunoContext && !!course.id,
      staleTime: 30_000,
      queryFn: async () => {
        if (!alunoId) throw new Error('Aluno não identificado para este contexto.');
        const { data, error } = await supabase.rpc('ead_get_aluno_progress', {
          p_aluno_id: alunoId,
          p_curso_id: course.id,
        });
        if (error) throw error;
        return data as EadProgressState;
      },
    })),
  });
  const progressByCourseId = useMemo(() => {
    const map = new Map<string, EadProgressState>();
    accessibleEadCourses.forEach((course, index) => {
      const data = courseProgressQueries[index]?.data as EadProgressState | undefined;
      if (data) map.set(course.id, data);
    });
    return map;
  }, [accessibleEadCourses, courseProgressQueries]);

  return {
    queryClient,
    hasAlunoContext,
    courses,
    isLoading,
    isError,
    invalidateStudentCourseAccess,
    loadingTechnicalEnrollmentProfile,
    technicalEnrollmentMissingFields,
    activeTab,
    setActiveTab,
    categoryFilter,
    setCategoryFilter,
    sortDirection,
    setSortDirection,
    coursePage,
    setCoursePage,
    searchTerm,
    setSearchTerm,
    availableCategories,
    currentTabCourses,
    totalCoursePages,
    groupedCurrentPageCourses,
    progressByCourseId,
  };
};
