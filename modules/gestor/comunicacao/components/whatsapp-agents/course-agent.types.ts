export interface CourseAgentSettings {
  connectionId: string;
  enabled: boolean;
  confidenceThreshold: number;
  maxClarifications: number;
  showPrices: boolean;
  showOpenClasses: boolean;
  greetingMessage: string;
  fallbackMessage: string;
  handoffMessage: string;
  updatedAt?: string;
}

export interface CourseAgentFaq {
  id?: string;
  connectionId: string | null;
  courseId: string | null;
  courseName?: string | null;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  active: boolean;
  priority: number;
  updatedAt?: string;
}

export interface CourseAgentCatalogItem {
  id: string;
  name: string;
  modality: string;
}

export interface CourseAgentUnansweredQuestion {
  query: string;
  count: number;
  lastAskedAt: string;
}

export interface CourseAgentStats {
  publicCourseCount: number;
  publicClassCount: number;
  activeFaqCount: number;
  modalityCounts: Record<string, number>;
  catalog: CourseAgentCatalogItem[];
  unanswered: CourseAgentUnansweredQuestion[];
}

export const DEFAULT_COURSE_AGENT_SETTINGS: Omit<CourseAgentSettings, 'connectionId'> = {
  enabled: false,
  confidenceThreshold: 0.3,
  maxClarifications: 1,
  showPrices: true,
  showOpenClasses: true,
  greetingMessage: 'Posso consultar nossos cursos, modalidades e turmas públicas e responder dúvidas frequentes.',
  fallbackMessage: 'Ainda não encontrei uma resposta segura. Informe o nome do curso ou detalhe um pouco mais a sua dúvida.',
  handoffMessage: 'Vou encaminhar sua dúvida para o Comercial, que continuará o atendimento por aqui.',
};

export const EMPTY_COURSE_AGENT_FAQ: CourseAgentFaq = {
  connectionId: null,
  courseId: null,
  category: 'geral',
  question: '',
  answer: '',
  keywords: [],
  active: true,
  priority: 0,
};
