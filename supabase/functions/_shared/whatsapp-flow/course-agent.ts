import { datePt, money } from "./format.ts";

export type CourseAgentSettings = {
  enabled: boolean;
  confidenceThreshold: number;
  maxClarifications: number;
  showPrices: boolean;
  showOpenClasses: boolean;
  greetingMessage: string;
  fallbackMessage: string;
  handoffMessage: string;
};

export type CourseAgentFaqMatch = {
  faq_id: string;
  curso_id?: string | null;
  question: string;
  answer: string;
  category: string;
  confidence: number;
};

export type CourseAgentCatalogMatch = {
  course_id: string;
  course_name: string;
  modality?: string | null;
  area?: string | null;
  description?: string | null;
  workload?: number | null;
  duration_months?: number | null;
  course_price?: number | null;
  confidence: number;
  public_classes?: Array<Record<string, unknown>> | null;
};

export type CourseAgentAnswer =
  | { kind: "faq"; match: CourseAgentFaqMatch }
  | { kind: "course"; match: CourseAgentCatalogMatch }
  | null;

const DEFAULT_SETTINGS: CourseAgentSettings = {
  enabled: false,
  confidenceThreshold: 0.3,
  maxClarifications: 1,
  showPrices: true,
  showOpenClasses: true,
  greetingMessage:
    "Posso consultar nossos cursos, modalidades e turmas públicas e responder dúvidas frequentes.",
  fallbackMessage:
    "Ainda não encontrei uma resposta segura. Informe o nome do curso ou detalhe um pouco mais a sua dúvida.",
  handoffMessage:
    "Vou encaminhar sua dúvida para o Comercial, que continuará o atendimento por aqui.",
};

export const COURSE_AGENT_MENU = [
  "*Cursos disponíveis e dúvidas*",
  "Consulte informações publicadas ou escreva sua pergunta.",
  "",
  "1️⃣ Cursos técnicos",
  "2️⃣ Graduação",
  "3️⃣ Pós-graduação",
  "4️⃣ Cursos livres / EAD",
  "5️⃣ Fazer uma pergunta",
  "6️⃣ Falar com o Comercial",
  "0️⃣ Voltar ao menu principal",
].join("\n");

const finiteConfidence = (value: unknown) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
};

export const selectCourseAgentAnswer = (
  faqs: CourseAgentFaqMatch[],
  catalog: CourseAgentCatalogMatch[],
  threshold: number,
): CourseAgentAnswer => {
  const safeThreshold = Math.min(1, Math.max(0, Number(threshold || 0)));
  const course = [...catalog].sort((a, b) =>
    finiteConfidence(b.confidence) - finiteConfidence(a.confidence)
  )[0];
  const identifiedCourseId = course &&
      finiteConfidence(course.confidence) >= safeThreshold
    ? course.course_id
    : null;
  const faq = faqs
    .filter((item) =>
      !item.curso_id || item.curso_id === identifiedCourseId
    )
    .sort((a, b) =>
      finiteConfidence(b.confidence) - finiteConfidence(a.confidence)
    )[0];
  const faqConfidence = finiteConfidence(faq?.confidence);
  const courseConfidence = finiteConfidence(course?.confidence);

  if (
    course &&
    courseConfidence >= safeThreshold &&
    courseConfidence >= faqConfidence + 0.08
  ) {
    return { kind: "course", match: course };
  }
  if (faq && faqConfidence >= safeThreshold) {
    return { kind: "faq", match: faq };
  }
  if (course && courseConfidence >= safeThreshold) {
    return { kind: "course", match: course };
  }
  return null;
};

