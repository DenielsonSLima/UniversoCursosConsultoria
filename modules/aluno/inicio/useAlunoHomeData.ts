import { isHomeEnrollmentVisible } from '../shared/ead-temporary-access';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { formatAcademicSessions, groupAcademicClassMeetings } from '../../../lib/academicClassMeetings';
import { canAccessLibraryDocumentAsAluno } from '../biblioteca/libraryAccess';
import {
  getStudentCourseAccessKey,
  getStudentPinnedCourseKeys,
  getStudentRecentCourses,
  recordStudentCourseAccess,
  toggleStudentPinnedCourse,
  type StudentCourseAccessItem,
} from '../cursos/courseAccessHistory';
import { alunoCourseAccessKeys } from '../shared/aluno-course-access.queries';
import useAlunoMobileLayout from '../hooks/useAlunoMobileLayout';

type InicioUpcomingEvent = {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  detail: string;
};

const toLocalDateKey = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const normalizeCourseModality = (value?: string | null) => String(value || 'OUTROS').toUpperCase();

const getCourseModalityLabel = (value?: string | null) => {
  const modality = normalizeCourseModality(value);
  if (modality === 'TECNICO' || modality === 'TÉCNICO') return 'Técnico';
  if (modality === 'ESPECIALIZACAO' || modality === 'ESPECIALIZAÇÃO') return 'Especialização';
  if (modality === 'LIVRE') return 'Livre';
  if (modality === 'EAD') return 'EAD';
  return 'Curso';
};

const getCourseModalityClasses = (value?: string | null) => {
  const modality = normalizeCourseModality(value);
  if (modality === 'TECNICO' || modality === 'TÉCNICO') return 'border-violet-100 bg-violet-50 text-violet-700';
  if (modality === 'EAD') return 'border-blue-100 bg-blue-50 text-blue-700';
  if (modality === 'LIVRE') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (modality === 'ESPECIALIZACAO' || modality === 'ESPECIALIZAÇÃO') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-slate-100 bg-slate-50 text-slate-600';
};

export interface InicioPageProps {
  alunoId: string;
  canViewCalendar: boolean;
  onNavigate: (module: string) => void;
  onOpenCourse?: (courseId: string, turmaId: string | null, targetModule: 'turmas' | 'cursos') => void;
}

