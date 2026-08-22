import { getCurrentDateInMaceio } from '../../public/courseAvailability';
import type { EadProgress, EadProgressState } from './cursosPage.types';

export { getActivityChoiceData } from './eadAssessmentFeedback';

export const EAD_ACCESS_STATUSES = new Set(['ATIVO', 'CONCLUIDO']);
export const EAD_PENDING_STATUSES = new Set(['PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO']);
export const RECEIVABLE_PENDING_STATUSES = new Set(['PENDENTE', 'VENCIDO']);
export const ONLINE_CLASS_MODALITIES = new Set(['LIVRE', 'ESPECIALIZACAO', 'TECNICO']);
export const BLOCKING_ENROLLMENT_STATUSES = new Set([
  'ATIVO',
  'CONCLUIDO',
  'PENDENTE',
  'AGUARDANDO_PAGAMENTO',
  'AGUARDANDO_CONFIRMACAO',
]);
export const LIVE_LINKED_ENROLLMENT_STATUSES = new Set(['ATIVO', 'CONCLUIDO', 'PENDENTE']);

export const emptyProgressState: EadProgressState = {
  progress: {
    startedAt: Date.now(),
    completedContentIds: [],
    completedActivityIds: [],
    completedVideoIds: [],
    activityAnswers: {},
    quizAnswers: {},
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
    certificateId: null,
  },
};

export const normalizeEadProgress = (value?: Partial<EadProgress> | null): EadProgress => ({
  ...emptyProgressState.progress,
  ...(value || {}),
  completedContentIds: Array.isArray(value?.completedContentIds) ? value.completedContentIds : [],
  completedActivityIds: Array.isArray(value?.completedActivityIds) ? value.completedActivityIds : [],
  completedVideoIds: Array.isArray(value?.completedVideoIds) ? value.completedVideoIds : [],
  activityAnswers: value?.activityAnswers && typeof value.activityAnswers === 'object' ? value.activityAnswers : {},
  quizAnswers: value?.quizAnswers && typeof value.quizAnswers === 'object' ? value.quizAnswers : {},
});

export const normalizeEadProgressState = (value?: Partial<EadProgressState> | null): EadProgressState => ({
  progress: normalizeEadProgress(value?.progress),
  summary: {
    ...emptyProgressState.summary,
    ...(value?.summary || {}),
  },
});

export const normalizeStatus = (status?: string | null) => String(status || '').toUpperCase();

export const escapeCheckoutHtml = (value: string) =>
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

  if (turma?.permitir_inscricoes_online !== true) return 'Inscrições online não liberadas para esta turma.';
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
    if (vagasTotais > 0 && alunosMatriculados >= vagasTotais) return 'Turma lotada. Aguarde uma nova turma.';
  }
  return null;
};

export const getCourseEnrollmentAvailability = (turmas: any[]) => {
  const today = getCurrentDateInMaceio();
  const analyzed = (turmas || []).map((turma) => ({ turma, reason: getTurmaUnavailabilityReason(turma, today) }));
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

export const getPoloLabel = (turma: any) => {
  const polo = Array.isArray(turma?.polos) ? turma.polos[0] : turma?.polos;
  return [polo?.nome, polo?.cidade && polo?.estado ? `${polo.cidade}/${polo.estado}` : polo?.cidade || polo?.estado]
    .filter(Boolean)
    .join(' - ') || 'Polo a confirmar';
};

export const getEnrollmentRank = (status?: string | null, modality?: string | null) => {
  const normalized = normalizeStatus(status);
  if (normalizeStatus(modality) === 'LIVRE') {
    if (normalized === 'ATIVO') return 4;
    if (EAD_PENDING_STATUSES.has(normalized)) return 3;
    if (normalized === 'CONCLUIDO') return 2;
  }
  if (EAD_ACCESS_STATUSES.has(normalized)) return 3;
  if (EAD_PENDING_STATUSES.has(normalized)) return 2;
  if (normalized) return 1;
  return 0;
};

export const hasEadAccess = (course: any) => EAD_ACCESS_STATUSES.has(normalizeStatus(course?.alunoMatricula?.status));
export const hasLinkedLiveEnrollment = (course: any) =>
  LIVE_LINKED_ENROLLMENT_STATUSES.has(normalizeStatus(course?.alunoMatricula?.status))
  && Boolean(course?.alunoMatricula?.turmaId);
export const hasPendingEadPayment = (course: any) => {
  const matricula = course?.alunoMatricula;
  if (!EAD_PENDING_STATUSES.has(normalizeStatus(matricula?.status))) return false;
  if (typeof matricula?.hasActivePendingReceivable === 'boolean') return matricula.hasActivePendingReceivable;
  return true;
};

const normalizePercent = (value: unknown) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

export const getCourseProgressPercent = (progressState?: any, enrollmentStatus?: string | null) => {
  if (normalizeStatus(enrollmentStatus) === 'CONCLUIDO') return 100;
  return normalizePercent(progressState?.summary?.progressPercent ?? progressState?.progressPercent ?? 0);
};

export const getLessonDurationLabel = (lesson: any) => {
  if (lesson?.duracao) return lesson.duracao;
  if (lesson?.duracaoMinutos) {
    const minutes = lesson.duracaoMinutos;
    if (minutes % 60 === 0) return `${minutes / 60}h`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) return `${hours}h ${remainingMinutes}min`;
    return `${remainingMinutes}min`;
  }
  return 'Leitura';
};

