import React, { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BookOpen,
  Calendar,
  CheckCircle,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileCheck2,
  GraduationCap,
  LayoutList,
  Image as ImageIcon,
  NotebookText,
  ScrollText,
  LockKeyhole,
  MonitorPlay,
  Pin,
  Shield,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getDocumentValidationUrl } from '../../shared/document-validation/document-validation.url';
import CursosPage from '../cursos/CursosPage';
import AlunoAtividadesExtraClasseTab from './components/AlunoAtividadesExtraClasseTab';
import {
  getStudentCourseAccessKey,
  getStudentPinnedCourseKeys,
  recordStudentCourseAccess,
  toggleStudentPinnedCourse,
  type StudentCourseAccessItem,
} from '../cursos/courseAccessHistory';

interface TurmasPageProps {
  alunoId: string;
  initialCourseId?: string | null;
  initialTurmaId?: string | null;
  onInitialSelectionConsumed?: () => void;
}

const ACCESS_STATUS = new Set(['ATIVO', 'CONCLUIDO']);
const MODALITY_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'EAD', label: 'EAD' },
  { id: 'TECNICO', label: 'Técnicos' },
  { id: 'LIVRE', label: 'Livres' },
  { id: 'ESPECIALIZACAO', label: 'Especializações' },
];
const MODALITY_ORDER = ['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'OUTROS'];
const MODALITY_LABELS: Record<string, string> = {
  EAD: 'Cursos EAD',
  TECNICO: 'Cursos Técnicos',
  LIVRE: 'Cursos Livres',
  ESPECIALIZACAO: 'Especializações',
  OUTROS: 'Outros cursos',
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return date.toLocaleDateString('pt-BR');
};

const getFormattedDuration = (min?: number) => {
  if (!min) return '';
  if (min % 60 === 0) return `${min / 60}h`;
  const hrs = Math.floor(min / 60);
  const rem = min % 60;
  return hrs > 0 ? `${hrs}h ${rem}min` : `${rem}min`;
};

const normalizePercent = (value: unknown) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const getProgressPercent = (progress?: any) =>
  normalizePercent(progress?.summary?.progressPercent ?? progress?.progressPercent ?? 0);

const getQuizScore = (progress?: any) => {
  const score = progress?.summary?.quizScore ?? progress?.quizScore;
  return score === null || score === undefined ? null : Number(score);
};

const getEadConteudos = (curso?: any) => {
  const conteudos = curso?.ead_config?.conteudos;
  return Array.isArray(conteudos) ? conteudos : [];
};

const isEadMatricula = (matricula?: any) =>
  String(matricula?.turmas?.cursos?.modalidade || '').toUpperCase() === 'EAD';

const hasEadAccess = (matricula?: any) =>
  ACCESS_STATUS.has(String(matricula?.status || '').toUpperCase());

const normalizeText = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const sanitizeCourseId = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null;
  return normalized;
};

const getMatriculaModalidade = (matricula?: any) => {
  const modalidade = String(matricula?.turmas?.cursos?.modalidade || '').toUpperCase();
  if (modalidade === 'EAD') return 'EAD';
  if (modalidade === 'TECNICO' || modalidade === 'TÉCNICO') return 'TECNICO';
  if (modalidade === 'LIVRE') return 'LIVRE';
  if (modalidade === 'ESPECIALIZACAO' || modalidade === 'ESPECIALIZAÇÃO') return 'ESPECIALIZACAO';
  return 'OUTROS';
};

const getMatriculaCourseKey = (matricula?: any) => {
  const turma = matricula?.turmas;
  const curso = turma?.cursos;
  if (!curso?.id) return '';

  return getStudentCourseAccessKey({
    cursoId: curso.id,
    turmaId: turma?.id || matricula?.turma_id || null,
  });
};

type TurmaDetailTab = 'resumo' | 'diario' | 'atividades' | 'notas' | 'estagio' | 'certificado';

