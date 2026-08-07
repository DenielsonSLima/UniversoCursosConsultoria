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

export type CourseAgentModalityKey =
  | "graduacao_ead"
  | "curso_livre"
  | "tecnico"
  | "especializacao";

export type GuidedCourseOption = {
  id: string;
  name: string;
  modality: string;
  area: string;
  description: string;
  workload: number | null;
  durationMonths: number | null;
  price: number | null;
};

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
  "*Qual modalidade você procura?*",
  "Vou filtrar o catálogo antes de mostrar as opções.",
  "",
  "1️⃣ Graduação EAD",
  "2️⃣ Cursos livres (online)",
  "3️⃣ Cursos técnicos",
  "4️⃣ Especialização / Pós-graduação",
  "5️⃣ Já sei o nome do curso",
  "6️⃣ Falar com o Comercial",
  "0️⃣ Voltar ao menu principal",
].join("\n");

const COURSE_AGENT_MODALITIES: Record<
  CourseAgentModalityKey,
  { label: string; databaseValues: string[]; areaExamples: string }
> = {
  graduacao_ead: {
    label: "Graduação EAD",
    databaseValues: ["SUPERIOR"],
    areaExamples: "gestão, tecnologia, educação ou saúde",
  },
  curso_livre: {
    label: "Cursos livres (online)",
    databaseValues: ["EAD", "LIVRE", "CURSO LIVRE"],
    areaExamples:
      "saúde, educação, tecnologia, administração, vendas, beleza ou segurança",
  },
  tecnico: {
    label: "Cursos técnicos",
    databaseValues: ["TECNICO", "TÉCNICO"],
    areaExamples: "saúde ou gestão",
  },
  especializacao: {
    label: "Especialização / Pós-graduação",
    databaseValues: ["ESPECIALIZACAO", "ESPECIALIZAÇÃO", "POS", "PÓS"],
    areaExamples: "educação, saúde, gestão ou tecnologia",
  },
};

export const courseAgentModalityForChoice = (
  choice: number | null,
): CourseAgentModalityKey | null => {
  if (choice === 1) return "graduacao_ead";
  if (choice === 2) return "curso_livre";
  if (choice === 3) return "tecnico";
  if (choice === 4) return "especializacao";
  return null;
};

export const courseAgentModalityFromText = (
  value: unknown,
): CourseAgentModalityKey | null => {
  const input = normalizeSearchText(value);
  if (/\b(tecnico|tecnica)\b/.test(input)) return "tecnico";
  if (/\b(especializacao|pos|pos graduacao)\b/.test(input)) {
    return "especializacao";
  }
  if (/\b(livre|livres|profissionalizante)\b/.test(input)) {
    return "curso_livre";
  }
  if (/\b(ead|graduacao|faculdade|superior)\b/.test(input)) {
    return "graduacao_ead";
  }
  return null;
};

export const courseAgentModalityLabel = (key: CourseAgentModalityKey) =>
  COURSE_AGENT_MODALITIES[key]?.label || "Cursos";