export const getCourseAgentSettings = async (
  admin: any,
  connectionId: string,
): Promise<CourseAgentSettings> => {
  const { data, error } = await admin
    .from("whatsapp_course_agent_settings")
    .select("*")
    .eq("conexao_id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_SETTINGS;
  return {
    enabled: data.enabled === true,
    confidenceThreshold: finiteConfidence(data.confidence_threshold),
    maxClarifications: Math.max(
      0,
      Math.min(5, Number(data.max_clarifications || 0)),
    ),
    showPrices: data.show_prices !== false,
    showOpenClasses: data.show_open_classes !== false,
    greetingMessage: String(data.greeting_message || DEFAULT_SETTINGS.greetingMessage),
    fallbackMessage: String(data.fallback_message || DEFAULT_SETTINGS.fallbackMessage),
    handoffMessage: String(data.handoff_message || DEFAULT_SETTINGS.handoffMessage),
  };
};

export const matchCourseAgentKnowledge = async (
  admin: any,
  connectionId: string,
  query: string,
) => {
  const [faqResult, catalogResult] = await Promise.all([
    admin.rpc("whatsapp_course_agent_match_faq", {
      p_connection_id: connectionId,
      p_query: query,
      p_limit: 5,
    }),
    admin.rpc("whatsapp_course_agent_search_catalog", {
      p_query: query,
      p_limit: 5,
    }),
  ]);
  if (faqResult.error) throw faqResult.error;
  if (catalogResult.error) throw catalogResult.error;
  return {
    faqs: (faqResult.data || []).map((item: any) => ({
      ...item,
      confidence: finiteConfidence(item.confidence),
    })) as CourseAgentFaqMatch[],
    catalog: (catalogResult.data || []).map((item: any) => ({
      ...item,
      confidence: finiteConfidence(item.confidence),
      public_classes: Array.isArray(item.public_classes)
        ? item.public_classes
        : [],
    })) as CourseAgentCatalogMatch[],
  };
};

const modalityFilter = (group: number) => {
  if (group === 1) return ["TECNICO", "TÉCNICO"];
  if (group === 2) return ["SUPERIOR", "GRADUACAO", "GRADUAÇÃO"];
  if (group === 3) return ["ESPECIALIZACAO", "ESPECIALIZAÇÃO", "POS", "PÓS"];
  return ["EAD", "LIVRE", "CURSO LIVRE"];
};

export const getPublicCoursesByGroup = async (
  admin: any,
  group: number,
  limit = 12,
) => {
  const modalities = modalityFilter(group);
  const { data, error } = await admin
    .from("cursos")
    .select("id,nome,modalidade,area,carga_horaria,duracao_meses,valor")
    .eq("publicar_site", true)
    .ilike("status", "ativo")
    .in("modalidade", modalities)
    .order("nome")
    .limit(Math.max(1, Math.min(20, limit)));
  if (error) throw error;
  return data || [];
};

export const formatPublicCourseList = (
  courses: Array<Record<string, unknown>>,
  group: number,
) => {
  const labels: Record<number, string> = {
    1: "Cursos técnicos",
    2: "Graduação",
    3: "Pós-graduação",
    4: "Cursos livres / EAD",
  };
  if (courses.length === 0) {
    return [
      `No momento não há ${String(labels[group] || "cursos").toLocaleLowerCase("pt-BR")} publicados nessa categoria.`,
      "Você pode escrever o nome ou a área de interesse para eu pesquisar.",
    ].join("\n\n");
  }
  const list = courses
    .map((course) => `• *${String(course.nome || "Curso")}*`)
    .join("\n");
  return [
    `*${labels[group] || "Cursos publicados"}*`,
    list,
    "",
    "Escreva o nome do curso para ver os detalhes ou envie 0 para voltar ao menu principal.",
  ].join("\n");
};

const formatClass = (item: Record<string, unknown>) => {
  const location = [item.city, item.polo].filter(Boolean).join(" · ");
  const details = [
    location,
    item.shift ? `turno ${String(item.shift).toLocaleLowerCase("pt-BR")}` : "",
    item.startDate ? `início ${datePt(item.startDate)}` : "",
  ].filter(Boolean);
  return details.length > 0 ? `• ${details.join(" · ")}` : "";
};

export const formatCourseDetails = (
  course: CourseAgentCatalogMatch,
  settings: CourseAgentSettings,
) => {
  const lines = [`*${course.course_name}*`];
  const summary = [
    course.modality,
    course.area,
    course.workload ? `${course.workload} horas` : "",
    course.duration_months ? `${course.duration_months} meses` : "",
  ].filter(Boolean);
  if (summary.length > 0) lines.push(summary.join(" · "));
  const description = String(course.description || "").trim();
  if (description) lines.push("", description.slice(0, 900));
  if (settings.showPrices && Number(course.course_price || 0) > 0) {
    lines.push("", `Valor publicado: *${money(course.course_price)}*`);
  }

  const classes = Array.isArray(course.public_classes)
    ? course.public_classes.slice(0, 5)
    : [];
  if (settings.showOpenClasses && classes.length > 0) {
    const classLines = classes.map(formatClass).filter(Boolean);
    if (classLines.length > 0) lines.push("", "*Turmas publicadas:*", ...classLines);
  }
  lines.push(
    "",
    "Posso tirar outra dúvida sobre este curso. Se preferir, digite 6 para falar com o Comercial.",
  );
  return lines.join("\n").slice(0, 4096);
};

export const logCourseAgentEvent = async (
  admin: any,
  input: {
    connectionId: string;
    conversationId?: string | null;
    eventType:
      | "started"
      | "listed_courses"
      | "matched_faq"
      | "matched_course"
      | "unmatched"
      | "handoff";
    query?: string | null;
    confidence?: number | null;
    faqId?: string | null;
    courseId?: string | null;
    details?: Record<string, unknown>;
  },
) => {
  const { error } = await admin.from("whatsapp_course_agent_events").insert({
    conexao_id: input.connectionId,
    conversa_id: input.conversationId || null,
    event_type: input.eventType,
    query_text: input.query?.slice(0, 1000) || null,
    confidence: input.confidence == null
      ? null
      : finiteConfidence(input.confidence),
    faq_id: input.faqId || null,
    curso_id: input.courseId || null,
    details: input.details || {},
  });
  if (error) throw error;
};