const TurmasPage: React.FC<TurmasPageProps> = ({
  alunoId,
  initialCourseId,
  initialTurmaId,
  onInitialSelectionConsumed,
}) => {
  const queryClient = useQueryClient();
  const [selectedTurma, setSelectedTurma] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<TurmaDetailTab>('resumo');
  const [studyCourseId, setStudyCourseId] = useState<string | null>(null);
  const [hasConsumedInitialSelection, setHasConsumedInitialSelection] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalityFilter, setModalityFilter] = useState('todos');
  const [pinnedCourseKeys, setPinnedCourseKeys] = useState<string[]>([]);

  useEffect(() => {
    setPinnedCourseKeys(getStudentPinnedCourseKeys(alunoId));
  }, [alunoId]);

  const { data: matriculas = [], isLoading, isError } = useQuery<any[]>({
    queryKey: ['aluno-matriculas', alunoId],
    queryFn: async () => {
      const { data, error: fetchErr } = await supabase
        .from('matriculas')
        .select('*, turmas(*, cursos(*))')
        .eq('aluno_id', alunoId)
        .order('data_matricula', { ascending: false });

      if (fetchErr) throw fetchErr;
      return data || [];
    }
  });

  const matriculasLiberadas = useMemo(
    () => matriculas.filter(mat => ACCESS_STATUS.has(String(mat?.status || '').toUpperCase())),
    [matriculas]
  );

  const filteredMatriculas = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);

    return matriculasLiberadas.filter(mat => {
      const turma = mat.turmas;
      const curso = turma?.cursos;
      const modality = getMatriculaModalidade(mat);
      const matchesModality = modalityFilter === 'todos' || modality === modalityFilter;
      const searchable = normalizeText([
        curso?.nome,
        turma?.nome,
        turma?.codigo,
        curso?.area,
        curso?.modalidade,
      ].filter(Boolean).join(' '));

      return matchesModality && (!normalizedSearch || searchable.includes(normalizedSearch));
    });
  }, [matriculasLiberadas, modalityFilter, searchTerm]);

  const pinnedMatriculas = useMemo(() => {
    const byKey = new Map<string, any>();
    filteredMatriculas.forEach((mat) => {
      const key = getMatriculaCourseKey(mat);
      if (key) byKey.set(key, mat);
    });

    return pinnedCourseKeys
      .map((key) => byKey.get(key))
      .filter(Boolean);
  }, [filteredMatriculas, pinnedCourseKeys]);

  const unpinnedMatriculas = useMemo(() => {
    const pinnedSet = new Set(pinnedCourseKeys);
    return filteredMatriculas.filter((mat) => !pinnedSet.has(getMatriculaCourseKey(mat)));
  }, [filteredMatriculas, pinnedCourseKeys]);

  const groupedMatriculas = useMemo(() => {
    const groups = new Map<string, any[]>();
    unpinnedMatriculas.forEach(mat => {
      const modality = getMatriculaModalidade(mat);
      groups.set(modality, [...(groups.get(modality) || []), mat]);
    });

    return Array.from(groups.entries()).sort(
      ([a], [b]) => MODALITY_ORDER.indexOf(a) - MODALITY_ORDER.indexOf(b)
    );
  }, [unpinnedMatriculas]);

  const eadMatriculasComAcesso = useMemo(
    () => matriculasLiberadas.filter(mat => isEadMatricula(mat) && mat.turmas?.cursos?.id),
    [matriculasLiberadas]
  );

  const progressQueries = useQueries({
    queries: eadMatriculasComAcesso.map(mat => ({
      queryKey: ['aluno-turma-ead-progress', alunoId, mat.turmas.cursos.id],
      enabled: !!alunoId && !!mat.turmas?.cursos?.id,
      staleTime: 30_000,
      queryFn: async () => {
        const { data, error: progressErr } = await supabase.rpc('ead_get_aluno_progress', {
          p_aluno_id: alunoId,
          p_curso_id: mat.turmas.cursos.id,
        });
        if (progressErr) throw progressErr;
        return data;
      }
    }))
  });

  const progressByMatricula = useMemo(() => {
    const map = new Map<string, any>();
    eadMatriculasComAcesso.forEach((mat, index) => {
      map.set(mat.id, progressQueries[index]?.data || null);
    });
    return map;
  }, [eadMatriculasComAcesso, progressQueries]);

  useEffect(() => {
    if (hasConsumedInitialSelection) return;
    if (!matriculas.length) return;
    if (!initialCourseId && !initialTurmaId) return;

    const targetCourseId = sanitizeCourseId(initialCourseId);
    const targetTurmaId = sanitizeCourseId(initialTurmaId);

    let targetMatricula = null;

    if (targetTurmaId) {
      targetMatricula = matriculas.find((mat) => {
        const turma = mat.turmas;
        const turmaId = turma?.id || mat.turma_id;
        return sanitizeCourseId(turmaId) === targetTurmaId;
      }) || null;
    }

    if (!targetMatricula && targetCourseId) {
      const candidates = matriculas.filter((mat) => sanitizeCourseId(mat.turmas?.cursos?.id) === targetCourseId);
      targetMatricula =
        candidates.find((mat) => String(mat?.status || '').toUpperCase() === 'ATIVO')
        || candidates[0]
        || null;
    }

    if (targetMatricula) {
      recordMatriculaCourseAccess(targetMatricula);
      setSelectedTurma(targetMatricula);
      setDetailTab('resumo');
    }

    setHasConsumedInitialSelection(true);
    onInitialSelectionConsumed?.();
  }, [
    hasConsumedInitialSelection,
    initialCourseId,
    initialTurmaId,
    matriculas,
    onInitialSelectionConsumed,
  ]);

  const selectedCurso = selectedTurma?.turmas?.cursos;
  const selectedIsEad = isEadMatricula(selectedTurma);
  const selectedProgress = selectedTurma ? progressByMatricula.get(selectedTurma.id) : null;
  const selectedProgressPercent = getProgressPercent(selectedProgress);
  const selectedConteudos = getEadConteudos(selectedCurso);
  const selectedCompletedIds = Array.isArray(selectedProgress?.progress?.completedContentIds)
    ? selectedProgress.progress.completedContentIds
    : Array.isArray(selectedProgress?.completedContentIds)
      ? selectedProgress.completedContentIds
    : [];

  const { data: certificados = [], isLoading: loadingCertificados } = useQuery<any[]>({
    queryKey: ['aluno-certificados-curso', alunoId, selectedCurso?.id],
    enabled: !!alunoId && !!selectedCurso?.id,
    queryFn: async () => {
      const { data, error: certErr } = await supabase
        .from('certificados_academicos')
        .select('id, status, modalidade, data_inscricao, data_conclusao, nota_final, codigo_validacao, certificado_numero, emitido_em, created_at')
        .eq('aluno_id', alunoId)
        .eq('curso_id', selectedCurso.id)
        .eq('status', 'FINALIZADO')
        .not('codigo_validacao', 'is', null)
        .order('data_conclusao', { ascending: false });

      if (certErr) throw certErr;
      return data || [];
    }
  });

  const certificadoAtual = certificados[0] || null;

  const { data: disciplines = [], isLoading: loadingDisciplines } = useQuery<any[]>({
    queryKey: ['turma-disciplinas', selectedTurma?.turmas?.id],
    enabled: !!selectedTurma?.turmas?.id && !selectedIsEad,
    queryFn: async () => {
      const { data, error: descErr } = await supabase
        .from('turmas_disciplinas')
        .select('*, disciplinas(*)')
        .eq('turma_id', selectedTurma?.turmas?.id);
      
      if (descErr) throw descErr;
      return data || [];
    }
  });

  const selectedTurmaId = selectedTurma?.turmas?.id || null;

  const { data: aulasPorTurma = [] } = useQuery<any[]>({
    queryKey: ['aluno-turma-aulas', selectedTurmaId],
    enabled: !!selectedTurmaId && !!selectedTurma && !selectedIsEad,
    queryFn: async () => {
      const { data, error: aulasErr } = await supabase
        .from('aulas_turma')
        .select('id, titulo, carga_horaria, data_aula, disciplina_id')
        .eq('turma_id', selectedTurmaId)
        .order('created_at', { ascending: true });

      if (aulasErr) throw aulasErr;
      return data || [];
    }
  });

  const { data: frequencias = [] } = useQuery<any[]>({
    queryKey: ['aluno-turma-frequencia', selectedTurmaId, alunoId],
    enabled: !!selectedTurmaId && !!alunoId && !selectedIsEad,
    queryFn: async () => {
      const { data, error: freqErr } = await supabase
        .from('diario_frequencia')
        .select('disciplina_id, aula_id, status')
        .eq('turma_id', selectedTurmaId)
        .eq('aluno_id', alunoId);

      if (freqErr) throw freqErr;
      return data || [];
    }
  });

  const { data: notasRaw = [] } = useQuery<any[]>({
    queryKey: ['aluno-turma-notas', selectedTurmaId, alunoId],
    enabled: !!selectedTurmaId && !!alunoId && !selectedIsEad,
    queryFn: async () => {
      const { data, error: notasErr } = await supabase
        .from('diario_notas')
        .select('*')
        .eq('turma_id', selectedTurmaId)
        .eq('aluno_id', alunoId);

      if (notasErr) throw notasErr;
      return data || [];
    }
  });

  const { data: estagios = [] } = useQuery<any[]>({
    queryKey: ['aluno-turma-estagios', selectedTurmaId, alunoId],
    enabled: !!selectedTurmaId && !!alunoId && !selectedIsEad,
    queryFn: async () => {
      const { data, error: estagioErr } = await supabase
        .from('matriculas_estagios')
        .select('*, disciplinas(nome)')
        .eq('turma_id', selectedTurmaId)
        .eq('aluno_id', alunoId)
        .order('created_at', { ascending: false });

      if (estagioErr) throw estagioErr;
      return data || [];
    }
  });

  const disciplinasMap = useMemo(() => {
    const map = new Map<string, { nome: string; cargaHoraria: number; professor: string }>();
    disciplines.forEach((disciplina) => {
      const disciplinaRecord = disciplina?.disciplinas;
      const disciplinaId = disciplina?.disciplina_id || disciplina?.disciplinaId;
      if (!disciplinaId) return;
      map.set(disciplinaId, {
        nome: disciplinaRecord?.nome || 'Disciplina',
        cargaHoraria: Number(disciplinaRecord?.carga_horaria || 60),
        professor: disciplina.professor_nome || 'A definir',
      });
    });
    return map;
  }, [disciplines]);

  const aulasByDisciplina = useMemo(() => {
    const map = new Map<string, any[]>();
    aulasPorTurma.forEach((aula: any) => {
      const disciplinaId = aula.disciplina_id;
      if (!disciplinaId) return;
      map.set(disciplinaId, [...(map.get(disciplinaId) || []), aula]);
    });
    return map;
  }, [aulasPorTurma]);

  const attendanceByDisciplina = useMemo(() => {
    const map = new Map<string, { presentes: number; faltas: number; total: number }>();
    disciplinasMap.forEach((_value, disciplinaId) => {
      map.set(disciplinaId, { presentes: 0, faltas: 0, total: 0 });
    });

    frequencias.forEach((freq: any) => {
      const disciplinaId = freq.disciplina_id;
      if (!disciplinaId) return;
      const current = map.get(disciplinaId) || { presentes: 0, faltas: 0, total: 0 };
      const status = String(freq.status || '').toUpperCase();
      current.total += 1;
      if (status === 'P') current.presentes += 1;
      else if (status === 'F') current.faltas += 1;
      map.set(disciplinaId, current);
    });

    return map;
  }, [disciplinasMap, frequencias]);

  const notasByDisciplina = useMemo(() => {
    const map = new Map<string, any>();
    notasRaw.forEach((nota: any) => {
      const disciplinaId = nota.disciplina_id;
      if (!disciplinaId) return;
      map.set(disciplinaId, nota);
    });
    return map;
  }, [notasRaw]);

  const attendanceByAula = useMemo(() => {
    const map = new Map<string, string>();
    frequencias.forEach((freq: any) => {
      if (!freq?.aula_id) return;
      map.set(String(freq.aula_id), String(freq.status || '').toUpperCase());
    });
    return map;
  }, [frequencias]);

  useEffect(() => {
    const channel = supabase
      .channel(`aluno_matriculas_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matriculas', filter: `aluno_id=eq.${alunoId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['aluno-matriculas', alunoId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ATIVO':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
            <CheckCircle size={10} /> Ativa
          </span>
        );
      case 'CONCLUIDO':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-blue-100">
            <Award size={10} /> Concluida
          </span>
        );
      case 'PENDENTE':
      case 'AGUARDANDO_PAGAMENTO':
      case 'AGUARDANDO_CONFIRMACAO':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-100">
            <Clock size={10} /> Pagamento pendente
          </span>
        );
      case 'TRANCADO':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-100">
            <AlertCircle size={10} /> Trancada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-slate-100">
            Inativa
          </span>
        );
    }
  };

  const getCourseAccessItem = (matricula: any): StudentCourseAccessItem | null => {
    const turma = matricula?.turmas;
    const curso = turma?.cursos;
    if (!curso?.id) return null;

    return {
      cursoId: curso.id,
      turmaId: turma?.id || matricula?.turma_id || null,
      cursoNome: curso.nome || turma?.nome || 'Curso',
      turmaNome: turma?.nome || null,
      modalidade: curso.modalidade || getMatriculaModalidade(matricula),
      imagemUrl: curso.imagem_url || null,
    };
  };

  const recordMatriculaCourseAccess = (matricula: any) => {
    const item = getCourseAccessItem(matricula);
    if (item) recordStudentCourseAccess(alunoId, item);
  };

  const openEadCourse = (matricula: any) => {
    const cursoId = matricula?.turmas?.cursos?.id;
    if (!cursoId) return;
    recordMatriculaCourseAccess(matricula);
    setStudyCourseId(cursoId);
  };

  const openTurma = (matricula: any) => {
    recordMatriculaCourseAccess(matricula);
    setSelectedTurma(matricula);
    setDetailTab('resumo');
  };

  const formatNumeric = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '--';
    return parsed.toFixed(2).replace('.00', '');
  };

  const calcAttendancePercent = (disciplinaId: string) => {
    const resumo = attendanceByDisciplina.get(disciplinaId);
    if (!resumo || resumo.total <= 0) return null;
    return Math.round((resumo.presentes / resumo.total) * 100);
  };

  const getDisciplinasParaTabs = useMemo(() => {
    return disciplines.map((disciplina: any) => {
      const disciplinaId = disciplina?.disciplinas?.id || disciplina?.disciplina_id;
      const disciplinaNome = disciplina?.disciplinas?.nome || 'Disciplina';
      const cargaHoraria = Number(disciplina?.disciplinas?.carga_horaria || 0);
      const professor = disciplina?.professor_nome || 'A definir';
      const notas = disciplinaId ? notasByDisciplina.get(disciplinaId) : null;
      const attendance = disciplinaId ? (attendanceByDisciplina.get(disciplinaId) || { presentes: 0, faltas: 0, total: 0 }) : { presentes: 0, faltas: 0, total: 0 };
      const frequency = disciplinaId ? calcAttendancePercent(disciplinaId) : null;

      return {
        id: disciplinaId,
        nome: disciplinaNome,
        cargaHoraria,
        professor,
        notas,
        attendance,
        frequency,
      };
    }).filter((item: { id: string | null | undefined; }) => item.id);
  }, [attendanceByDisciplina, disciplinasMap, notasByDisciplina, disciplines]);

  const togglePinnedMatricula = (matricula: any) => {
    const item = getCourseAccessItem(matricula);
    if (!item) return;

    recordStudentCourseAccess(alunoId, item);
    setPinnedCourseKeys(toggleStudentPinnedCourse(alunoId, getStudentCourseAccessKey(item)));
  };

  const renderCourseCard = (mat: any) => {
    const turma = mat.turmas;
    const curso = turma?.cursos;
    const isEad = isEadMatricula(mat);
    const progress = isEad ? progressByMatricula.get(mat.id) : null;
    const percent = isEad
      ? getProgressPercent(progress)
      : normalizePercent(mat.progresso || (String(mat.status || '').toUpperCase() === 'CONCLUIDO' ? 100 : 0));
    const image = curso?.imagem_url;
    const locked = isEad && !hasEadAccess(mat);
    const courseKey = getMatriculaCourseKey(mat);
    const isPinned = courseKey ? pinnedCourseKeys.includes(courseKey) : false;

    return (
      <article
        key={mat.id}
        className={`relative overflow-hidden rounded-[1.5rem] border bg-white shadow-sm transition-all duration-300 hover:border-blue-400 hover:shadow-md ${
          isPinned ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-100'
        }`}
      >
        <button
          type="button"
          onClick={() => togglePinnedMatricula(mat)}
          className={`absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm backdrop-blur transition ${
            isPinned
              ? 'border-blue-200 bg-blue-600 text-white hover:bg-blue-700'
              : 'border-white/70 bg-white/90 text-slate-500 hover:border-blue-200 hover:text-blue-700'
          }`}
          title={isPinned ? 'Remover dos fixados' : 'Fixar no topo'}
          aria-label={isPinned ? 'Remover curso dos fixados' : 'Fixar curso no topo'}
        >
          <Pin size={15} fill={isPinned ? 'currentColor' : 'none'} />
        </button>

        <div className="aspect-[16/9] bg-slate-100">
          {image ? (
            <img
              src={image}
              alt={curso?.nome || turma?.nome || 'Curso'}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <ImageIcon size={34} />
            </div>
          )}
        </div>

        <div className="space-y-4 p-5">
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {getStatusBadge(mat.status)}
              {isPinned && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
                  <Pin size={10} fill="currentColor" /> Fixado
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded">
              {curso?.modalidade || 'Turma'}
            </span>
          </div>

          <div className="min-h-[76px]">
            <h3 className="line-clamp-2 text-base font-black leading-tight text-[#001a33]">
              {curso?.nome || turma?.nome || 'Curso'}
            </h3>
            <p className="mt-1 line-clamp-2 text-[11px] font-bold uppercase tracking-wider text-slate-450">
              {turma?.nome || 'Matricula vinculada'}
            </p>
          </div>

          <div className="space-y-2 text-[11px] font-bold text-slate-500">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-blue-500" />
              <span>Inscricao: {formatDate(mat.data_matricula || mat.created_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-slate-400" />
              <span>{isEad ? `${curso?.carga_horaria || 0}h` : `Turno: ${turma?.turno || 'Geral'}`}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span>Conclusao</span>
              <span className="text-blue-600">{locked ? 'bloqueado' : `${percent}%`}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${locked ? 'bg-slate-300' : 'bg-blue-600'}`}
                style={{ width: locked ? '0%' : `${percent}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => isEad && !locked && curso?.id ? openEadCourse(mat) : openTurma(mat)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-50 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-blue-600 hover:text-white"
          >
            <span>{locked ? 'Ver status' : isEad ? 'Acessar curso' : 'Abrir curso'}</span>
            {isEad && !locked ? <MonitorPlay size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </article>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 bg-red-50 text-red-700 rounded-3xl border border-red-150 flex items-center gap-3">
        <ShieldAlert size={24} />
        <div>
          <p className="font-bold">Não consegui carregar seus cursos</p>
          <p className="text-xs">Atualize a página ou tente novamente em instantes.</p>
        </div>
      </div>
    );
  }

  if (studyCourseId) {
    return (
      <CursosPage
        alunoId={alunoId}
        initialCourseId={studyCourseId}
        onExitCourse={() => setStudyCourseId(null)}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col justify-between gap-4 mb-6 lg:flex-row lg:items-end">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <GraduationCap className="text-blue-600" />
            Meus Cursos
          </h2>
          <p className="text-xs text-slate-400 font-medium">Acesse seus cursos matriculados, progresso e certificados</p>
        </div>

        {!selectedTurma && (
          <div className="relative w-full lg:w-80">
            <input
              type="text"
              placeholder="Buscar em meus cursos..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-xs font-bold text-slate-700 shadow-sm outline-none transition-all focus:border-blue-500"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        )}
      </div>

      {!selectedTurma ? (
        matriculasLiberadas.length === 0 ? (
          <div className="bg-white p-12 rounded-[2rem] border border-slate-100 shadow-sm text-center">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={28} />
            </div>
            <h3 className="text-base font-bold text-[#001a33]">Nenhum curso liberado</h3>
            <p className="text-slate-550 text-xs mt-1 max-w-sm mx-auto">
              Quando a compra for confirmada, o curso aparecerá aqui com acesso direto à sala de aprendizagem.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
              {MODALITY_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setModalityFilter(filter.id)}
                  className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    modalityFilter === filter.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {filteredMatriculas.length === 0 ? (
              <div className="rounded-[2rem] border border-slate-100 bg-white p-10 text-center shadow-sm">
                <p className="text-sm font-black text-[#001a33]">Nenhum curso encontrado</p>
                <p className="mt-1 text-xs font-bold text-slate-400">Ajuste a busca ou selecione outro tipo de curso.</p>
              </div>
            ) : (
              <>
                {pinnedMatriculas.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-700">
                        <Pin size={14} fill="currentColor" />
                        Cursos fixados
                      </h3>
                      <span className="h-px flex-1 bg-blue-100" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">{pinnedMatriculas.length}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                      {pinnedMatriculas.map(renderCourseCard)}
                    </div>
                  </section>
                )}

                {groupedMatriculas.map(([modality, items]) => (
                  <section key={modality} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xs font-black uppercase tracking-widest text-[#001a33]">
                        {MODALITY_LABELS[modality] || MODALITY_LABELS.OUTROS}
                      </h3>
                      <span className="h-px flex-1 bg-slate-100" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{items.length}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                      {items.map(renderCourseCard)}
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>
        )
      ) : (
        <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
          <button 
            onClick={() => setSelectedTurma(null)}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 uppercase tracking-widest group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar para meus cursos</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 border-b border-slate-100 pb-6">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 aspect-[16/10] lg:aspect-auto lg:min-h-[150px]">
              {selectedCurso?.imagem_url ? (
                <img
                  src={selectedCurso.imagem_url}
                  alt={selectedCurso.nome}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-300">
                  <ImageIcon size={34} />
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between gap-4 min-w-0">
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {getStatusBadge(selectedTurma.status)}
                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Carga: {selectedCurso?.carga_horaria || 0}h
                  </span>
                  <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Inscricao: {formatDate(selectedTurma.data_matricula || selectedTurma.created_at)}
                  </span>
                </div>
                <h3 className="text-xl font-black text-[#001a33] leading-tight">{selectedCurso?.nome || selectedTurma.turmas?.nome}</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  Turma: {selectedTurma.turmas?.nome || 'Matrícula vinculada'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Progresso do curso</span>
                  <span className="text-blue-600">{selectedIsEad ? `${selectedProgressPercent}%` : 'Acompanhe pela grade'}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: selectedIsEad ? `${selectedProgressPercent}%` : '0%' }} />
                </div>
              </div>

              {selectedIsEad && selectedCurso?.id && hasEadAccess(selectedTurma) && (
                <button
                  onClick={() => selectedTurma && openEadCourse(selectedTurma)}
                  className="inline-flex w-full sm:w-max items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700"
                >
                  <MonitorPlay size={14} />
                  Entrar na sala do curso
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
            {(selectedIsEad
              ? [
                { id: 'resumo', label: 'Aulas', icon: <BookOpen size={14} /> },
                { id: 'certificado', label: 'Certificado', icon: <Award size={14} /> },
              ]
              : [
                { id: 'resumo', label: 'Resumo', icon: <LayoutList size={14} /> },
                { id: 'diario', label: 'Diário', icon: <ScrollText size={14} /> },
                { id: 'atividades', label: 'Atividades', icon: <ClipboardCheck size={14} /> },
                { id: 'notas', label: 'Notas', icon: <NotebookText size={14} /> },
                { id: 'estagio', label: 'Estágio', icon: <Shield size={14} /> },
                ...(certificados.length > 0 ? [{ id: 'certificado', label: 'Certificado', icon: <Award size={14} /> }] : []),
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDetailTab(tab.id as TurmaDetailTab)}
                className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${
                  detailTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {detailTab === 'certificado' ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-6">
              {loadingCertificados ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : certificadoAtual?.status === 'FINALIZADO' && certificadoAtual.codigo_validacao ? (
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div>
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                      <Award size={24} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Certificado liberado</p>
                    <h4 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Curso concluido e certificado emitido</h4>
                    <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                      Codigo de validacao: <span className="font-mono text-blue-700">{certificadoAtual.codigo_validacao}</span>
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Conclusao: {formatDate(certificadoAtual.data_conclusao)} | Nota final: {certificadoAtual.nota_final ?? getQuizScore(selectedProgress) ?? '--'}
                    </p>
                  </div>

                  <button
                    onClick={() => window.open(getDocumentValidationUrl(certificadoAtual.codigo_validacao), '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800"
                  >
                    <FileCheck2 size={14} />
                    Validar QR/Codigo
                  </button>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <LockKeyhole size={22} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Certificado indisponivel</p>
                    <h4 className="mt-1 text-base font-black text-[#001a33]">Conclua o curso e seja aprovado na avaliacao final.</h4>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      O certificado aparecerá aqui automaticamente após a conclusão e aprovação.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : selectedIsEad || detailTab === 'resumo' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 bg-blue-50/40 border border-blue-50 rounded-2xl space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Conclusao</p>
                  <p className="text-2xl font-black text-blue-700">{selectedProgressPercent}%</p>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${selectedProgressPercent}%` }} />
                  </div>
                </div>
                <div className="p-5 bg-emerald-50/40 border border-emerald-50 rounded-2xl space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nota EAD</p>
                  <p className="text-2xl font-black text-emerald-700">
                    {getQuizScore(selectedProgress) ?? '--'} <span className="text-xs font-normal text-slate-400">/ 100</span>
                  </p>
                  <p className="text-[9px] text-slate-500 font-medium mt-2">A prova final libera o certificado.</p>
                </div>
                <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                  <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Aulas concluidas</p>
                  <p className="text-2xl font-black text-slate-700">{selectedCompletedIds.length} / {selectedConteudos.length}</p>
                  <p className="text-[9px] text-slate-500 font-medium mt-2">Conteudos marcados como lidos.</p>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-blue-500" />
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Aulas do curso</h4>
                </div>

                <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                  {selectedConteudos.length === 0 ? (
                    <div className="p-5 bg-slate-50/50 text-xs font-bold text-slate-500">
                      Nenhuma aula cadastrada neste curso.
                    </div>
                  ) : selectedConteudos.map((conteudo: any, index: number) => {
                    const done = selectedCompletedIds.includes(conteudo.id);
                    return (
                      <button
                        key={conteudo.id || index}
                        onClick={() => selectedTurma && openEadCourse(selectedTurma)}
                        className="w-full p-4 bg-slate-50/50 hover:bg-blue-50/60 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-left text-xs font-medium transition-colors"
                      >
                        <div className="space-y-0.5">
                          <p className="font-bold text-[#001a33]">{index + 1}. {conteudo.titulo || `Aula ${index + 1}`}</p>
                          <p className="text-[10px] text-slate-400">
                            {conteudo.etapa || 'Modulo'} | {conteudo.duracaoMinutos ? getFormattedDuration(conteudo.duracaoMinutos) : conteudo.duracao || 'Carga não informada'}
                          </p>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${done ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {done ? 'Concluida' : 'Pendente'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : detailTab === 'atividades' && selectedTurmaId ? (
            <AlunoAtividadesExtraClasseTab alunoId={alunoId} turmaId={selectedTurmaId} />
          ) : detailTab === 'diario' ? (
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                <ScrollText size={16} className="text-blue-500" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Presença por disciplina</h4>
              </div>

              {getDisciplinasParaTabs.length === 0 ? (
                <div className="border border-slate-100 rounded-2xl bg-slate-50/50 p-5 text-xs font-bold text-slate-500">
                  Nenhuma disciplina vinculada para mostrar diário.
                </div>
              ) : (
                <div className="space-y-4">
                  {getDisciplinasParaTabs.map((disciplina: any) => {
                    const aulasDaDisciplina = aulasByDisciplina.get(disciplina.id) || [];
                    return (
                      <div
                        key={disciplina.id}
                        className="rounded-2xl border border-slate-100 bg-white p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h5 className="font-bold text-sm text-[#001a33]">{disciplina.nome}</h5>
                          <span className="text-[10px] bg-slate-50 text-slate-500 px-3 py-1 rounded-full uppercase tracking-widest border border-slate-100">
                            {disciplina.frequency === null
                              ? 'Frequência não lançada'
                              : `${disciplina.frequency}%`}
                          </span>
                        </div>

                        {aulasDaDisciplina.length === 0 ? (
                          <p className="text-xs text-slate-500">Nenhuma aula registrada nesta disciplina.</p>
                        ) : (
                          <div className="border border-slate-100 rounded-xl divide-y divide-slate-100">
                            {aulasDaDisciplina.map((aula: any) => {
                              const attendance = attendanceByAula.get(String(aula.id));
                              return (
                                <div
                                  key={aula.id}
                                  className="p-3 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                                >
                                  <p className="font-semibold text-[#001a33]">
                                    {aula.titulo || 'Aula sem título'}
                                  </p>
                                  <div className="flex flex-wrap gap-2 text-slate-500">
                                    <span>{aula.data_aula || 'sem data'}</span>
                                    <span className="px-2 py-1 rounded-full bg-slate-50 uppercase text-[10px] font-black tracking-wider">
                                      {attendance === 'P' ? 'presente' : attendance === 'F' ? 'falta' : 'sem chamada'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : detailTab === 'notas' ? (
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                <NotebookText size={16} className="text-blue-500" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Notas por disciplina</h4>
              </div>

              {getDisciplinasParaTabs.length === 0 ? (
                <div className="border border-slate-100 rounded-2xl bg-slate-50/50 p-5 text-xs font-bold text-slate-500">
                  Nenhuma disciplina vinculada para exibir notas.
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                  <div className="grid grid-cols-8 gap-2 px-3 py-2 text-[10px] uppercase tracking-widest font-black text-slate-400 bg-slate-50">
                    <span className="col-span-2">Disciplina</span>
                    <span>P</span><span>TI</span><span>TG</span><span>S</span><span>CQ</span><span>O</span><span>Final</span>
                  </div>
                  {getDisciplinasParaTabs.map((disciplina: any) => {
                    const nota = disciplina.notas || {};
                    const rec = Number(nota.nota_rec);
                    const final = Number.isFinite(Number(nota.media_final))
                      ? Number(nota.media_final)
                      : Number.isFinite(Number(nota.nota_rec))
                        ? (Number(nota.nota_rec) || 0)
                        : null;

                    return (
                      <div key={`${disciplina.id}-notas`} className="grid grid-cols-8 gap-2 p-3 text-xs items-center">
                        <p className="col-span-2 font-bold text-[#001a33]">{disciplina.nome}</p>
                        <span className="text-center">{formatNumeric(nota.nota_p)}</span>
                        <span className="text-center">{formatNumeric(nota.nota_ti)}</span>
                        <span className="text-center">{formatNumeric(nota.nota_tg)}</span>
                        <span className="text-center">{formatNumeric(nota.nota_s)}</span>
                        <span className="text-center">{formatNumeric(nota.nota_cq)}</span>
                        <span className="text-center">{formatNumeric(nota.nota_o)}</span>
                        <span className="text-center font-black text-blue-600">{final === null ? '--' : final.toFixed(2)}</span>
                        {Number.isFinite(rec) && (
                          <span className="col-span-8 text-[10px] text-slate-500 mt-1">
                            REC: {formatNumeric(nota.nota_rec)} | frequência de diário: {disciplina.frequency ?? '--'}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : detailTab === 'estagio' ? (
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-blue-500" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Situação do estágio</h4>
              </div>

              {estagios.length === 0 ? (
                <div className="border border-slate-100 rounded-2xl bg-slate-50/50 p-5 text-xs font-bold text-slate-500">
                  Nenhuma informação de estágio disponível.
                </div>
              ) : (
                <div className="grid gap-3">
                  {estagios.map((avaliacao: any) => {
                    const disciplinaNome = avaliacao?.disciplinas?.nome || 'Estágio';
                    const freq = Number(avaliacao.frequencia_estagio);
                    const mediaFinal = Number(avaliacao.nota_final);
                    const aprovado = Number.isFinite(mediaFinal) && Number.isFinite(freq)
                      ? mediaFinal >= 6 && freq >= 75
                      : null;

                    return (
                      <div key={avaliacao.id || `${disciplinaNome}-${avaliacao.created_at}`} className="bg-white border border-slate-100 rounded-2xl p-4">
                        <div className="flex justify-between gap-3 items-start">
                          <div>
                            <p className="text-sm font-black text-[#001a33]">{disciplinaNome}</p>
                            <p className="text-xs text-slate-500 mt-1">Instrutor: {avaliacao.instrutor_nome || 'Não definido'}</p>
                            <p className="text-[10px] text-slate-500 mt-1">
                              Data: {avaliacao.data_avaliacao ? formatDate(avaliacao.data_avaliacao) : 'não informada'}
                            </p>
                          </div>

                          <span className={`rounded-full text-[9px] font-black uppercase tracking-wider px-2.5 py-1 border ${
                            aprovado ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100'
                          }`}>
                            {aprovado === null ? 'Pendente' : aprovado ? 'Aprovado' : 'Reprovado'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase">Frequência</p>
                            <p className="font-black text-slate-700">{formatNumeric(avaliacao.frequencia_estagio)}%</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase">Comportamento</p>
                            <p className="font-black text-slate-700">{formatNumeric(avaliacao.nota_comportamento)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase">Registros</p>
                            <p className="font-black text-slate-700">{formatNumeric(avaliacao.nota_registros)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase">Técnica</p>
                            <p className="font-black text-slate-700">{formatNumeric(avaliacao.nota_tecnicas)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-blue-500" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Grades e disciplinas do periodo</h4>
              </div>

              {loadingDisciplines ? (
                <div className="flex justify-center items-center py-6">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : disciplines.length === 0 ? (
                <div className="border border-slate-100 rounded-2xl bg-slate-50/50 p-5 text-xs font-bold text-slate-500">
                  Nenhuma disciplina vinculada a esta turma.
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                  {disciplines.map((d: any) => (
                    <div key={d.id} className="p-4 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs font-medium">
                      <div className="space-y-0.5">
                        <p className="font-bold text-[#001a33]">{d.disciplinas?.nome || 'Disciplina'}</p>
                        <p className="text-[10px] text-slate-400">
                          Carga: {d.disciplinas?.carga_horaria || 60}h | Docente: {d.professor_nome || 'A definir'}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Status</p>
                          <p className={`font-bold ${d.concluida ? 'text-emerald-600' : 'text-blue-600'}`}>
                            {d.concluida ? 'Concluida' : 'Em andamento'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TurmasPage;