export const courseAgentAreaPrompt = (key: CourseAgentModalityKey) =>
  [
    `Certo: *${courseAgentModalityLabel(key)}*.`,
    `Qual área ou profissão interessa? Exemplos: ${COURSE_AGENT_MODALITIES[key].areaExamples}.`,
    "",
    "Escreva a área com suas palavras. Envie 0 para voltar ao menu principal.",
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

const normalizeSearchText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const isCourseInGuidedModality = (
  course: Record<string, unknown>,
  modality: CourseAgentModalityKey,
) => {
  const normalizedModality = normalizeSearchText(course.modalidade);
  const allowed = COURSE_AGENT_MODALITIES[modality].databaseValues
    .map(normalizeSearchText);
  if (!allowed.includes(normalizedModality)) return false;
  if (modality !== "graduacao_ead") return true;
  return normalizeSearchText(course.area).includes("100 online");
};

const guidedCourseScore = (
  course: Record<string, unknown>,
  interest: string,
) => {
  const query = normalizeSearchText(interest);
  if (!query) return 0;
  const name = normalizeSearchText(course.nome);
  const area = normalizeSearchText(course.area);
  const description = normalizeSearchText(course.descricao);
  const tokens = query.split(" ").filter((token) => token.length >= 3);
  let score = 0;
  if (area === query) score += 50;
  else if (area.includes(query)) score += 30;
  if (name === query) score += 60;
  else if (name.includes(query)) score += 35;
  if (description.includes(query)) score += 10;
  for (const token of tokens) {
    if (area.includes(token)) score += 8;
    if (name.includes(token)) score += 6;
    if (description.includes(token)) score += 2;
  }
  return score;
};

export const rankGuidedCourses = (
  courses: Array<Record<string, unknown>>,
  modality: CourseAgentModalityKey,
  interest: string,
  limit = 5,
): GuidedCourseOption[] =>
  courses
    .filter((course) => isCourseInGuidedModality(course, modality))
    .map((course) => ({ course, score: guidedCourseScore(course, interest) }))
    .filter((item) => item.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      String(left.course.nome || "").localeCompare(
        String(right.course.nome || ""),
        "pt-BR",
      )
    )
    .slice(0, Math.max(1, Math.min(8, limit)))
    .map(({ course }) => ({
      id: String(course.id || ""),
      name: String(course.nome || "Curso"),
      modality: String(course.modalidade || ""),
      area: String(course.area || ""),
      description: String(course.descricao || ""),
      workload: Number(course.carga_horaria || 0) || null,
      durationMonths: Number(course.duracao_meses || 0) || null,
      price: Number(course.valor || 0) || null,
    }))
    .filter((course) => Boolean(course.id));

export const getGuidedCourseMatches = async (
  admin: any,
  modality: CourseAgentModalityKey,
  interest: string,
  limit = 5,
) => {
  const { data, error } = await admin
    .from("cursos")
    .select(
      "id,nome,modalidade,area,descricao,carga_horaria,duracao_meses,valor",
    )
    .eq("publicar_site", true)
    .ilike("status", "ativo")
    .in("modalidade", COURSE_AGENT_MODALITIES[modality].databaseValues)
    .order("nome")
    .limit(200);
  if (error) throw error;
  return rankGuidedCourses(data || [], modality, interest, limit);
};

export const getGuidedCourseById = async (
  admin: any,
  courseId: string,
): Promise<CourseAgentCatalogMatch | null> => {
  const { data, error } = await admin
    .from("cursos")
    .select(
      "id,nome,modalidade,area,descricao,carga_horaria,duracao_meses,valor",
    )
    .eq("id", courseId)
    .eq("publicar_site", true)
    .ilike("status", "ativo")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    course_id: String(data.id),
    course_name: String(data.nome || "Curso"),
    modality: data.modalidade,
    area: data.area,
    description: data.descricao,
    workload: Number(data.carga_horaria || 0) || null,
    duration_months: Number(data.duracao_meses || 0) || null,
    course_price: Number(data.valor || 0) || null,
    confidence: 1,
    public_classes: [],
  };
};

export const formatGuidedCourseOptions = (
  courses: GuidedCourseOption[],
  modality: CourseAgentModalityKey,
  interest: string,
  showPrices = true,
) => {
  const label = courseAgentModalityLabel(modality);
  if (courses.length === 0) {
    return [
      `Não encontrei *${label.toLocaleLowerCase("pt-BR")}* publicado para “${String(interest).slice(0, 80)}”.`,
      "Tente outra área ou profissão. Se preferir, digite 6 para falar com o Comercial.",
    ].join("\n\n");
  }
  const options = courses.map((course, index) => {
    const details = [
      course.workload ? `${course.workload}h` : "",
      showPrices && course.price ? money(course.price) : "",
    ].filter(Boolean);
    return `${index + 1}️⃣ *${course.name}*${
      details.length ? ` — ${details.join(" · ")}` : ""
    }`;
  });
  return [
    `Encontrei estas opções de *${label}* para “${String(interest).slice(0, 80)}”:`,
    "",
    ...options,
    "",
    "Responda com o número do curso para ver os detalhes.",
    "Para pesquisar outra área, escreva *outra área*. Para falar com o Comercial, digite 6.",
  ].join("\n");
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