export const buildEadGradeCurricular = (course: any) => {
  const lessons = Array.isArray(course?.ead_config?.conteudos) ? course.ead_config.conteudos : [];
  if (!lessons.length) return 'Conteúdo programático conforme plano pedagógico do curso.';
  return lessons
    .map((lesson: any, index: number) => `${index + 1}. ${lesson?.titulo || `Etapa ${index + 1}`} (${getLessonDurationLabel(lesson)})`)
    .join('\n');
};

const decodeHtmlEntities = (text: string) => {
  const entities: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>',
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
    `Antes de avançar, revise os pontos principais, responda à atividade objetiva da etapa e confirme se você compreendeu como aplicar o conteúdo em uma situação concreta. A conclusão do curso considera as leituras, as atividades e a aprovação na prova final, dentro da carga horária total de ${cargaHoraria} horas.`,
  ].join('\n\n');
};

export const getLessonDisplayText = (course: any, lesson: any, index: number) => {
  const plainText = htmlToPlainText(lesson?.textoHtml);
  if (plainText.length >= 500) return plainText;
  return [plainText, buildSupplementalLessonText(course, lesson, index)].filter(Boolean).join('\n\n');
};

const getActivityLessonId = (atividade: any) =>
  atividade?.etapaId || atividade?.aulaId || atividade?.conteudoId || atividade?.lessonId || null;

const normalizeActivityMatchText = (value: unknown) =>
  String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const getActivityLessonIndex = (atividade: any, activityIndex: number, lessons: any[]) => {
  if (!Array.isArray(lessons)) return -1;
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

const seededRandom = (seed: number) => {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = state * 16807 % 2147483647;
    return (state - 1) / 2147483646;
  };
};

export const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
};

export const shuffleWithSeed = <T,>(items: T[], seed: number) => {
  const random = seededRandom(seed || 1);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

export const getCertificateFileName = (courseName?: string) =>
  `certificado-${String(courseName || 'ead').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '').toLowerCase()}.pdf`;

export const formatCountdown = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
};

export const getEmbedUrl = (url?: string) => {
  if (!url) return '';
  const cleanUrl = String(url).trim();
  const iframeSrc = cleanUrl.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&');
  const sourceUrl = iframeSrc || cleanUrl;
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${parsed.pathname.replace('/', '')}`;
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
      return id ? `https://www.youtube.com/embed/${id}` : sourceUrl;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const id = parsed.hostname.includes('player.vimeo.com') && pathParts[0] === 'video' ? pathParts[1] : pathParts[0];
      if (!id) return sourceUrl;
      const params = new URLSearchParams(parsed.search);
      [['badge', '0'], ['title', '0'], ['byline', '0'], ['portrait', '0'], ['dnt', '1'], ['autopause', '0'],
        ['player_id', '0'], ['app_id', '58479'], ['share', '0'], ['watch_later', '0'], ['like', '0']]
        .forEach(([key, value]) => params.set(key, value));
      return `https://player.vimeo.com/video/${id}?${params.toString()}`;
    }
    return sourceUrl;
  } catch {
    return sourceUrl;
  }
};

export const MAIN_EAD_VIDEO_ID = 'video-principal';

export const getMainCourseVideoUrl = (eadConfig: any) => {
  const directUrl = String(eadConfig?.videoUrl || eadConfig?.videoPrincipalUrl || '').trim();
  if (directUrl) return directUrl;
  const legacyLesson = Array.isArray(eadConfig?.conteudos)
    ? eadConfig.conteudos.find((lesson: any) => String(lesson?.videoUrl || '').trim())
    : null;
  return String(legacyLesson?.videoUrl || '').trim();
};

export const getLegacyMainVideoLesson = (eadConfig: any) => {
  if (!Array.isArray(eadConfig?.conteudos)) return null;
  return eadConfig.conteudos.find((lesson: any) => String(lesson?.videoUrl || '').trim()) || null;
};

export const getCourseImageSrc = (imageUrl?: string | null) => {
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
