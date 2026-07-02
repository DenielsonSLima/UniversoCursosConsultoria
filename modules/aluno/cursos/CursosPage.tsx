import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { textMatchesSearch } from '../../../lib/search';
import { asaasIntegrationService } from '../../asaas/asaas.service';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { diplomaService } from '../../gestor/cadastros/modelos-documentos/diploma/diploma.service';
import CertificadoPreview from '../../gestor/secretaria/certificados/components/CertificadoPreview';
import { CertificadoAcademico } from '../../gestor/secretaria/certificados/certificados.types';
import {
  ArrowLeft,
  ArrowUpRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  ListChecks,
  Lock,
  Loader2,
  MapPin,
  MonitorPlay,
  Play,
  Printer,
  Search,
  ShieldCheck,
  X,
  Zap,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface CursosPageProps {
  alunoId?: string;
  initialCourseId?: string | null;
  onExitCourse?: () => void;
}

interface EadProgress {
  startedAt: number;
  completedContentIds: string[];
  completedActivityIds: string[];
  completedVideoIds: string[];
  activityAnswers: Record<string, string>;
  quizAnswers?: Record<string, number>;
  quizScore?: number;
  completedAt?: number;
  certificateId?: string;
}

interface EadProgressSummary {
  elapsedMinutes: number;
  minimumMinutes: number;
  progressPercent: number;
  allLessonsDone: boolean;
  allActivitiesDone: boolean;
  allVideosDone: boolean;
  minimumTimeDone: boolean;
  canTakeQuiz: boolean;
  quizScore?: string | number | null;
  quizPassed?: boolean;
  quizMinimumScore?: number;
  questionsTotal?: number;
  minimumQuestions?: number;
  quizRetryBlocked?: boolean;
  retryIntervalHours?: number;
  retryAvailableAt?: number | null;
  completedAt?: number | null;
  certificateId?: string | null;
}

interface EadProgressState {
  progress: EadProgress;
  summary: EadProgressSummary;
}

type LearningTab = 'video' | 'aulas' | 'prova' | 'certificado';

const emptyProgressState: EadProgressState = {
  progress: {
    startedAt: Date.now(),
    completedContentIds: [],
    completedActivityIds: [],
    completedVideoIds: [],
    activityAnswers: {},
    quizAnswers: {}
  },
  summary: {
    elapsedMinutes: 0,
    minimumMinutes: 0,
    progressPercent: 0,
    allLessonsDone: false,
    allActivitiesDone: false,
    allVideosDone: false,
    minimumTimeDone: false,
    canTakeQuiz: false,
    quizScore: null,
    quizPassed: false,
    quizMinimumScore: 70,
    questionsTotal: 0,
    minimumQuestions: 10,
    quizRetryBlocked: false,
    retryIntervalHours: 3,
    retryAvailableAt: null,
    completedAt: null,
    certificateId: null
  }
};

const EAD_ACCESS_STATUSES = new Set(['ATIVO', 'CONCLUIDO']);
const EAD_PENDING_STATUSES = new Set(['PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO']);
const RECEIVABLE_PENDING_STATUSES = new Set(['PENDENTE', 'VENCIDO']);
const ONLINE_CLASS_MODALITIES = new Set(['LIVRE', 'ESPECIALIZACAO', 'TECNICO']);
const BLOCKING_ENROLLMENT_STATUSES = new Set([
  'ATIVO',
  'CONCLUIDO',
  'PENDENTE',
  'AGUARDANDO_PAGAMENTO',
  'AGUARDANDO_CONFIRMACAO',
]);

const normalizeStatus = (status?: string | null) => String(status || '').toUpperCase();

const todayDate = () => new Date().toISOString().slice(0, 10);

const escapeCheckoutHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));

const formatDate = (value: string | null | undefined) => {
  if (!value) return '';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
};

const getBlockingMatriculasTotal = (turma: any) => {
  const matriculas = turma?.matriculas;
  if (!Array.isArray(matriculas)) return 0;
  return matriculas.filter((matricula: any) =>
    BLOCKING_ENROLLMENT_STATUSES.has(normalizeStatus(matricula?.status))
  ).length;
};

const getTurmaUnavailabilityReason = (turma: any, today: string) => {
  const alunosMatriculados = getBlockingMatriculasTotal(turma);
  const vagasTotais = Number(turma?.vagas_totais || 0);
  const qtdVagasMinima = Number(turma?.qtd_vagas_minima || 0);
  const bloquearMatriculasAposCompletarVagas = turma?.bloquear_matriculas_apos_completar_vagas !== false;

  if (turma?.permitir_inscricoes_online !== true) {
    return 'Inscrições online não liberadas para esta turma.';
  }

  if (turma?.data_inicio_inscricao && today < turma.data_inicio_inscricao) {
    return `Inscrições abrem em ${formatDate(turma.data_inicio_inscricao)}.`;
  }

  if (turma?.data_fim_inscricao && today > turma.data_fim_inscricao) {
    return `Inscrições encerradas em ${formatDate(turma.data_fim_inscricao)}. Aguarde uma nova turma.`;
  }

  if (bloquearMatriculasAposCompletarVagas) {
    if (qtdVagasMinima > 0 && alunosMatriculados >= qtdVagasMinima) {
      return `Turma com limite de ${qtdVagasMinima} alunos atingido. Aguarde uma nova turma.`;
    }

    if (vagasTotais > 0 && alunosMatriculados >= vagasTotais) {
      return 'Turma lotada. Aguarde uma nova turma.';
    }
  }

  return null;
};

const getCourseEnrollmentAvailability = (turmas: any[]) => {
  const today = todayDate();
  const analyzed = (turmas || []).map((turma) => ({
    turma,
    reason: getTurmaUnavailabilityReason(turma, today),
  }));
  const availableTurmas = analyzed.filter((item) => !item.reason).map((item) => item.turma);
  const available = availableTurmas[0];
  if (available) return { isAvailable: true, reason: null, turma: available, availableTurmas };
  return {
    isAvailable: false,
    reason: analyzed[0]?.reason || 'Sem turma aberta para inscrição no momento.',
    turma: analyzed[0]?.turma || null,
    availableTurmas: [],
  };
};

const getPoloLabel = (turma: any) => {
  const polo = Array.isArray(turma?.polos) ? turma.polos[0] : turma?.polos;
  return [polo?.nome, polo?.cidade && polo?.estado ? `${polo.cidade}/${polo.estado}` : polo?.cidade || polo?.estado]
    .filter(Boolean)
    .join(' - ') || 'Polo a confirmar';
};

const getEnrollmentRank = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  if (EAD_ACCESS_STATUSES.has(normalized)) return 3;
  if (EAD_PENDING_STATUSES.has(normalized)) return 2;
  if (normalized) return 1;
  return 0;
};

const hasEadAccess = (course: any) => EAD_ACCESS_STATUSES.has(normalizeStatus(course?.alunoMatricula?.status));
const hasPendingEadPayment = (course: any) => {
  const matricula = course?.alunoMatricula;
  if (!EAD_PENDING_STATUSES.has(normalizeStatus(matricula?.status))) return false;
  if (typeof matricula?.hasActivePendingReceivable === 'boolean') {
    return matricula.hasActivePendingReceivable;
  }
  return true;
};

const normalizePercent = (value: unknown) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const getCourseProgressPercent = (progressState?: any, enrollmentStatus?: string | null) => {
  if (normalizeStatus(enrollmentStatus) === 'CONCLUIDO') return 100;
  return normalizePercent(progressState?.summary?.progressPercent ?? progressState?.progressPercent ?? 0);
};