export const useAlunoHomeData = ({ alunoId, canViewCalendar, onNavigate, onOpenCourse }: InicioPageProps) => {
  const isMobileLayout = useAlunoMobileLayout();
  // Conta também a matrícula técnica pendente para o aluno enxergar que já
  // está registrado, sem liberar conteúdo acadêmico antes da ativação.
  const { data: enrollmentSummary = { visible: 0, pendingTechnical: 0 }, isLoading: loadingEnrollmentSummary, isError: enrollmentSummaryError, refetch: refetchEnrollmentSummary } = useQuery({
    queryKey: alunoCourseAccessKeys.homeEnrollmentCount(alunoId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const [releasedResult, pendingResult] = await Promise.all([
        supabase
          .from('matriculas')
          .select('id,status,acesso_temporario_ate,turmas(cursos(modalidade))')
          .eq('aluno_id', alunoId),
        supabase.rpc('get_aluno_matriculas_tecnicas_pendentes_secure'),
      ]);
      if (releasedResult.error) throw releasedResult.error;
      if (pendingResult.error) throw pendingResult.error;
      const pendingTechnical = Array.isArray(pendingResult.data)
        ? pendingResult.data.length
        : 0;
      const released = (releasedResult.data || []).filter((row: any) => isHomeEnrollmentVisible(row)).length;
      return { visible: released + pendingTechnical, pendingTechnical };
    }
  });
  const matriculasCount = enrollmentSummaryError ? null : enrollmentSummary.visible;

  // 2. Informações de matrícula para contexto de acesso
  const { data: matriculas = [], isLoading: loadingMatriculas, isError: matriculasError, refetch: refetchMatriculas } = useQuery<any[]>({
    queryKey: alunoCourseAccessKeys.homeEnrollments(alunoId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select('*, turmas(*, cursos(*))')
        .eq('aluno_id', alunoId);
      if (error) throw error;
      return (data || []).filter(isHomeEnrollmentVisible);
    }
  });

  const activeTurmaIds = matriculas.map((m) => m.turma_id).filter(Boolean);
  const activeCursoIds = Array.from(new Set(matriculas.map((m) => m.turmas?.cursos?.id).filter(Boolean)));
  const activePoloIds = Array.from(new Set(matriculas.map((m) => m.polo_id).filter(Boolean)));
  const [recentCourseAccess, setRecentCourseAccess] = useState<StudentCourseAccessItem[]>([]);
  const [pinnedCourseKeys, setPinnedCourseKeys] = useState<string[]>([]);

  useEffect(() => {
    setRecentCourseAccess(getStudentRecentCourses(alunoId));
    setPinnedCourseKeys(getStudentPinnedCourseKeys(alunoId));
  }, [alunoId]);

  const enrolledCourseItems = useMemo<StudentCourseAccessItem[]>(() => (
    matriculas
      .map((matricula) => {
        const turma = Array.isArray(matricula?.turmas) ? matricula.turmas[0] : matricula?.turmas;
        const curso = Array.isArray(turma?.cursos) ? turma.cursos[0] : turma?.cursos;
        if (!curso?.id) return null;

        return {
          cursoId: curso.id,
          turmaId: turma?.id || matricula?.turma_id || null,
          cursoNome: curso.nome || turma?.nome || 'Curso',
          turmaNome: turma?.nome || null,
          modalidade: curso.modalidade || null,
          imagemUrl: curso.imagem_url || null,
          accessedAt: matricula?.data_matricula || matricula?.created_at || '',
        } as StudentCourseAccessItem;
      })
      .filter(Boolean) as StudentCourseAccessItem[]
  ), [matriculas]);

  const quickAccessCourses = useMemo(() => {
    const byKey = new Map<string, StudentCourseAccessItem>();
    enrolledCourseItems.forEach((item) => byKey.set(getStudentCourseAccessKey(item), item));
    recentCourseAccess.forEach((item) => {
      const key = getStudentCourseAccessKey(item);
      const enrolledItem = byKey.get(key);
      if (!enrolledItem) return;
      byKey.set(key, { ...item, ...enrolledItem, accessedAt: item.accessedAt || enrolledItem.accessedAt });
    });

    const pinnedSet = new Set(pinnedCourseKeys);
    const pinnedItems = pinnedCourseKeys
      .map((key) => byKey.get(key))
      .filter(Boolean) as StudentCourseAccessItem[];
    const recentItems = recentCourseAccess
      .map((item) => byKey.get(getStudentCourseAccessKey(item)))
      .filter(Boolean)
      .filter((item): item is StudentCourseAccessItem => Boolean(item))
      .filter((item) => !pinnedSet.has(getStudentCourseAccessKey(item)));
    const fallbackItems = enrolledCourseItems.filter((item) => {
      const key = getStudentCourseAccessKey(item);
      return !pinnedSet.has(key) && !recentItems.some((recent) => getStudentCourseAccessKey(recent) === key);
    });

    const usedKeys = new Set<string>();
    return [...pinnedItems, ...recentItems, ...fallbackItems].filter((item) => {
      const key = getStudentCourseAccessKey(item);
      if (usedKeys.has(key)) return false;
      usedKeys.add(key);
      return true;
    }).slice(0, 3);
  }, [enrolledCourseItems, pinnedCourseKeys, recentCourseAccess]);

  const refreshCourseAccessState = () => {
    setRecentCourseAccess(getStudentRecentCourses(alunoId));
    setPinnedCourseKeys(getStudentPinnedCourseKeys(alunoId));
  };

  const handleOpenQuickAccessCourse = (course: StudentCourseAccessItem) => {
    recordStudentCourseAccess(alunoId, course);
    refreshCourseAccessState();

    if (normalizeCourseModality(course.modalidade) === 'EAD' && onOpenCourse) {
      onOpenCourse(course.cursoId, course.turmaId || null, 'cursos');
      return;
    }

    if (onOpenCourse) {
      onOpenCourse(course.cursoId, course.turmaId || null, 'turmas');
      return;
    }

    onNavigate('turmas');
  };

  const handleTogglePinnedCourse = (course: StudentCourseAccessItem) => {
    const key = getStudentCourseAccessKey(course);
    if (!recentCourseAccess.some((item) => getStudentCourseAccessKey(item) === key)) {
      recordStudentCourseAccess(alunoId, course);
    }
    setPinnedCourseKeys(toggleStudentPinnedCourse(alunoId, key));
    setRecentCourseAccess(getStudentRecentCourses(alunoId));
  };

  const { data: activeTeachers = [] } = useQuery<any[]>({
    queryKey: ['aluno-inicio-professores', activeTurmaIds.join(',')],
    queryFn: async () => {
      if (activeTurmaIds.length === 0) return [];
      const { data, error } = await supabase
        .from('turmas_disciplinas')
        .select('professor_id')
        .in('turma_id', activeTurmaIds);
      if (error) throw error;
      return data || [];
    },
    enabled: matriculas.length > 0
  });

  const { data: turmaDisciplinas = [] } = useQuery<any[]>({
    queryKey: ['aluno-inicio-turma-disciplinas', activeTurmaIds.join(',')],
    queryFn: async () => {
      if (activeTurmaIds.length === 0) return [];
      const { data, error } = await supabase
        .from('turmas_disciplinas')
        .select('turma_id, disciplina_id, created_at')
        .in('turma_id', activeTurmaIds);
      if (error) throw error;
      return data || [];
    },
    enabled: activeTurmaIds.length > 0
  });

  const activeTeacherIds = Array.from(new Set(activeTeachers.map((item) => item.professor_id).filter(Boolean)));

  const accessContext = {
    activeTurmaIds,
    activeCursoIds,
    activePoloIds,
    activeTeacherIds,
    turmaDisciplinas
  };

  // 3. Count de documentos realmente disponíveis ao aluno no contexto atual
  const { data: bibliotecaCount = 0, isError: bibliotecaCountError, refetch: refetchBibliotecaCount } = useQuery<number>({
    queryKey: [
      'aluno-biblioteca-count',
      alunoId,
      activeTurmaIds.join(','),
      activeCursoIds.join(','),
      activePoloIds.join(','),
      activeTeacherIds.join(',')
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('biblioteca_documentos')
        .select('*');

      if (error) throw error;

      return (data || []).filter((doc) => canAccessLibraryDocumentAsAluno(doc, accessContext)).length;
    },
    enabled: !loadingMatriculas
  });

  // Query to count open chats
  const { data: chatsCount = 0, isError: chatsCountError, refetch: refetchChatsCount } = useQuery({
    queryKey: ['aluno-chats-count', alunoId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('comunicacao_chats')
        .select('*', { count: 'exact', head: true })
        .eq('remetente_id', alunoId)
        .eq('status', 'pendente');

      if (error) throw error;
      return count || 0;
    }
  });

  const { data: financeiroResumo, isLoading: loadingFinanceiro, isError: financeiroError, refetch: refetchFinanceiro } = useQuery<any>({
    queryKey: alunoCourseAccessKeys.homeFinanceSummary(alunoId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select(`
          id,
          descricao,
          valor,
          status,
          data_vencimento,
          asaas_invoice_url,
          turmas!left(nome, cursos!left(nome, modalidade))
        `)
        .eq('cliente_id', alunoId)
        .not('status', 'in', '("CANCELADO","ESTORNADO")')
        .order('data_vencimento', { ascending: true });

      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const openItems = (data || []).filter((item) => ['PENDENTE', 'VENCIDO'].includes(String(item.status || '').toUpperCase()));
      const overdueItems = openItems.filter((item) => {
        const due = item.data_vencimento ? new Date(`${item.data_vencimento}T00:00:00`) : null;
        return String(item.status || '').toUpperCase() === 'VENCIDO' || (due && due < today);
      });
      const nextPayment = openItems.find((item) => {
        const due = item.data_vencimento ? new Date(`${item.data_vencimento}T00:00:00`) : null;
        return due && due >= today;
      }) || openItems[0] || null;

      return {
        nextPayment,
        overdueCount: overdueItems.length,
        overdueTotal: overdueItems.reduce((sum, item) => sum + Number(item.valor || 0), 0),
        openTotal: openItems.reduce((sum, item) => sum + Number(item.valor || 0), 0),
      };
    }
  });

  const { data: proximosEventos = [], isLoading: loadingProximosEventos, isError: proximosEventosError, refetch: refetchProximosEventos } = useQuery<InicioUpcomingEvent[]>({
    queryKey: ['aluno-inicio-proximos-eventos', alunoId, activeTurmaIds.join(',')],
    enabled: !!alunoId && !loadingMatriculas,
    queryFn: async () => {
      if (activeTurmaIds.length === 0) return [];

      const today = toLocalDateKey(new Date());
      const { data, error } = await supabase
        .from('aulas_turma')
        .select('id, titulo, carga_horaria, sessao, data_aula, turma_id, disciplina_id')
        .in('turma_id', activeTurmaIds)
        .not('data_aula', 'is', null)
        .gte('data_aula', today)
        .order('data_aula', { ascending: true })
        .limit(12);

      if (error) throw error;

      const aulas = groupAcademicClassMeetings((data || []) as any[]).slice(0, 6);
      const disciplinaIds = [...new Set(aulas.map((aula: any) => aula.disciplina_id).filter(Boolean))];
      const [{ data: disciplinasData, error: disciplinasError }, { data: configsData, error: configsError }] = await Promise.all([
        disciplinaIds.length > 0
          ? supabase.from('disciplinas').select('id, nome').in('id', disciplinaIds)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from('turmas_disciplinas')
          .select('turma_id, disciplina_id, professor_nome')
          .in('turma_id', activeTurmaIds),
      ]);

      if (disciplinasError) throw disciplinasError;
      if (configsError) throw configsError;

      const disciplinaNames = new Map((disciplinasData || []).map((disciplina: any) => [disciplina.id, disciplina.nome]));
      const turmaById = new Map(matriculas.map((matricula) => [matricula.turma_id, matricula.turmas || {}]));
      const configMap = new Map(
        (configsData || []).map((config: any) => [`${config.turma_id}-${config.disciplina_id}`, config])
      );

      return aulas.map((aula: any) => {
        const turma = turmaById.get(aula.turma_id) || {};
        const turmaNome = turma.nome || 'Turma';
        const disciplinaNome = disciplinaNames.get(aula.disciplina_id) || 'Disciplina';
        const config = configMap.get(`${aula.turma_id}-${aula.disciplina_id}`) || {};
        const cargaHoraria = Number(aula.carga_horaria || 0);
        const sessoesLabel = formatAcademicSessions(aula.sessoes);

        return {
          id: `aula-${aula.id}`,
          date: aula.data_aula,
          title: aula.titulo || disciplinaNome,
          subtitle: `${disciplinaNome} - ${turmaNome}`,
          detail: [
            config.professor_nome ? `Prof. ${config.professor_nome}` : null,
            cargaHoraria > 0 ? `${cargaHoraria}h` : null,
            sessoesLabel,
            turma.turno ? `Turno ${turma.turno}` : null,
          ].filter(Boolean).join(' • '),
        };
      });
    }
  });

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Sem vencimento';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };
  const hasHomeDataError = enrollmentSummaryError || matriculasError || bibliotecaCountError || chatsCountError || financeiroError || proximosEventosError;
  const retryHomeData = () => {
    void Promise.all([
      refetchEnrollmentSummary(),
      refetchMatriculas(),
      refetchBibliotecaCount(),
      refetchChatsCount(),
      refetchFinanceiro(),
      refetchProximosEventos(),
    ]);
  };

  return { bibliotecaCount, bibliotecaCountError, chatsCount, chatsCountError, enrollmentSummary, enrollmentSummaryError, financeiroError, financeiroResumo, formatCurrency, formatDate, getCourseModalityClasses, getCourseModalityLabel, handleOpenQuickAccessCourse, handleTogglePinnedCourse, hasHomeDataError, isMobileLayout, loadingEnrollmentSummary, loadingMatriculas, loadingFinanceiro, loadingProximosEventos, matriculasCount, matriculasError, proximosEventos, proximosEventosError, quickAccessCourses, retryHomeData, pinnedCourseKeys };
};