const getLessonDurationLabel = (lesson: any) => {
  if (lesson?.duracao) return lesson.duracao;
  if (lesson?.duracaoMinutos) {
    const minutes = lesson.duracaoMinutos;
    if (minutes % 60 === 0) {
      return `${minutes / 60}h`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}min`;
    }
    return `${remainingMinutes}min`;
  }
  return 'Leitura';
};

const buildEadGradeCurricular = (course: any) => {
  const lessons = Array.isArray(course?.ead_config?.conteudos) ? course.ead_config.conteudos : [];
  if (!lessons.length) return 'Conteúdo programático conforme plano pedagógico do curso.';

  return lessons
    .map((lesson: any, index: number) => `${index + 1}. ${lesson?.titulo || `Etapa ${index + 1}`} (${getLessonDurationLabel(lesson)})`)
    .join('\n');
};

const decodeHtmlEntities = (text: string) => {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>'
  };

  return text.replace(/&(nbsp|amp|quot|#39|lt|gt);/g, entity => entities[entity] || entity);
};

const htmlToPlainText = (html?: string) => {
  if (!html) return '';

  return decodeHtmlEntities(String(html))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const buildSupplementalLessonText = (course: any, lesson: any, index: number) => {
  const courseName = course?.nome || 'este curso';
  const lessonTitle = lesson?.titulo || `aula ${index + 1}`;
  const area = course?.area || 'formação profissional';
  const cargaHoraria = Number(course?.carga_horaria || 0) || 80;

  return [
    `Nesta etapa do curso ${courseName}, o tema ${lessonTitle} deve ser estudado com foco na aplicação profissional. Relacione os conceitos com situações reais de trabalho, observando rotina, segurança, comunicação, atendimento e registro adequado das informações.`,
    `Durante a leitura, identifique os cuidados essenciais da área de ${area}, revise os termos mais importantes e pense em como cada orientação ajudaria a evitar falhas na prática. Um bom desempenho depende de planejamento, postura ética, atenção às normas e capacidade de agir com responsabilidade.`,
    `Antes de avançar, revise os pontos principais, responda à atividade objetiva da etapa e confirme se você compreendeu como aplicar o conteúdo em uma situação concreta. A conclusão do curso considera as leituras, as atividades e a aprovação na prova final, dentro da carga horária total de ${cargaHoraria} horas.`
  ].join('\n\n');
};

const getLessonDisplayText = (course: any, lesson: any, index: number) => {
  const plainText = htmlToPlainText(lesson?.textoHtml);
  if (plainText.length >= 500) return plainText;

  return [plainText, buildSupplementalLessonText(course, lesson, index)]
    .filter(Boolean)
    .join('\n\n');
};

const getActivityLessonId = (atividade: any) =>
  atividade?.etapaId || atividade?.aulaId || atividade?.conteudoId || atividade?.lessonId || null;

const normalizeActivityMatchText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const getActivityLessonIndex = (atividade: any, activityIndex: number, lessons: any[]) => {
  const linkedLessonId = getActivityLessonId(atividade);
  if (linkedLessonId) {
    const linkedIndex = lessons.findIndex((lesson: any) => lesson.id === linkedLessonId);
    if (linkedIndex >= 0) return linkedIndex;
  }

  const explicitStep = Number(atividade?.etapa || atividade?.modulo || atividade?.etapaModulo || 0);
  if (Number.isFinite(explicitStep) && explicitStep > 0) {
    const stepIndex = lessons.findIndex((lesson: any) => Number(lesson?.etapa || 0) === explicitStep);
    if (stepIndex >= 0) return stepIndex;
    if (lessons[explicitStep - 1]) return explicitStep - 1;
  }

  const activityText = normalizeActivityMatchText(`${atividade?.titulo || ''} ${atividade?.enunciado || ''}`);
  const titleMatchIndex = lessons.findIndex((lesson: any) => {
    const lessonTitle = normalizeActivityMatchText(lesson?.titulo);
    return lessonTitle && (activityText.includes(lessonTitle) || lessonTitle.includes(activityText));
  });
  if (titleMatchIndex >= 0) return titleMatchIndex;

  return lessons[activityIndex] ? activityIndex : -1;
};

const getActivityChoiceData = (atividade: any, activityIndex: number, prova: any) => {
  if (Array.isArray(atividade?.opcoes) && atividade.opcoes.length > 0) {
    return {
      enunciado: atividade.enunciado,
      opcoes: atividade.opcoes,
      respostaCorreta: Number(atividade.respostaCorreta || 0)
    };
  }

  const questoes = Array.isArray(prova?.questoes) ? prova.questoes : [];
  const questao = questoes.length > 0 ? questoes[activityIndex % questoes.length] : null;
  if (!questao?.opcoes?.length) return null;

  return {
    enunciado: questao.pergunta,
    opcoes: questao.opcoes,
    respostaCorreta: Number(questao.respostaCorreta || 0)
  };
};

const getCorrectOptionIndex = (questao: any) => {
  const raw =
    questao?.respostaCorreta ??
    questao?.resposta_correta ??
    questao?.correctAnswer ??
    questao?.correct_answer ??
    questao?.gabarito ??
    0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const seededRandom = (seed: number) => {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = state * 16807 % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const shuffleWithSeed = <T,>(items: T[], seed: number) => {
  const random = seededRandom(seed || 1);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const getCertificateFileName = (courseName?: string) =>
  `certificado-${String(courseName || 'ead')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()}.pdf`;

const formatCountdown = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
};

const A4_LANDSCAPE_PREVIEW_WIDTH_PX = 1123;
const A4_LANDSCAPE_PREVIEW_HEIGHT_PX = 794;
const CERTIFICATE_PREVIEW_GAP_PX = 24;
const CERTIFICATE_PDF_PAGE_SELECTOR = '[data-certificate-pdf-page="true"]';
const COURSE_PAGE_SIZE = 9;

const getEmbedUrl = (url?: string) => {
  if (!url) return '';
  const cleanUrl = String(url).trim();
  const iframeSrc = cleanUrl.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&');
  const sourceUrl = iframeSrc || cleanUrl;

  try {
    const parsed = new URL(sourceUrl);
    if (parsed.hostname.includes('youtu.be')) {
      return `https://www.youtube.com/embed/${parsed.pathname.replace('/', '')}`;
    }
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
      return id ? `https://www.youtube.com/embed/${id}` : sourceUrl;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const id = parsed.hostname.includes('player.vimeo.com') && pathParts[0] === 'video'
        ? pathParts[1]
        : pathParts[0];

      if (!id) return sourceUrl;

      const params = new URLSearchParams(parsed.search);
      params.set('badge', '0');
      params.set('title', '0');
      params.set('byline', '0');
      params.set('portrait', '0');
      params.set('dnt', '1');
      params.set('autopause', '0');
      params.set('share', '0');
      params.set('watch_later', '0');
      params.set('like', '0');

      return `https://player.vimeo.com/video/${id}?${params.toString()}`;
    }
    return sourceUrl;
  } catch {
    return sourceUrl;
  }
};

const getCourseImageSrc = (imageUrl?: string | null) => {
  if (!imageUrl) return '';

  try {
    const parsed = new URL(imageUrl);
    const match = parsed.pathname.match(/\/course-covers\/ead\/([^/]+\.webp)$/);
    if (match?.[1]) return `/course-covers/ead/${match[1]}`;
  } catch {
    if (String(imageUrl).startsWith('/course-covers/ead/')) return imageUrl;
  }

  return imageUrl;
};

const CursosPage: React.FC<CursosPageProps> = ({ alunoId, initialCourseId, onExitCourse }) => {
  const queryClient = useQueryClient();
  const hasAlunoContext = Boolean(alunoId);
  const [activeTab, setActiveTab] = useState<'ead' | 'live' | 'especializacao' | 'tecnico'>('ead');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [coursePage, setCoursePage] = useState(1);
  const [activeLearningTab, setActiveLearningTab] = useState<LearningTab>('video');
  const [activeCourseContentTab, setActiveCourseContentTab] = useState<'aulas' | 'atividades'>('aulas');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [selectedLessonIdx, setSelectedLessonIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSeed, setQuizSeed] = useState(() => Date.now());
  const [quizNowMs, setQuizNowMs] = useState(() => Date.now());
  const [quizError, setQuizError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [isDownloadingCertificate, setIsDownloadingCertificate] = useState(false);
  const [certificateZoom, setCertificateZoom] = useState(65);
  const [showCompletedLessons, setShowCompletedLessons] = useState(false);
  const [activityCompletionPrompt, setActivityCompletionPrompt] = useState<{ activityId: string; title: string } | null>(null);
  const [checkoutReview, setCheckoutReview] = useState<{ course: any; turma: any } | null>(null);
  const [acceptedOnlineTerms, setAcceptedOnlineTerms] = useState(false);
  const [selectedTurmaByCourse, setSelectedTurmaByCourse] = useState<Record<string, string>>({});
  const certificatePdfSourceRef = React.useRef<HTMLDivElement>(null);

  const invalidateStudentCourseAccess = React.useCallback(() => {
    if (!alunoId) return;
    queryClient.invalidateQueries({ queryKey: ['aluno-cursos-disponiveis', alunoId] });
    queryClient.invalidateQueries({ queryKey: ['aluno-financeiro', alunoId] });
  }, [alunoId, queryClient]);

  const { data: courses = [], isLoading, isError } = useQuery<any[]>({
    queryKey: ['aluno-cursos-disponiveis', alunoId],
    queryFn: async () => {
      const [coursesResult, matriculasResult, turmasOnlineResult] = await Promise.all([
        supabase
          .from('cursos')
          .select('*')
          .eq('status', 'ativo')
          .order('nome', { ascending: true }),
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
          .eq('status', 'EM_ANDAMENTO')
          .eq('permitir_inscricoes_online', true)
          .in('cursos.modalidade', ['LIVRE', 'ESPECIALIZACAO', 'TECNICO'])
          .order('data_inicio', { ascending: true })
      ]);

      if (coursesResult.error) throw coursesResult.error;
      if (matriculasResult.error) throw matriculasResult.error;
      if (turmasOnlineResult.error) throw turmasOnlineResult.error;

      const allMatriculas = matriculasResult.data || [];
      const turmasByCourse = new Map<string, any[]>();
      for (const turma of turmasOnlineResult.data || []) {
        if (!turma?.curso_id) continue;
        turmasByCourse.set(turma.curso_id, [...(turmasByCourse.get(turma.curso_id) || []), turma]);
      }
      const pendingMatriculaIds = allMatriculas
        .filter((m: any) => EAD_PENDING_STATUSES.has(normalizeStatus(m.status)))
        .map((m: any) => m.id)
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
          if (receivable?.matricula_id) {
            pendingReceivableByMatricula.add(receivable.matricula_id);
          }
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
        const shouldReplace =
          !current ||
          nextRank > currentRank ||
          (nextRank === currentRank && nextRank === 2 && !current.hasActivePendingReceivable && hasActivePendingReceivable);

        if (shouldReplace) {
          enrollmentByCourse.set(courseId, {
            id: matricula.id,
            status: matricula.status,
            dataMatricula: matricula.data_matricula,
            turmaId: matricula.turma_id,
            hasActivePendingReceivable
          });
        }
      }

      return (coursesResult.data || []).map((course: any) => {
        const modality = String(course.modalidade || '').toUpperCase();
        const onlineAvailability = ONLINE_CLASS_MODALITIES.has(modality)
          ? getCourseEnrollmentAvailability(turmasByCourse.get(course.id) || [])
          : null;

        return {
          ...course,
          alunoMatricula: enrollmentByCourse.get(course.id) || null,
          onlineAvailability,
        };
      });
    }
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ course, turmaId, checkoutWindow, sameTab }: { course: any; turmaId?: string | null; checkoutWindow: Window | null; sameTab?: boolean }) => {
      if (!alunoId) throw new Error('Aluno não identificado para iniciar a compra.');
      const result = await asaasIntegrationService.getPublicCheckout(course.id, alunoId, turmaId);
      return {
        url: result.url,
        checkoutWindow,
        sameTab: sameTab === true,
        alreadyPaid: result.alreadyPaid === true,
        alreadyPending: result.alreadyPending === true,
      };
    },
    onMutate: () => {
      setCheckoutError('');
    },
    onSuccess: ({ url, checkoutWindow, sameTab, alreadyPaid, alreadyPending }) => {
      if (alreadyPaid) {
        if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
        setCheckoutError('');
        invalidateStudentCourseAccess();
        return;
      }
      if (sameTab) {
        invalidateStudentCourseAccess();
        window.location.assign(url);
        return;
      }
      if (checkoutWindow && !checkoutWindow.closed) {
        checkoutWindow.opener = null;
        checkoutWindow.location.href = url;
        checkoutWindow.focus();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer') || window.location.assign(url);
      }
      if (alreadyPending) setCheckoutError('Você já tinha uma cobrança em aberto para este curso. Reabrimos o link existente.');
      invalidateStudentCourseAccess();
    },
    onError: (error: any, variables) => {
      const message = error?.message || 'Não foi possível iniciar o pagamento deste curso.';
      if (variables?.checkoutWindow && !variables.checkoutWindow.closed) {
        variables.checkoutWindow.document.title = 'Pagamento não iniciado';
        variables.checkoutWindow.document.body.innerHTML = `
          <main style="font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 48px 24px; color: #0f172a;">
            <p style="margin: 0 0 12px; color: #dc2626; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;">Pagamento não iniciado</p>
            <h1 style="margin: 0 0 12px; font-size: 28px; line-height: 1.15;">Não foi possível preparar a cobrança.</h1>
            <p style="margin: 0 0 24px; color: #475569; font-size: 15px; line-height: 1.6;">${escapeCheckoutHtml(message)}</p>
            <button onclick="window.close()" style="border: 0; border-radius: 12px; background: #2563eb; color: white; padding: 12px 18px; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; cursor: pointer;">Fechar</button>
          </main>
        `;
        variables.checkoutWindow.focus();
      }
      setCheckoutError(message);
      invalidateStudentCourseAccess();
    }
  });

  const startCheckout = (course: any, turma?: any | null) => {
    const isEadCheckout = String(course?.modalidade || '').toUpperCase() === 'EAD';
    const checkoutWindow = isEadCheckout ? null : window.open('', '_blank');
    if (checkoutWindow) {
      checkoutWindow.document.title = 'Preparando pagamento';
      checkoutWindow.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 24px;">Preparando pagamento...</p>';
    }
    checkoutMutation.mutate({
      course,
      turmaId: turma?.id || null,
      checkoutWindow,
      sameTab: isEadCheckout,
    });
  };

  useEffect(() => {
    if (!hasAlunoContext || !alunoId) return;

    const channel = supabase
      .channel(`aluno_cursos_access_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matriculas', filter: `aluno_id=eq.${alunoId}` },
        invalidateStudentCourseAccess
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_receber', filter: `cliente_id=eq.${alunoId}` },
        invalidateStudentCourseAccess
      )
      .subscribe();

    window.addEventListener('focus', invalidateStudentCourseAccess);

    return () => {
      window.removeEventListener('focus', invalidateStudentCourseAccess);
      supabase.removeChannel(channel);
    };
  }, [alunoId, hasAlunoContext, invalidateStudentCourseAccess]);

  useEffect(() => {
    setSelectedLessonIdx(0);
    setActiveLearningTab('video');
    setActiveCourseContentTab('aulas');
    setQuizAnswers({});
    setQuizSeed(Date.now());
    setQuizError('');
    setShowCompletedLessons(true);
    setActivityCompletionPrompt(null);
  }, [selectedCourse?.id]);

  useEffect(() => {
    if (!selectedCourse?.id) return;

    const timer = window.setInterval(() => {
      setQuizNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [selectedCourse?.id]);

  const progressQueryKey = ['ead-aluno-progresso', alunoId, selectedCourse?.id];

  const { data: progressState = emptyProgressState } = useQuery<EadProgressState>({
    queryKey: progressQueryKey,
    enabled: hasAlunoContext && !!selectedCourse?.id && hasEadAccess(selectedCourse),
    queryFn: async () => {
      if (!alunoId) throw new Error('Aluno não identificado para este contexto.');
      const { data, error } = await supabase.rpc('ead_get_aluno_progress', {
        p_aluno_id: alunoId,
        p_curso_id: selectedCourse!.id
      });

      if (error) throw error;
      return data as EadProgressState;
    },
    refetchInterval: selectedCourse?.id ? 30000 : false
  });

  const updateProgressMutation = useMutation({
    mutationFn: async (input: { action: string; itemId?: string | null; payload?: Record<string, any> }) => {
      if (!alunoId) throw new Error('Aluno não identificado para este contexto.');
      const { data, error } = await supabase.rpc('ead_update_aluno_progress', {
        p_aluno_id: alunoId,
        p_curso_id: selectedCourse!.id,
        p_action: input.action,
        p_item_id: input.itemId || null,
        p_payload: input.payload || {}
      });

      if (error) throw error;
      return data as EadProgressState;
    },
    onSuccess: (data) => {
      setQuizError('');
      queryClient.setQueryData(progressQueryKey, data);
      queryClient.invalidateQueries({ queryKey: progressQueryKey });
      if (data.summary?.quizRetryBlocked) {
        setQuizAnswers({});
        setQuizSeed(Date.now());
      }
      if (data.summary?.quizPassed) {
        queryClient.invalidateQueries({ queryKey: ['aluno-certificado-ead', alunoId, selectedCourse?.id] });
      }
    },
    onError: (error: any) => {
      setQuizError(error?.message || 'Não foi possível atualizar seu progresso.');
    }
  });

  useEffect(() => {
    if (!hasAlunoContext || !selectedCourse?.id) return;

    const channel = supabase
      .channel(`ead_aluno_progresso_${alunoId}_${selectedCourse.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ead_aluno_progresso',
          filter: `curso_id=eq.${selectedCourse.id}`
        },
        () => queryClient.invalidateQueries({ queryKey: progressQueryKey })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient, selectedCourse?.id]);

  const currentTypeFilter = useMemo(() => {
    let typeFilter = 'EAD';
    if (activeTab === 'live') typeFilter = 'LIVRE';
    if (activeTab === 'especializacao') typeFilter = 'ESPECIALIZACAO';
    if (activeTab === 'tecnico') typeFilter = 'TECNICO';
    return typeFilter;
  }, [activeTab]);

  const availableCategories = useMemo(() => {
    const values = courses
      .filter(c => {
        const isEadCourse = c.modalidade?.toUpperCase() === 'EAD';
        const canBeShownForPurchase = c.publicar_site !== false;
        return c.modalidade?.toUpperCase() === currentTypeFilter && (!isEadCourse || canBeShownForPurchase || hasEadAccess(c));
      })
      .map(c => String(c.area || 'Outros').trim() || 'Outros');

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [courses, currentTypeFilter]);

  const currentTabCourses = useMemo(() => {
    return courses
      .filter(c => {
      const matchesType = c.modalidade?.toUpperCase() === currentTypeFilter;
      const matchesSearch = textMatchesSearch(searchTerm, [c.nome, c.descricao, c.area]);
      const matchesCategory = categoryFilter === 'todas' || String(c.area || 'Outros').trim() === categoryFilter;
      const isEadCourse = c.modalidade?.toUpperCase() === 'EAD';
      const canBeShownForPurchase = c.publicar_site !== false;
        return matchesType && matchesSearch && matchesCategory && (!isEadCourse || canBeShownForPurchase || hasEadAccess(c));
      })
      .sort((a, b) => {
        const compare = String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
        return sortDirection === 'asc' ? compare : -compare;
      });
  }, [categoryFilter, courses, currentTypeFilter, searchTerm, sortDirection]);

  const totalCoursePages = Math.max(1, Math.ceil(currentTabCourses.length / COURSE_PAGE_SIZE));
  const currentPageCourses = useMemo(() => {
    const start = (coursePage - 1) * COURSE_PAGE_SIZE;
    return currentTabCourses.slice(start, start + COURSE_PAGE_SIZE);
  }, [coursePage, currentTabCourses]);

  const groupedCurrentPageCourses = useMemo(() => {
    const groups = new Map<string, any[]>();
    currentPageCourses.forEach(course => {
      const key = String(course.area || 'Outros').trim() || 'Outros';
      groups.set(key, [...(groups.get(key) || []), course]);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [currentPageCourses]);

  useEffect(() => {
    setCoursePage(1);
  }, [activeTab, categoryFilter, searchTerm, sortDirection]);

  useEffect(() => {
    setCategoryFilter('todas');
  }, [activeTab]);

  useEffect(() => {
    if (coursePage > totalCoursePages) setCoursePage(totalCoursePages);
  }, [coursePage, totalCoursePages]);

  const accessibleEadCourses = courses.filter(course =>
    course.modalidade?.toUpperCase() === 'EAD' && hasEadAccess(course)
  );
  const courseProgressQueries = useQueries({
    queries: accessibleEadCourses.map(course => ({
      queryKey: ['ead-aluno-progresso', alunoId, course.id],
      enabled: hasAlunoContext && !!course.id,
      staleTime: 30_000,
      queryFn: async () => {
        if (!alunoId) throw new Error('Aluno não identificado para este contexto.');
        const { data, error } = await supabase.rpc('ead_get_aluno_progress', {
          p_aluno_id: alunoId,
          p_curso_id: course.id
        });

        if (error) throw error;
        return data as EadProgressState;
      }
    }))
  });
  const progressByCourseId = React.useMemo(() => {
    const map = new Map<string, EadProgressState>();
    accessibleEadCourses.forEach((course, index) => {
      const data = courseProgressQueries[index]?.data as EadProgressState | undefined;
      if (data) map.set(course.id, data);
    });
    return map;
  }, [accessibleEadCourses, courseProgressQueries]);

  useEffect(() => {
    if (!initialCourseId || selectedCourse?.id === initialCourseId || courses.length === 0) return;
    const course = courses.find(item => item.id === initialCourseId);
    if (course && hasEadAccess(course)) {
      setSelectedCourse(course);
    }
  }, [courses, initialCourseId, selectedCourse?.id]);

  useEffect(() => {
    if (!selectedCourse?.id || courses.length === 0) return;
    const updatedCourse = courses.find(item => item.id === selectedCourse.id);
    if (updatedCourse && updatedCourse !== selectedCourse) {
      setSelectedCourse(updatedCourse);
    }
  }, [courses, selectedCourse]);

  const conteudos = selectedCourse?.ead_config?.conteudos || [];
  const atividades = selectedCourse?.ead_config?.atividades || [];
  const regras = selectedCourse?.ead_config?.regras || {};
  const provas = selectedCourse?.ead_config?.provas || [];
  const currentProva = provas[0];
  const selectedLesson = conteudos[selectedLessonIdx];
  const selectedLessonText = getLessonDisplayText(selectedCourse, selectedLesson, selectedLessonIdx);
  const progress = progressState.progress || emptyProgressState.progress;
  const summary = progressState.summary || emptyProgressState.summary;
  const introVideoLessonIndex = conteudos.findIndex((lesson: any) => Boolean(lesson?.videoUrl));
  const introVideoLesson = introVideoLessonIndex >= 0 ? conteudos[introVideoLessonIndex] : null;
  const introVideoDone = introVideoLesson ? progress.completedVideoIds.includes(introVideoLesson.id) : false;
  const selectedLessonActivities = atividades
    .map((atividade: any, activityIndex: number) => ({
      atividade,
      activityIndex,
      linkedLessonIndex: getActivityLessonIndex(atividade, activityIndex, conteudos)
    }))
    .filter((item: any) => item.linkedLessonIndex === selectedLessonIdx);
  const quizPassed = Boolean(summary.quizPassed);
  const progressPercent = Number(summary.progressPercent || 0);
  const allLessonsDone = Boolean(summary.allLessonsDone);
  const allActivitiesDone = Boolean(summary.allActivitiesDone);
  const allVideosDone = Boolean(summary.allVideosDone);
  const questionsTotal = Number(summary.questionsTotal || currentProva?.questoes?.length || 0);
  const minimumQuestions = Number(summary.minimumQuestions || 10);
  const retryAvailableAt = summary.retryAvailableAt ? new Date(Number(summary.retryAvailableAt)) : null;
  const retryRemainingMs = retryAvailableAt ? retryAvailableAt.getTime() - quizNowMs : 0;
  const quizRetryBlocked = Boolean(summary.quizRetryBlocked) && retryRemainingMs > 0;
  const retryCountdownLabel = quizRetryBlocked ? formatCountdown(retryRemainingMs) : '';
  const canTakeQuiz = allLessonsDone && allActivitiesDone && allVideosDone && questionsTotal >= minimumQuestions && !quizRetryBlocked;
  const completedAt = summary.completedAt || progress.completedAt;
  const completedAtDate = completedAt ? new Date(Number(completedAt)) : null;
  const startedAtDate = progress.startedAt ? new Date(Number(progress.startedAt)) : null;
  const completedLessonCount = Array.isArray(progress.completedContentIds) ? progress.completedContentIds.length : 0;
  const eadGradeCurricular = buildEadGradeCurricular(selectedCourse);

  const { data: alunoCertificado, isLoading: certificateLoading } = useQuery<CertificadoAcademico | null>({
    queryKey: ['aluno-certificado-ead', alunoId, selectedCourse?.id],
    enabled: hasAlunoContext && !!selectedCourse?.id && quizPassed,
    queryFn: async () => {
      if (!alunoId) throw new Error('Aluno não identificado para este contexto.');
      const { data, error } = await supabase
        .from('certificados_academicos')
        .select(`
          *,
          aluno:parceiros!certificados_academicos_aluno_id_fkey(nome, cpf_cnpj),
          turma:turmas!certificados_academicos_turma_id_fkey(nome, codigo),
          curso:cursos!certificados_academicos_curso_id_fkey(nome, carga_horaria),
          polo:polos!certificados_academicos_polo_id_fkey(nome, cidade, estado)
        `)
        .eq('aluno_id', alunoId)
        .eq('curso_id', selectedCourse!.id)
        .eq('modalidade', 'EAD')
        .eq('status', 'FINALIZADO')
        .not('codigo_validacao', 'is', null)
        .order('data_conclusao', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data || null) as unknown as CertificadoAcademico | null;
    }
  });

  const { data: certificateTemplates = [] } = useQuery<any[]>({
    queryKey: ['aluno-certificado-modelos'],
    enabled: !!selectedCourse?.id && quizPassed,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: () => diplomaService.getTemplates()
  });

  const eadCertificateModel = certificateTemplates.find(modelo =>
    String(modelo.tipoCurso || '').toLocaleLowerCase('pt-BR').includes('ead')
    || String(modelo.modalidade || '').toUpperCase() === 'EAD'
  );
  const randomizedQuizQuestions = React.useMemo(() => {
    const questoes = Array.isArray(currentProva?.questoes) ? currentProva.questoes : [];
    return shuffleWithSeed(questoes, quizSeed + hashString(selectedCourse?.id || '')).map((questao: any, qIdx: number) => ({
      ...questao,
      originalQuestionIndex: qIdx,
      respostaCorreta: getCorrectOptionIndex(questao),
      shuffledOptions: shuffleWithSeed(
        (Array.isArray(questao?.opcoes) ? questao.opcoes : []).map((opcao: string, index: number) => ({
          label: opcao,
          originalIndex: index
        })),
        quizSeed + hashString(`${questao?.id || qIdx}-${selectedCourse?.id || ''}`)
      )
    }));
  }, [currentProva, quizSeed, selectedCourse?.id]);
  const displayedQuizAnswers = quizPassed ? (progress.quizAnswers || quizAnswers) : quizAnswers;

  const retryAvailableLabel = retryAvailableAt
    ? retryAvailableAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '';

  useEffect(() => {
    if (!summary.quizRetryBlocked || !retryAvailableAt || retryRemainingMs > 0) return;
    queryClient.invalidateQueries({ queryKey: progressQueryKey });
    setQuizSeed(Date.now());
    setQuizAnswers({});
  }, [queryClient, progressQueryKey, retryAvailableAt, retryRemainingMs, summary.quizRetryBlocked]);

  const isLessonLocked = (idx: number) => {
    if (!regras.liberarSequencialmente || idx === 0) return false;
    return !progress.completedContentIds.includes(conteudos[idx - 1]?.id);
  };

  const updateProgress = (action: string, itemId?: string | null, payload?: Record<string, any>) => {
    updateProgressMutation.mutate({ action, itemId, payload });
  };

  const buildCertificatePdf = async () => {
    if (!certificatePdfSourceRef.current || !alunoCertificado) return null;

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pages = Array.from(certificatePdfSourceRef.current.querySelectorAll(CERTIFICATE_PDF_PAGE_SELECTOR)) as any[];
    const captureTargets = pages.length ? pages : [certificatePdfSourceRef.current];

    for (const [index, page] of captureTargets.entries()) {
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: page.offsetWidth,
        height: page.offsetHeight,
        windowWidth: Math.max(document.documentElement.clientWidth, page.scrollWidth, page.offsetWidth),
        windowHeight: Math.max(document.documentElement.clientHeight, page.scrollHeight, page.offsetHeight),
      });

      if (index > 0) pdf.addPage('a4', 'landscape');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210);
    }

    return pdf;
  };

  const downloadCertificatePdf = async () => {
    if (!alunoCertificado) return;

    setIsDownloadingCertificate(true);
    try {
      const pdf = await buildCertificatePdf();
      if (!pdf) return;
      pdf.save(getCertificateFileName(alunoCertificado.curso?.nome || selectedCourse?.nome));
    } catch (error) {
      console.error('Erro ao baixar certificado em PDF:', error);
      alert('Não foi possível baixar o certificado em PDF agora.');
    } finally {
      setIsDownloadingCertificate(false);
    }
  };

  const printCertificate = async () => {
    if (!alunoCertificado) return;

    setIsDownloadingCertificate(true);
    try {
      const pdf = await buildCertificatePdf();
      if (!pdf) return;
      const pdfUrl = URL.createObjectURL(pdf.output('blob'));
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = pdfUrl;
      iframe.onload = () => {
        window.setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        }, 250);
      };
      document.body.appendChild(iframe);
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(pdfUrl);
      }, 60000);
    } catch (error) {
      console.error('Erro ao imprimir certificado em PDF:', error);
      alert('Não foi possível preparar a impressão do certificado agora.');
    } finally {
      setIsDownloadingCertificate(false);
    }
  };

  const renderCertificatePdfSource = () => {
    if (!alunoCertificado) return null;

    return (
      <div className="fixed left-[-20000px] top-0 z-[-1] bg-white" aria-hidden="true">
        <div ref={certificatePdfSourceRef}>
          <CertificadoPreview certificado={alunoCertificado} modelo={eadCertificateModel} gradeCurricular={eadGradeCurricular} pdfMode />
        </div>
      </div>
    );
  };

  const renderCertificatePreview = () => {
    if (!alunoCertificado) return null;

    const certificatePageCount = eadCertificateModel?.hasVerso !== false || alunoCertificado.modalidade === 'TECNICO' ? 2 : 1;
    const previewScale = certificateZoom / 100;
    const previewWidth = A4_LANDSCAPE_PREVIEW_WIDTH_PX * previewScale;
    const previewHeight = (
      A4_LANDSCAPE_PREVIEW_HEIGHT_PX * certificatePageCount
      + CERTIFICATE_PREVIEW_GAP_PX * Math.max(0, certificatePageCount - 1)
    ) * previewScale;

    return (
      <div id="ead-certificate-print-area" className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-100 bg-slate-100">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Prévia PDF</p>
            <p className="mt-0.5 text-[11px] font-bold text-slate-500">A4 horizontal, mesmo arquivo usado no download e impressão.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCertificateZoom((value) => Math.max(35, value - 10))}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-600"
              title="Diminuir zoom"
            >
              <ZoomOut size={16} />
            </button>
            <input
              aria-label="Zoom da prévia do certificado"
              type="range"
              min="35"
              max="120"
              step="5"
              value={certificateZoom}
              onChange={(event) => setCertificateZoom(Number(event.target.value))}
              className="h-2 w-28 accent-blue-600"
            />
            <button
              type="button"
              onClick={() => setCertificateZoom((value) => Math.min(120, value + 10))}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-600"
              title="Aumentar zoom"
            >
              <ZoomIn size={16} />
            </button>
            <span className="min-w-12 text-right text-[10px] font-black tabular-nums tracking-widest text-slate-500">{certificateZoom}%</span>
          </div>
        </div>

        <div className="max-h-[78vh] overflow-auto bg-slate-200/70 p-4">
          <div
            className="relative mx-auto"
            style={{ width: `${previewWidth}px`, height: `${previewHeight}px` }}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: '297mm',
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
              }}
            >
              <CertificadoPreview certificado={alunoCertificado} modelo={eadCertificateModel} gradeCurricular={eadGradeCurricular} pdfMode />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const closeSelectedCourse = () => {
    setSelectedCourse(null);
    onExitCourse?.();
  };

  if (selectedCourse) {
    const enrollmentDate = alunoCertificado?.data_inscricao
      ? new Date(alunoCertificado.data_inscricao)
      : startedAtDate;
    const enrollmentDateLabel = enrollmentDate && !Number.isNaN(enrollmentDate.getTime())
      ? enrollmentDate.toLocaleDateString('pt-BR')
      : 'Data não informada';
    const completionDateLabel = completedAtDate
      ? completedAtDate.toLocaleDateString('pt-BR')
      : 'Hoje';
    if (quizPassed && !showCompletedLessons) {
      return (
        <div className="space-y-6 animate-fadeIn">
          {renderCertificatePdfSource()}
          <style>{`
            @media print {
              @page { size: A4 landscape; margin: 0; }
              body * { visibility: hidden !important; }
              #ead-certificate-print-area, #ead-certificate-print-area * { visibility: visible !important; }
              #ead-certificate-print-area { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; background: white !important; }
              #ead-certificate-print-area section { break-after: page; box-shadow: none !important; border-radius: 0 !important; }
            }
          `}</style>
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={closeSelectedCourse}
                className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-blue-600 shrink-0"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Curso concluído</p>
                <h2 className="text-xl sm:text-2xl font-black text-[#001a33] uppercase tracking-tight truncate">{selectedCourse.nome}</h2>
              </div>
            </div>
          </div>

          <section className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-sm">
            <div className="bg-emerald-50/80 p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="max-w-3xl">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                    <Award size={26} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-700">Parabéns pela conclusão</p>
                  <h3 className="mt-2 text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#001a33]">
                    Você concluiu este curso EAD
                  </h3>
                  <p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">
                    Seu progresso foi registrado, a matrícula foi marcada como concluída e o certificado acadêmico fica disponível abaixo. Você também pode acessar as aulas sempre que quiser para revisar o conteúdo.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLearningTab('aulas');
                      setShowCompletedLessons(true);
                    }}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800"
                  >
                    <BookOpen size={14} />
                    Acessar conteúdos e aulas
                  </button>
                </div>

                <div className="grid min-w-[260px] grid-cols-1 gap-3">
                  <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                    <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <CalendarDays size={13} />
                      Data da inscrição
                    </p>
                    <p className="mt-1 text-lg font-black text-[#001a33]">{enrollmentDateLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                    <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <CheckCircle2 size={13} />
                      Data da conclusão
                    </p>
                    <p className="mt-1 text-lg font-black text-emerald-700">{completionDateLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Nota final</p>
                    <p className="mt-1 text-lg font-black text-blue-600">{summary.quizScore ?? '--'}%</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Certificado</p>
                    <h4 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">
                      {alunoCertificado ? 'Certificado EAD disponível' : 'Certificado em emissão'}
                    </h4>
                    <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                      {certificateLoading
                        ? 'Consultando o registro do certificado acadêmico.'
                        : alunoCertificado
                          ? `Código de validação: ${alunoCertificado.codigo_validacao || 'gerado na emissão'}`
                          : 'A conclusão foi registrada. Se o certificado ainda não aparecer, aguarde a sincronização e atualize a página.'}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={printCertificate}
                      disabled={!alunoCertificado || isDownloadingCertificate}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      <Printer size={14} />
                      Imprimir
                    </button>
                    <button
                      onClick={downloadCertificatePdf}
                      disabled={!alunoCertificado || isDownloadingCertificate}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-150 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      {isDownloadingCertificate ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {isDownloadingCertificate ? 'Gerando PDF' : 'Baixar PDF'}
                    </button>
                  </div>
                </div>
              </div>
              {renderCertificatePreview()}
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-fadeIn">
        {renderCertificatePdfSource()}
        <style>{`
          @media print {
            @page { size: A4 landscape; margin: 0; }
            body * { visibility: hidden !important; }
            #ead-certificate-print-area, #ead-certificate-print-area * { visibility: visible !important; }
            #ead-certificate-print-area { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; background: white !important; }
            #ead-certificate-print-area section { break-after: page; box-shadow: none !important; border-radius: 0 !important; }
          }
        `}</style>
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={closeSelectedCourse}
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-blue-600 shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Sala de aprendizagem</p>
              <h2 className="text-xl sm:text-2xl font-black text-[#001a33] uppercase tracking-tight truncate">{selectedCourse.nome}</h2>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 min-w-[280px]">
            <div className="bg-white border border-slate-100 rounded-2xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Progresso</p>
              <p className="text-lg font-black text-blue-600">{progressPercent}%</p>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aulas</p>
              <p className="text-lg font-black text-amber-600">{completedLessonCount}/{conteudos.length || 0}</p>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Nota</p>
              <p className="text-lg font-black text-emerald-600">{summary.quizScore ?? '--'}%</p>
            </div>
          </div>
        </div>

        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="flex flex-wrap gap-2 rounded-[1.5rem] border border-slate-100 bg-white p-2 shadow-sm w-full sm:w-max">
          {[
            ['video', 'Vídeo', <MonitorPlay size={15} />],
            ['aulas', quizPassed ? 'Conteúdos do curso' : 'Aulas e atividades', <BookOpen size={15} />],
            ['prova', 'Prova final', <FileText size={15} />],
            ...(quizPassed ? [['certificado', 'Certificado', <Award size={15} />]] : [])
          ].map(([id, label, icon]) => (
            <button
              key={id as string}
              onClick={() => setActiveLearningTab(id as LearningTab)}
              className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                activeLearningTab === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-blue-600'
              }`}
            >
              {icon as React.ReactNode}
              {label as string}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {activeLearningTab !== 'video' && (
          <aside className={`${activeLearningTab === 'prova' || activeLearningTab === 'certificado' ? 'xl:col-span-3' : 'xl:col-span-4'} space-y-3`}>
            <div className="bg-white border border-slate-100 rounded-[2rem] p-4 shadow-sm">
              <h3 className="text-xs font-black text-[#001a33] uppercase tracking-widest mb-3">Etapas do curso</h3>
              <div className="space-y-2">
                {conteudos.map((lesson: any, idx: number) => {
                  const locked = isLessonLocked(idx);
                  const done = progress.completedContentIds.includes(lesson.id);
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => !locked && setSelectedLessonIdx(idx)}
                      disabled={locked}
                      className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                        selectedLessonIdx === idx ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-white hover:bg-slate-50'
                      } ${locked ? 'opacity-55 cursor-not-allowed' : ''}`}
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${done ? 'bg-emerald-100 text-emerald-700' : locked ? 'bg-slate-100 text-slate-400' : 'bg-blue-100 text-blue-700'}`}>
                        {locked ? <Lock size={14} /> : done ? <CheckCircle2 size={15} /> : idx + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-black text-[#001a33] line-clamp-2">{lesson.titulo}</span>
                        <span className="block text-[10px] text-slate-400 font-bold mt-0.5">{getLessonDurationLabel(lesson)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
          )}

          <main className={`${activeLearningTab === 'video' ? 'xl:col-span-12' : activeLearningTab === 'prova' || activeLearningTab === 'certificado' ? 'xl:col-span-9' : 'xl:col-span-8'} space-y-6`}>
            {activeLearningTab === 'video' ? (
              <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
                <div className="grid grid-cols-1 gap-0 xl:grid-cols-12">
                  <div className="bg-white xl:col-span-8">
                    {introVideoLesson?.videoUrl ? (
                      <div className="aspect-video overflow-hidden bg-white">
                        <iframe
                          src={getEmbedUrl(introVideoLesson.videoUrl)}
                          title={introVideoLesson.titulo || selectedCourse.nome}
                          className="h-full w-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-video items-center justify-center border border-slate-100 bg-slate-50 text-center">
                        <div className="max-w-sm px-6">
                          <MonitorPlay className="mx-auto mb-3 text-blue-300" size={42} />
                          <p className="text-sm font-black uppercase tracking-widest text-[#001a33]">Vídeo em preparação</p>
                          <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                            Assim que a videoaula for vinculada ao cadastro do curso, ela aparecerá aqui.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-between gap-6 p-5 sm:p-7 xl:col-span-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Primeiro passo</p>
                      <h3 className="mt-2 text-2xl font-black uppercase tracking-tight text-[#001a33]">
                        Assista à videoaula de abertura
                      </h3>
                      <p className="mt-3 text-sm font-bold leading-relaxed text-slate-500">
                        Este vídeo apresenta o curso, organiza a visão geral do conteúdo e prepara você para avançar pelas aulas, atividades e prova final.
                      </p>

                      {introVideoLesson && (
                        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Videoaula vinculada</p>
                          <p className="mt-1 text-sm font-black text-[#001a33]">{introVideoLesson.titulo}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      {introVideoLesson && (
                        <button
                          onClick={() => updateProgress('toggle_video', introVideoLesson.id)}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-widest ${
                            introVideoDone
                              ? 'border border-emerald-150 bg-emerald-50 text-emerald-700'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {introVideoDone ? <CheckCircle2 size={15} /> : <Play size={15} />}
                          {introVideoDone ? 'Vídeo concluído' : 'Marcar vídeo como concluído'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveLearningTab('aulas')}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-650 hover:border-blue-200 hover:text-blue-700"
                      >
                        <BookOpen size={15} />
                        Ir para aulas e atividades
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : activeLearningTab === 'certificado' ? (
              <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
                <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-5">
                  <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Certificado</p>
                      <h4 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">
                        {alunoCertificado ? 'Certificado EAD disponível' : 'Certificado em emissão'}
                      </h4>
                      <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                        {certificateLoading
                          ? 'Consultando o registro do certificado acadêmico.'
                          : alunoCertificado
                            ? `Código de validação: ${alunoCertificado.codigo_validacao || 'gerado na emissão'}`
                            : 'A conclusão foi registrada. Se o certificado ainda não aparecer, aguarde a sincronização e atualize a página.'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        onClick={printCertificate}
                        disabled={!alunoCertificado || isDownloadingCertificate}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        <Printer size={14} />
                        Imprimir
                      </button>
                      <button
                        onClick={downloadCertificatePdf}
                        disabled={!alunoCertificado || isDownloadingCertificate}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-150 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        {isDownloadingCertificate ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        {isDownloadingCertificate ? 'Gerando PDF' : 'Baixar PDF'}
                      </button>
                    </div>
                  </div>
                </div>

                {renderCertificatePreview()}

                <div className="mt-5 rounded-[1.5rem] border border-blue-50 bg-blue-50/50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Conteúdo programático no verso</p>
                  <pre className="mt-3 whitespace-pre-wrap text-xs font-bold leading-relaxed text-slate-650">{eadGradeCurricular}</pre>
                </div>
              </section>
            ) : activeLearningTab === 'aulas' ? (
            selectedLesson ? (
              <section className="bg-white border border-slate-100 rounded-[2rem] p-5 sm:p-7 shadow-sm space-y-6">
                <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-1.5 w-full sm:w-max">
                  {[
                    ['aulas', 'Aulas', <BookOpen size={14} />],
                    ['atividades', 'Atividades', <ListChecks size={14} />]
                  ].map(([id, label, icon]) => (
                    <button
                      key={id as string}
                      type="button"
                      onClick={() => setActiveCourseContentTab(id as 'aulas' | 'atividades')}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeCourseContentTab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'
                      }`}
                    >
                      {icon as React.ReactNode}
                      {label as string}
                    </button>
                  ))}
                </div>

                {activeCourseContentTab === 'aulas' ? (
                  <>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                          Etapa {selectedLessonIdx + 1}
                          {selectedLesson.etapa && ` • ${selectedLesson.etapa}`}
                        </span>
                        <h3 className="text-xl font-black text-[#001a33] tracking-tight mt-1">{selectedLesson.titulo}</h3>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed mt-2">{selectedLesson.descricao}</p>
                      </div>
                      <button
                        onClick={() => updateProgress('toggle_content', selectedLesson.id)}
                        className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                          progress.completedContentIds.includes(selectedLesson.id)
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#001a33] text-white'
                        }`}
                      >
                        <CheckCircle2 size={14} />
                        {progress.completedContentIds.includes(selectedLesson.id) ? 'Concluída' : 'Marcar leitura'}
                      </button>
                    </div>

                    {selectedLessonText && (
                      <article className="prose prose-slate max-w-none">
                        <div className="whitespace-pre-line text-sm leading-8 text-slate-700 font-medium bg-slate-50/70 border border-slate-100 rounded-3xl p-5">
                          {selectedLessonText}
                        </div>
                      </article>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-black text-[#001a33] uppercase tracking-widest flex items-center gap-2">
                        <ListChecks size={16} className="text-emerald-600" />
                        Atividades desta etapa
                      </h4>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {selectedLesson?.titulo
                          ? `Responda as atividades vinculadas a "${selectedLesson.titulo}" antes de avançar.`
                          : 'Selecione uma etapa para visualizar as atividades vinculadas.'}
                      </p>
                    </div>

                    {selectedLessonActivities.length === 0 ? (
                      <div className="rounded-3xl border border-slate-100 bg-slate-50 p-8 text-center">
                        <FileText className="mx-auto mb-3 text-slate-300" size={34} />
                        <p className="text-sm font-bold text-slate-500">Esta etapa ainda não possui atividades cadastradas.</p>
                      </div>
                    ) : selectedLessonActivities.map(({ atividade, activityIndex, linkedLessonIndex }: any) => {
                      const choiceData = getActivityChoiceData(atividade, activityIndex, currentProva);
                      const activityDone = progress.completedActivityIds.includes(atividade.id);

                      return (
                        <div key={atividade.id} className="border border-emerald-100 bg-emerald-50/35 rounded-3xl p-4 space-y-3">
                          <div className="flex justify-between gap-3">
                            <div>
                              <p className="text-xs font-black text-[#001a33]">{atividade.titulo}</p>
                              {linkedLessonIndex >= 0 && (
                                <p className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                  Etapa {linkedLessonIndex + 1}
                                  {conteudos[linkedLessonIndex]?.etapa && ` • ${conteudos[linkedLessonIndex].etapa}`}
                                </p>
                              )}
                              <p className="text-xs text-slate-600 font-medium mt-1">{choiceData?.enunciado || atividade.enunciado}</p>
                            </div>
                            {activityDone && <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />}
                          </div>

                          {choiceData ? (
                            <div className="grid grid-cols-1 gap-2">
                              {choiceData.opcoes.map((opcao: string, idx: number) => (
                                <button
                                  key={`${atividade.id}-${idx}`}
                                  onClick={() => {
                                    updateProgress('set_activity_answer', atividade.id, { answer: String(idx) });
                                    if (idx === choiceData.respostaCorreta && !activityDone) {
                                      setActivityCompletionPrompt({ activityId: atividade.id, title: atividade.titulo || 'Atividade' });
                                    }
                                  }}
                                  className={`rounded-xl border px-3 py-2 text-left text-xs font-bold ${
                                    progress.activityAnswers[atividade.id] === String(idx) ? 'border-emerald-500 bg-white text-emerald-700' : 'border-emerald-100 bg-white text-slate-600'
                                  }`}
                                >
                                  {opcao}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <>
                              <textarea
                                rows={3}
                                value={progress.activityAnswers[atividade.id] || ''}
                                onChange={e => updateProgress('set_activity_answer', atividade.id, { answer: e.target.value })}
                                className="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-xs font-medium outline-none resize-none"
                              />
                              <button
                                onClick={() => progress.activityAnswers[atividade.id]?.trim() && updateProgress('toggle_activity', atividade.id)}
                                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest"
                              >
                                Salvar atividade
                              </button>
                            </>
                          )}

                          {activityCompletionPrompt?.activityId === atividade.id && !activityDone && (
                            <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                              <p className="text-xs font-black text-emerald-700">Resposta correta.</p>
                              <p className="mt-1 text-xs font-semibold text-slate-600">
                                Deseja marcar esta atividade como concluída?
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  onClick={() => {
                                    updateProgress('toggle_activity', atividade.id);
                                    setActivityCompletionPrompt(null);
                                  }}
                                  className="rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                                >
                                  Sim, concluir
                                </button>
                                <button
                                  onClick={() => setActivityCompletionPrompt(null)}
                                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500"
                                >
                                  Agora não
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : (
              <div className="bg-white border border-slate-100 rounded-[2rem] p-12 text-center">
                <BookOpen className="mx-auto text-slate-300 mb-3" size={36} />
                <p className="text-sm font-bold text-slate-500">Este curso ainda não possui etapas cadastradas.</p>
              </div>
            )
            ) : (
            <section className="bg-white border border-slate-100 rounded-[2rem] p-5 sm:p-7 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Prova final</h3>
                  <p className="text-xs text-slate-500 font-medium">A prova libera quando etapas, vídeos e atividades estiverem concluídos.</p>
                </div>
                <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${canTakeQuiz ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {canTakeQuiz ? 'Liberada' : 'Bloqueada'}
                </span>
              </div>

              {!canTakeQuiz ? (
                <div className="space-y-3">
                  {questionsTotal < minimumQuestions && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold text-amber-700">
                      A prova ainda precisa ter no mínimo {minimumQuestions} questões cadastradas. Hoje há {questionsTotal}.
                    </div>
                  )}
                  {quizRetryBlocked && (
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
                      <p>Sua última tentativa não atingiu a nota mínima.</p>
                      <p className="mt-2 text-2xl font-black tracking-widest text-red-800">{retryCountdownLabel}</p>
                      <p className="mt-1 text-[11px] text-red-600">
                        Nova tentativa liberada em {retryAvailableLabel || `${summary.retryIntervalHours || 1} hora`}.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[
                      ['Etapas', allLessonsDone],
                      ['Atividades', allActivitiesDone],
                      ['Vídeos', allVideosDone]
                    ].map(([label, ok]) => (
                      <div key={label as string} className={`rounded-2xl border p-3 text-xs font-black ${ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                        {ok ? <CheckCircle2 size={15} className="mb-1" /> : <Lock size={15} className="mb-1" />}
                        {label as string}
                      </div>
                    ))}
                  </div>
                </div>
              ) : randomizedQuizQuestions.length ? (
                <div className="space-y-4">
                  {randomizedQuizQuestions.map((questao: any, qIdx: number) => {
                    const selectedAnswer = displayedQuizAnswers[questao.id];
                    const hasAnswered = selectedAnswer !== undefined && selectedAnswer !== null;
                    const isCorrect = hasAnswered && Number(selectedAnswer) === Number(questao.respostaCorreta);

                    return (
                    <div key={questao.id} className="border border-slate-100 rounded-3xl p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <p className="text-sm font-black text-[#001a33]">{qIdx + 1}. {questao.pergunta}</p>
                        {quizPassed && hasAnswered && (
                          <span className={`rounded-xl px-3 py-1 text-[9px] font-black uppercase tracking-widest ${isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {isCorrect ? 'Você acertou' : 'Você errou'}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 mt-3">
                        {questao.shuffledOptions.map((opcao: any, idx: number) => {
                          const selected = Number(selectedAnswer) === Number(opcao.originalIndex);
                          const correct = Number(questao.respostaCorreta) === Number(opcao.originalIndex);
                          const reviewClass = quizPassed
                            ? correct
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                              : selected
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : 'border-slate-100 bg-slate-50 text-slate-500'
                            : selected
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-slate-100 bg-slate-50 text-slate-600';

                          return (
                          <button
                            key={`${questao.id}-${opcao.originalIndex}`}
                            type="button"
                            disabled={quizPassed}
                            onClick={() => setQuizAnswers(prev => ({ ...prev, [questao.id]: opcao.originalIndex }))}
                            className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all disabled:cursor-default ${reviewClass}`}
                          >
                            <span className="mr-2 font-black">{String.fromCharCode(65 + idx)}.</span>
                            {opcao.label}
                            {quizPassed && correct && <span className="ml-2 font-black text-emerald-700">Resposta correta</span>}
                            {quizPassed && selected && !correct && <span className="ml-2 font-black text-red-700">Sua resposta</span>}
                          </button>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                  {!quizPassed && (
                    <button
                      onClick={() => updateProgress('finish_quiz', null, { answers: quizAnswers })}
                      className="w-full rounded-xl bg-[#001a33] py-3 text-white text-xs font-black uppercase tracking-widest"
                    >
                      Corrigir prova
                    </button>
                  )}
                  {quizError && (
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
                      {quizError}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 font-bold">Prova ainda não cadastrada para este curso.</p>
              )}
            </section>
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <BookOpen className="text-blue-600" />
            Cursos Disponíveis
          </h2>
          <p className="text-xs text-slate-450 font-medium">Acesse cursos com etapas, atividades, vídeo e prova controlada</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Pesquisar cursos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 focus:border-blue-500 outline-none rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all"
          />
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_220px]">
          <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Categoria
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs font-bold normal-case tracking-normal text-slate-700 outline-none transition-colors focus:border-blue-500"
            >
              <option value="todas">Todas as categorias</option>
              {availableCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Ordem alfabética
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}
              className="h-11 rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs font-bold normal-case tracking-normal text-slate-700 outline-none transition-colors focus:border-blue-500"
            >
              <option value="asc">A-Z crescente</option>
              <option value="desc">Z-A decrescente</option>
            </select>
          </label>

          <div className="flex items-end">
            <div className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-50 px-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
              {currentTabCourses.length} cursos encontrados
            </div>
          </div>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-max">
        {[
          ['ead', 'Cursos EAD', <MonitorPlay size={15} />],
          ['live', 'Cursos Livres', <Zap size={15} />],
          ['especializacao', 'Especializações', <Award size={15} />],
          ['tecnico', 'Cursos Técnicos', <BookOpen size={15} />]
        ].map(([id, label, icon]) => (
          <button
            key={id as string}
            onClick={() => setActiveTab(id as any)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-blue-600'
            }`}
          >
            {icon as React.ReactNode}
            <span>{label as string}</span>
          </button>
        ))}
      </div>

      {checkoutError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
          {checkoutError}
        </div>
      )}

      {checkoutReview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Confirmação de matrícula online</p>
                <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">{checkoutReview.course.nome}</h3>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutReview(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-blue-700">
                    <MapPin size={13} />
                    Polo escolhido
                  </p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{getPoloLabel(checkoutReview.turma)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Turma</p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{checkoutReview.turma?.nome || 'Turma aberta'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-800">
                O pagamento confirma a matrícula nesta turma e neste polo após a baixa do Asaas. Documentos e dados complementares poderão ser preenchidos depois no portal do aluno.
              </div>

              {String(checkoutReview.course.modalidade || '').toUpperCase() === 'TECNICO' && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-bold leading-relaxed text-blue-800">
                  Para curso técnico, a secretaria poderá solicitar documentos acadêmicos adicionais depois da matrícula online. A liberação acadêmica segue as regras da turma e do polo informado acima.
                </div>
              )}

              <label className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4 text-xs font-bold leading-relaxed text-slate-600">
                <input
                  type="checkbox"
                  checked={acceptedOnlineTerms}
                  onChange={(event) => setAcceptedOnlineTerms(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>
                  Declaro que li e aceito os termos da matrícula online, autorizo o uso dos meus dados para emissão da cobrança e confirmo que escolhi o polo correto.
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCheckoutReview(null)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700"
              >
                Revisar depois
              </button>
              <button
                type="button"
                disabled={!acceptedOnlineTerms || checkoutMutation.isPending}
                onClick={() => {
                  const review = checkoutReview;
                  setCheckoutReview(null);
                  startCheckout(review.course, review.turma);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:bg-slate-300"
              >
                {checkoutMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                Continuar para pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : isError ? (
        <div className="p-6 bg-red-50 text-red-700 rounded-2xl text-xs font-bold border border-red-100">
          Falha ao carregar catálogo de cursos.
        </div>
      ) : currentTabCourses.length === 0 ? (
        <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
          <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen size={22} />
          </div>
          <p className="text-slate-450 font-bold text-xs">Nenhum curso encontrado nesta modalidade.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedCurrentPageCourses.map(([category, categoryCourses]) => (
            <section key={category} className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#001a33]">{category}</h3>
                <span className="h-px flex-1 bg-slate-100" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{categoryCourses.length}</span>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {categoryCourses.map((course, index) => {
                  const globalIndex = (coursePage - 1) * COURSE_PAGE_SIZE + index;
                  const eadConfig = course.ead_config || {};
                  const isEad = course.modalidade?.toUpperCase() === 'EAD';
                  const isOnlineClassModality = ONLINE_CLASS_MODALITIES.has(String(course.modalidade || '').toUpperCase());
                  const canAccess = isEad && hasEadAccess(course);
                  const pendingPayment = isEad && hasPendingEadPayment(course);
                  const onlineAvailability = course.onlineAvailability;
                  const onlineClassAvailable = Boolean(onlineAvailability?.isAvailable);
                  const availableTurmas = onlineAvailability?.availableTurmas || [];
                  const selectedTurmaId = selectedTurmaByCourse[course.id] || onlineAvailability?.turma?.id || availableTurmas[0]?.id || null;
                  const selectedTurma = availableTurmas.find((turma: any) => turma.id === selectedTurmaId) || onlineAvailability?.turma || null;
                  const courseProgress = progressByCourseId.get(course.id);
                  const courseProgressPercent = getCourseProgressPercent(courseProgress, course.alunoMatricula?.status);
                  const showCourseProgress = Boolean(course.alunoMatricula);
                  const isCheckoutLoading = checkoutMutation.isPending && checkoutMutation.variables?.course?.id === course.id;
                  return (
                    <div
                      key={course.id}
                      className="bg-white rounded-[2rem] border border-slate-100 hover:border-blue-500 shadow-sm hover:shadow-md transition-all duration-300 p-5 flex flex-col justify-between group"
                    >
                      <div className="space-y-4">
                        <div className="h-36 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center">
                          {course.imagem_url ? (
                            <img
                              src={getCourseImageSrc(course.imagem_url)}
                              alt={course.nome}
                              loading={globalIndex < 3 ? 'eager' : 'lazy'}
                              fetchPriority={globalIndex < 3 ? 'high' : 'auto'}
                              decoding="async"
                              width={1200}
                              height={675}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <MonitorPlay className="text-blue-300" size={34} />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
                              {course.area || 'Saúde'}
                            </span>
                            {isEad && (
                              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                                <ShieldCheck size={11} /> Guiado
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-[#001a33] leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors">
                            {course.nome}
                          </h3>
                          <p className="text-[11px] text-slate-500 font-medium line-clamp-3 mt-2 leading-relaxed">
                            {eadConfig.pagina?.subtitulo || course.descricao || 'Curso com trilha de aprendizagem, atividades e certificado.'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 border-t border-slate-100 pt-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                            <Clock size={14} />
                            <span>{course.carga_horaria || 80}h</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                            <BookOpen size={14} />
                            <span>{eadConfig.conteudos?.length || 0} etapas</span>
                          </div>
                        </div>

                        {showCourseProgress && (
                          <div className="rounded-2xl border border-blue-50 bg-blue-50/35 p-3">
                            <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                              <span className="text-slate-400">Progresso</span>
                              <span className="text-blue-600">{courseProgressPercent}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-white">
                              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${courseProgressPercent}%` }} />
                            </div>
                          </div>
                        )}

                        {isOnlineClassModality && onlineClassAvailable && selectedTurma && (
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
                            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-700">
                              <MapPin size={12} />
                              Polo da turma
                            </p>
                            <p className="mt-1 text-xs font-black text-[#001a33]">{getPoloLabel(selectedTurma)}</p>
                            <p className="mt-0.5 text-[10px] font-bold text-slate-500">{selectedTurma.nome || 'Turma aberta'}</p>
                            {availableTurmas.length > 1 && (
                              <select
                                value={selectedTurmaId || ''}
                                onChange={(event) => setSelectedTurmaByCourse((current) => ({ ...current, [course.id]: event.target.value }))}
                                className="mt-3 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-400"
                              >
                                {availableTurmas.map((turma: any) => (
                                  <option key={turma.id} value={turma.id}>
                                    {turma.nome || 'Turma aberta'} - {getPoloLabel(turma)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        {isEad ? (
                          canAccess ? (
                            <button
                              onClick={() => setSelectedCourse(course)}
                              className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 rounded-xl py-3 transition-all"
                            >
                              <MonitorPlay size={14} />
                              Acessar curso
                            </button>
                          ) : (
                            <button
                              onClick={() => startCheckout(course)}
                              disabled={isCheckoutLoading}
                              className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 rounded-xl py-3 transition-all"
                            >
                              {isCheckoutLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                              {isCheckoutLoading ? 'Preparando pagamento' : pendingPayment ? 'Continuar pagamento' : 'Comprar curso'}
                            </button>
                          )
                        ) : isOnlineClassModality ? (
                          onlineClassAvailable ? (
                            <button
                              onClick={() => {
                                setAcceptedOnlineTerms(false);
                                setCheckoutReview({ course, turma: selectedTurma });
                              }}
                              disabled={isCheckoutLoading}
                              className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 rounded-xl py-3 transition-all"
                            >
                              {isCheckoutLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                              {isCheckoutLoading ? 'Preparando pagamento' : 'Matricular e pagar'}
                            </button>
                          ) : (
                            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3 text-[10px] font-bold leading-relaxed text-rose-700">
                              {onlineAvailability?.reason || 'Inscrições encerradas. Aguarde uma nova turma.'}
                            </div>
                          )
                        ) : (
                          <a
                            href="https://universocursos.com.br"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                          >
                            <span>Matricular-se</span>
                            <ArrowUpRight size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {totalCoursePages > 1 && (
            <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:flex-row">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Pagina {coursePage} de {totalCoursePages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCoursePage(page => Math.max(1, page - 1))}
                  disabled={coursePage === 1}
                  className="rounded-xl bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setCoursePage(page => Math.min(totalCoursePages, page + 1))}
                  disabled={coursePage === totalCoursePages}
                  className="rounded-xl bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Proxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CursosPage;
