import { getFlowSettings } from "./config.ts";
import {
  detectAttendantRequest,
  detectIrpfRequest,
  detectLinkRequest,
  detectPixRequest,
  normalizeCpf,
  parseMenuNumber,
  renderFlowText,
} from "./format.ts";
import {
  findFlowBuilderOption,
  FlowBuilderDefinition,
  FlowBuilderNode,
  FlowBuilderOption,
  parseFlowBuilder,
  renderFlowBuilderNode,
  renderFlowBuilderTemplate,
} from "./definition.ts";
import {
  formatIrpfOptionsList,
  getIrpfYearOptions,
  IrpfYearOption,
  issueIrpfDocument,
} from "./irpf.ts";
import {
  formatOptionsList,
  getPaymentOptions,
  PaymentMethod,
  PaymentOption,
  paymentValueFor,
} from "./payment.ts";
import {
  COURSE_AGENT_MENU,
  CourseAgentSettings,
  CourseAgentModalityKey,
  courseAgentAreaPrompt,
  courseAgentModalityForChoice,
  courseAgentModalityFromText,
  courseAgentModalityLabel,
  formatCourseDetails,
  formatGuidedCourseOptions,
  getCourseAgentSettings,
  getGuidedCourseById,
  getGuidedCourseMatches,
  logCourseAgentEvent,
  matchCourseAgentKnowledge,
  selectCourseAgentAnswer,
} from "./course-agent.ts";
import { sendFlowText } from "./sender.ts";
import { findAlunoByPhoneAndCpf } from "../whatsapp.ts";

type FlowInput = {
  conversation: any;
  alunoByPhone?: any | null;
  phone: string;
  content: string;
};

const logEvent = async (admin: any, session: any, type: string, details: Record<string, unknown> = {}) => {
  await admin.from("whatsapp_flow_events").insert({
    session_id: session?.id || null,
    conversa_id: session?.conversa_id || details.conversaId || null,
    aluno_id: session?.aluno_id || details.alunoId || null,
    event_type: type,
    details,
  });
};

const getSession = async (admin: any, conversaId: string) => {
  const { data, error } = await admin
    .from("whatsapp_flow_sessions")
    .select("*")
    .eq("conversa_id", conversaId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const saveSession = async (admin: any, input: Record<string, unknown>) => {
  const { data, error } = await admin
    .from("whatsapp_flow_sessions")
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "conversa_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

const handoff = async (admin: any, settings: any, session: any, input: FlowInput, reason: string) => {
  const next = await saveSession(admin, {
    conversa_id: input.conversation.id,
    telefone: input.phone,
    aluno_id: session?.aluno_id || input.alunoByPhone?.id || input.conversation?.aluno_id || null,
    status: "handoff",
    handoff_required: true,
    attempts: session?.attempts || 0,
    data: { ...(session?.data || {}), handoffReason: reason },
  });
  await sendFlowText(admin, {
    conversation: input.conversation,
    aluno: input.alunoByPhone || null,
    phone: input.phone,
    text: settings.handoff_message,
  });
  await logEvent(admin, next, "handoff", { reason });
};

const processCsatResponse = async (
  admin: any,
  session: any,
  input: FlowInput,
) => {
  const score = parseMenuNumber(input.content);
  if (score === null || score < 0 || score > 5) {
    const next = await saveSession(admin, {
      ...session,
      conversa_id: input.conversation.id,
      telefone: input.phone,
      aluno_id:
        session?.aluno_id ||
        input.alunoByPhone?.id ||
        input.conversation?.aluno_id ||
        null,
      status: "awaiting_csat",
      handoff_required: false,
      attempts: Number(session?.attempts || 0) + 1,
    });
    await sendFlowText(admin, {
      conversation: input.conversation,
      aluno: input.alunoByPhone,
      phone: input.phone,
      text:
        "Para concluir, responda somente com uma nota de *0 a 5*, em que 0 é muito insatisfeito e 5 é muito satisfeito.",
    });
    return next;
  }

  await sendFlowText(admin, {
    conversation: input.conversation,
    aluno: input.alunoByPhone,
    phone: input.phone,
    text:
      score >= 4
        ? "Obrigado pela avaliação! Ficamos felizes em ajudar. Atendimento encerrado."
        : "Obrigado pela avaliação. Ela foi registrada e será usada para melhorarmos. Atendimento encerrado.",
  });

  const closedAt = new Date().toISOString();
  const { error: conversationError } = await admin
    .from("whatsapp_conversas")
    .update({
      status: "arquivada",
      status_atendimento: "solucionada",
      csat_score: score,
      unread_count: 0,
      closed_at: closedAt,
      closed_reason: "csat_response",
      updated_at: closedAt,
    })
    .eq("id", input.conversation.id);
  if (conversationError) throw conversationError;

  const next = await saveSession(admin, {
    ...session,
    conversa_id: input.conversation.id,
    telefone: input.phone,
    aluno_id:
      session?.aluno_id ||
      input.alunoByPhone?.id ||
      input.conversation?.aluno_id ||
      null,
    status: "closed",
    handoff_required: false,
    attempts: 0,
    data: {
      ...(session?.data || {}),
      csatScore: score,
      closedReason: "csat_response",
      closedAt,
    },
  });
  await logEvent(admin, next, "csat_received", { score });
  return next;
};

const flowText = (text: unknown, input: FlowInput) =>
  renderFlowText(text, { aluno: input.alunoByPhone, conversation: input.conversation });

const verifyCpf = async (admin: any, settings: any, session: any, input: FlowInput) => {
  const cpf = normalizeCpf(input.content);
  if (!cpf) {
    const attempts = Number(session?.attempts || 0) + 1;
    const next = await saveSession(admin, {
      conversa_id: input.conversation.id,
      telefone: input.phone,
      aluno_id: input.alunoByPhone?.id || input.conversation?.aluno_id || null,
      status: "awaiting_cpf",
      attempts,
      data: session?.data || {},
    });
    if (attempts >= Number(settings.max_attempts || 2)) return handoff(admin, settings, next, input, "invalid_cpf");
    await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: settings.invalid_cpf_message });
    return;
  }

  const matchedAluno = await findAlunoByPhoneAndCpf(admin, input.phone, cpf);
  const verifiedInput = { ...input, alunoByPhone: matchedAluno || input.alunoByPhone || null };

  if (!matchedAluno?.id) {
    const next = await saveSession(admin, {
      conversa_id: input.conversation.id,
      telefone: input.phone,
      aluno_id: input.alunoByPhone?.id || null,
      status: "handoff",
      attempts: 0,
      handoff_required: true,
      data: { cpfLast4: cpf.slice(-4), reason: "cpf_phone_mismatch" },
    });
    await sendFlowText(admin, { conversation: input.conversation, aluno: verifiedInput.alunoByPhone, phone: input.phone, text: settings.mismatch_message });
    await logEvent(admin, next, "cpf_mismatch", { hasAlunoByPhone: Boolean(input.alunoByPhone?.id) });
    return;
  }

  const next = await saveSession(admin, {
    conversa_id: input.conversation.id,
    telefone: input.phone,
    aluno_id: matchedAluno.id,
    status: "menu",
    verified_at: new Date().toISOString(),
    attempts: 0,
    handoff_required: false,
    data: { ...(session?.data || {}), cpfLast4: cpf.slice(-4), matchSource: matchedAluno.match_source || null },
  });
  await logEvent(admin, next, "verified", { alunoId: matchedAluno.id, matchSource: matchedAluno.match_source || null });

  const pendingAction = String(session?.data?.pendingAction || "");
  if (pendingAction === "link") return offerPayment(admin, settings, next, verifiedInput, "link");
  if (pendingAction === "pix") return offerPayment(admin, settings, next, verifiedInput, "pix");
  if (pendingAction === "irpf") return offerIrpf(admin, settings, next, verifiedInput);
  await sendFlowText(admin, { conversation: input.conversation, aluno: matchedAluno, phone: input.phone, text: flowText(settings.menu_message, verifiedInput) });
};

const sendPayment = async (
  admin: any,
  settings: any,
  session: any,
  input: FlowInput,
  option: PaymentOption,
  method: PaymentMethod,
) => {
  const value = paymentValueFor(option, method);
  const intro = method === "pix" ? settings.pix_intro_message : settings.link_intro_message;
  await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: intro, previewUrl: method === "link" });
  await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: value, previewUrl: method === "link" });
  const next = await saveSession(admin, {
    ...session,
    status: "menu",
    attempts: 0,
    selected_payment_method: method,
    data: { ...(session?.data || {}), lastReceivableId: option.id },
  });
  await logEvent(admin, next, "payment_sent", { method, receivableId: option.id });
};

const offerPayment = async (admin: any, settings: any, session: any, input: FlowInput, method: PaymentMethod) => {
  const alunoId = session?.aluno_id || input.alunoByPhone?.id;
  if (!alunoId) return handoff(admin, settings, session, input, "missing_student");

  const options = await getPaymentOptions(admin, alunoId, method);
  if (options.length === 0) {
    const next = await saveSession(admin, {
      ...session,
      status: "handoff",
      handoff_required: true,
      selected_payment_method: method,
      data: { ...(session?.data || {}), noReceivablesMethod: method },
    });
    await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: settings.no_receivables_message });
    await logEvent(admin, next, "no_receivables", { method });
    return;
  }

  if (options.length === 1) return sendPayment(admin, settings, session, input, options[0], method);

  const next = await saveSession(admin, {
    ...session,
    status: "choosing_receivable",
    attempts: 0,
    selected_payment_method: method,
    data: { ...(session?.data || {}), options },
  });
  await sendFlowText(admin, {
    conversation: input.conversation,
    aluno: input.alunoByPhone,
    phone: input.phone,
    text: `${settings.receivable_choice_message}\n\n${formatOptionsList(options)}`,
  });
  await logEvent(admin, next, "options_presented", { method, count: options.length });
};

const sendIrpf = async (
  admin: any,
  settings: any,
  session: any,
  input: FlowInput,
  option: IrpfYearOption,
) => {
  const issued = await issueIrpfDocument(admin, option);
  await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: settings.irpf_ready_message });
  await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: settings.irpf_link_intro_message });
  await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: issued.url, previewUrl: true });
  const next = await saveSession(admin, {
    ...session,
    status: "menu",
    attempts: 0,
    data: { ...(session?.data || {}), lastIrpfYear: option.year, lastIrpfCode: issued.code },
  });
  await logEvent(admin, next, "irpf_sent", { year: option.year, code: issued.code });
};

const offerIrpf = async (admin: any, settings: any, session: any, input: FlowInput) => {
  const alunoId = session?.aluno_id || input.alunoByPhone?.id;
  if (!alunoId) return handoff(admin, settings, session, input, "missing_student_irpf");

  const result = await getIrpfYearOptions(admin, alunoId);
  if (!result.eligible) {
    const next = await saveSession(admin, { ...session, status: "handoff", handoff_required: true, data: { ...(session?.data || {}), irpfReason: "not_technical" } });
    await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: settings.irpf_not_eligible_message });
    await logEvent(admin, next, "irpf_not_eligible", { alunoId });
    return;
  }
  if (result.options.length === 0) {
    const next = await saveSession(admin, { ...session, status: "handoff", handoff_required: true, data: { ...(session?.data || {}), irpfReason: "no_years" } });
    await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: settings.irpf_no_years_message });
    await logEvent(admin, next, "irpf_no_years", { alunoId });
    return;
  }
  if (result.options.length === 1) return sendIrpf(admin, settings, session, input, result.options[0]);

  const next = await saveSession(admin, {
    ...session,
    status: "choosing_irpf_year",
    attempts: 0,
    data: { ...(session?.data || {}), irpfOptions: result.options },
  });
  await sendFlowText(admin, {
    conversation: input.conversation,
    aluno: input.alunoByPhone,
    phone: input.phone,
    text: `${settings.irpf_year_choice_message}\n\n${formatIrpfOptionsList(result.options)}`,
  });
  await logEvent(admin, next, "irpf_years_presented", { count: result.options.length });
};

const fallback = async (admin: any, settings: any, session: any, input: FlowInput) => {
  const attempts = Number(session?.attempts || 0) + 1;
  const next = await saveSession(admin, { ...session, attempts });
  if (attempts >= Number(settings.max_attempts || 2)) return handoff(admin, settings, next, input, "fallback_limit");
  await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: flowText(`${settings.fallback_message}\n\n${settings.menu_message}`, input) });
};

const requestCpfFor = async (
  admin: any,
  settings: any,
  session: any,
  input: FlowInput,
  pendingAction: "link" | "pix" | "irpf",
) => {
  const next = await saveSession(admin, {
    ...session,
    conversa_id: input.conversation.id,
    telefone: input.phone,
    aluno_id: input.alunoByPhone?.id || input.conversation?.aluno_id || session?.aluno_id || null,
    status: "awaiting_cpf",
    verified_at: null,
    attempts: 0,
    handoff_required: false,
    selected_payment_method: pendingAction === "irpf" ? null : pendingAction,
    data: { ...(session?.data || {}), pendingAction },
  });
  await sendFlowText(admin, {
    conversation: input.conversation,
    aluno: input.alunoByPhone,
    phone: input.phone,
    text: settings.welcome_message,
  });
  await logEvent(admin, next, "cpf_requested", { pendingAction });
};

const INSTITUTION_MENU =
  "Qual instituição você estuda?\n\n1️⃣ Universo Cursos e Consultoria\n2️⃣ Anhanguera\n3️⃣ Unopar";
const POLO_MENU =
  "Qual unidade?\n\n1️⃣ Japoatã\n2️⃣ Propriá\n3️⃣ Aquidabã\n4️⃣ Porto da Folha\n5️⃣ Outra";
const STUDENT_HELP_MENU =
  "Como podemos ajudar?\n\n1️⃣ Nota e frequência\n2️⃣ Financeiro\n3️⃣ Falar com atendente";
const MODALITY_MENU =
  "Qual modalidade?\n\n1️⃣ Curso Técnico\n2️⃣ Graduação\n3️⃣ Pós-graduação\n4️⃣ Curso Livre";
const CITY_MENU =
  "Em qual cidade?\n\n1️⃣ Japoatã\n2️⃣ Propriá\n3️⃣ Aquidabã\n4️⃣ Porto da Folha\n5️⃣ Outra cidade";
const FINANCE_MENU =
  "Como o Financeiro pode ajudar?\n\n1️⃣ Boleto ou link de pagamento\n2️⃣ PIX Copia e Cola\n3️⃣ Declaração para IRPF\n4️⃣ Falar com atendente";
const ATTENDANT_MENU =
  "Qual setor você deseja?\n\n1️⃣ Comercial\n2️⃣ Secretaria\n3️⃣ Financeiro\n4️⃣ Coordenação\n5️⃣ Polo Japoatã\n6️⃣ Polo Propriá\n7️⃣ Polo Aquidabã\n8️⃣ Polo Porto da Folha\n9️⃣ Anhanguera\n🔟 Unopar";

const POLO_CHOICES: Record<number, string> = {
  1: "Japoatã",
  2: "Propriá",
  3: "Aquidabã",
  4: "Porto da Folha",
};

const normalizeLookup = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

const updateConversationRouting = async (
  admin: any,
  input: FlowInput,
  updates: Record<string, unknown>,
) => {
  const { data, error } = await admin
    .from("whatsapp_conversas")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", input.conversation.id)
    .select("*")
    .single();
  if (error) throw error;
  input.conversation = data;
  return data;
};

const findPoloByLabel = async (admin: any, label: string) => {
  const target = normalizeLookup(label);
  const { data, error } = await admin
    .from("polos")
    .select("id,nome,cidade")
    .ilike("status", "ativo");
  if (error) throw error;
  return (data || []).find((polo: any) => {
    const city = normalizeLookup(polo.cidade);
    const name = normalizeLookup(polo.nome);
    return city === target || city.includes(target) || name.includes(target);
  }) || null;
};

const findDefaultRoutingPolo = async (admin: any) => {
  const { data, error } = await admin
    .from("polos")
    .select("id,nome,cidade")
    .eq("status", "ativo")
    .eq("is_matriz", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const saveRoutingStage = async (
  admin: any,
  session: any,
  input: FlowInput,
  stage: string,
  data: Record<string, unknown> = {},
) =>
  saveSession(admin, {
    ...session,
    conversa_id: input.conversation.id,
    telefone: input.phone,
    aluno_id:
      session?.aluno_id ||
      input.alunoByPhone?.id ||
      input.conversation?.aluno_id ||
      null,
    status: "menu",
    handoff_required: false,
    attempts: 0,
    data: { ...(session?.data || {}), ...data, stage },
  });

const askRoutingStage = async (
  admin: any,
  session: any,
  input: FlowInput,
  stage: string,
  message: string,
  data: Record<string, unknown> = {},
) => {
  const next = await saveRoutingStage(admin, session, input, stage, data);
  await sendFlowText(admin, {
    conversation: input.conversation,
    aluno: input.alunoByPhone,
    phone: input.phone,
    text: message,
  });
  await logEvent(admin, next, "routing_stage", { stage });
};

const routeToTeam = async (
  admin: any,
  settings: any,
  session: any,
  input: FlowInput,
  route: {
    setor: string;
    poloId?: string | null;
    subAssunto: string;
    institution?: string;
  },
) => {
  await updateConversationRouting(admin, input, {
    setor: route.setor,
    polo_id: route.poloId || null,
    instituicao: route.institution || "universo",
    sub_assunto: route.subAssunto,
    status_atendimento: "pendente_setor",
  });
  return handoff(admin, settings, session, input, `routing:${route.subAssunto}`);
};

const redirectToInstitution = async (
  admin: any,
  session: any,
  input: FlowInput,
  institution: "anhanguera" | "unopar",
) => {
  const { data: target, error } = await admin
    .from("whatsapp_conexoes")
    .select("id,nome,telefone,status")
    .eq("instituicao", institution)
    .eq("status", "ativo")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const label = institution === "anhanguera" ? "Anhanguera" : "Unopar";
  const phone = String(target?.telefone || "").trim();
  const defaultPolo = await findDefaultRoutingPolo(admin);
  const message = phone
    ? `O atendimento de *${label}* é realizado por uma linha própria.\n\nEntre em contato pelo número *${phone}*. A equipe responsável continuará seu atendimento por lá.`
    : `O atendimento de *${label}* é realizado por uma equipe própria. A linha ainda não tem um número público cadastrado; sua solicitação foi registrada para retorno.`;

  await updateConversationRouting(admin, input, {
    instituicao: institution,
    setor: "atendimento_geral",
    polo_id: defaultPolo?.id || null,
    sub_assunto: `Redirecionamento ${label}`,
    status_atendimento: "redirecionado_externo",
  });
  const next = await saveSession(admin, {
    ...session,
    conversa_id: input.conversation.id,
    telefone: input.phone,
    status: "handoff",
    handoff_required: true,
    attempts: 0,
    data: {
      ...(session?.data || {}),
      stage: "external_redirect",
      targetConnectionId: target?.id || null,
      targetInstitution: institution,
    },
  });
  await sendFlowText(admin, {
    conversation: input.conversation,
    aluno: input.alunoByPhone,
    phone: input.phone,
    text: message,
  });
  await logEvent(admin, next, "external_redirect", {
    institution,
    targetConnectionId: target?.id || null,
    hasPublicPhone: Boolean(phone),
  });
};

const resolveBuilderPolo = async (
  admin: any,
  session: any,
  input: FlowInput,
  option: FlowBuilderOption,
) => {
  const mode = option.poloMode || "inherit";
  if (mode === "none") return null;
  if (mode === "label") {
    return option.poloLabel
      ? await findPoloByLabel(admin, option.poloLabel)
      : null;
  }
  if (mode === "default") return findDefaultRoutingPolo(admin);

  const inheritedId = String(
    session?.data?.poloId || input.conversation?.polo_id || "",
  ).trim();
  if (!inheritedId) return null;
  return {
    id: inheritedId,
    nome: session?.data?.poloLabel || input.conversation?.polo_nome || null,
    cidade: session?.data?.poloLabel || input.conversation?.polo_nome || null,
  };
};

const applyBuilderContext = async (
  admin: any,
  session: any,
  input: FlowInput,
  option: FlowBuilderOption,
) => {
  const data: Record<string, unknown> = { ...(session?.data || {}) };
  const rememberKey = String(option.rememberKey || "").trim();
  if (/^[a-zA-Z0-9_]{1,60}$/.test(rememberKey)) {
    data[rememberKey] = option.rememberValue || option.label;
  }
  if (option.setInstitution) data.institution = option.setInstitution;

  const polo = await resolveBuilderPolo(admin, session, input, option);
  if (option.poloMode === "label" || option.poloMode === "default") {
    data.poloId = polo?.id || null;
    data.poloLabel = option.poloLabel || polo?.cidade || polo?.nome || null;
  } else if (option.poloMode === "none") {
    data.poloId = null;
    data.poloLabel = null;
  }

  const subject = renderFlowBuilderTemplate(option.subject, data);
  const hasRoutingMetadata = Boolean(
    option.setInstitution ||
    option.sector ||
    option.subject ||
    ["label", "default", "none"].includes(String(option.poloMode || "")),
  );
  if (hasRoutingMetadata) {
    const updates: Record<string, unknown> = {};
    if (option.setInstitution) updates.instituicao = option.setInstitution;
    if (option.sector) updates.setor = option.sector;
    if (option.subject) updates.sub_assunto = subject || option.label;
    if (
      option.sector ||
      ["label", "default", "none"].includes(String(option.poloMode || ""))
    ) updates.polo_id = polo?.id || null;
    await updateConversationRouting(admin, input, updates);
  }

  return { data, poloId: polo?.id || null, subject };
};

const showBuilderNode = async (
  admin: any,
  builder: FlowBuilderDefinition,
  node: FlowBuilderNode,
  session: any,
  input: FlowInput,
  data: Record<string, unknown> = {},
) => {
  const next = await saveSession(admin, {
    ...session,
    conversa_id: input.conversation.id,
    telefone: input.phone,
    aluno_id:
      session?.aluno_id ||
      input.alunoByPhone?.id ||
      input.conversation?.aluno_id ||
      null,
    status: "menu",
    attempts: 0,
    handoff_required: false,
    data: {
      ...(session?.data || {}),
      ...data,
      builderVersion: builder.version,
      builderNodeId: node.id,
    },
  });
  await sendFlowText(admin, {
    conversation: input.conversation,
    aluno: input.alunoByPhone,
    phone: input.phone,
    text: flowText(renderFlowBuilderNode(node), input),
  });
  await logEvent(admin, next, "builder_node", {
    nodeId: node.id,
    optionCount: node.options.filter((option) => option.enabled).length,
  });
  return next;
};

const startBuilderFlow = async (
  admin: any,
  settings: any,
  builder: FlowBuilderDefinition,
  session: any,
  input: FlowInput,
) => {
  const startNode = builder.nodes.find((node) =>
    node.id === builder.startNodeId && node.enabled
  );
  if (!startNode) {
    return handoff(
      admin,
      settings,
      session,
      input,
      "builder_start_inactive",
    );
  }
  const next = await showBuilderNode(admin, builder, startNode, session, input);
  await logEvent(admin, next, "started", {
    conversaId: input.conversation.id,
    builderVersion: builder.version,
  });
};

const safeLogCourseAgentEvent = async (
  admin: any,
  payload: Parameters<typeof logCourseAgentEvent>[1],
) => {
  try {
    await logCourseAgentEvent(admin, payload);
  } catch (error) {
    console.error("whatsapp_course_agent_event_failed", error);
  }
};

const routeCourseAgentToCommercial = async (
  admin: any,
  settings: any,
  courseSettings: CourseAgentSettings,
  session: any,
  input: FlowInput,
  reason: string,
) => {
  const connectionId = String(input.conversation?.conexao_id || "").trim();
  const routedPoloId = String(
    session?.data?.poloId || input.conversation?.polo_id || "",
  ).trim();
  if (!routedPoloId) {
    const next = await saveSession(admin, {
      ...session,
      conversa_id: input.conversation.id,
      telefone: input.phone,
      aluno_id:
        session?.aluno_id ||
        input.alunoByPhone?.id ||
        input.conversation?.aluno_id ||
        null,
      status: "course_agent",
      handoff_required: false,
      attempts: 0,
      data: {
        ...(session?.data || {}),
        courseAgentActive: true,
        courseAgentStage: "polo",
        courseAgentPendingHandoffReason: reason,
      },
    });
    await sendFlowText(admin, {
      conversation: input.conversation,
      aluno: input.alunoByPhone,
      phone: input.phone,
      text:
        `Para encaminhar ao Comercial correto, qual unidade fica melhor para você?\n\n${POLO_MENU}`,
    });
    return next;
  }

  const interest = String(session?.data?.courseAgentInterest || "").trim();
  const selectedCourse = String(
    session?.data?.courseAgentSelectedCourseName || "",
  ).trim();
  const selectedModality = String(
    session?.data?.courseAgentModality || "",
  ).trim();
  const subjectDetails = [
    selectedCourse,
    interest && interest !== selectedCourse ? interest : "",
    selectedModality && !selectedCourse
      ? courseAgentModalityLabel(selectedModality as CourseAgentModalityKey)
      : "",
  ].filter(Boolean);
  await safeLogCourseAgentEvent(admin, {
    connectionId,
    conversationId: input.conversation.id,
    eventType: "handoff",
    query: input.content,
    details: { reason },
  });
  return routeToTeam(
    admin,
    { ...settings, handoff_message: courseSettings.handoffMessage },
    session,
    input,
    {
      setor: "comercial_matriculas",
      poloId: routedPoloId,
      subAssunto: subjectDetails.length > 0
        ? `Interesse em curso — ${subjectDetails.join(" — ").slice(0, 180)}`
        : "Dúvida sobre cursos",
      institution: String(input.conversation?.instituicao || "universo"),
    },
  );
};

const startCourseAgent = async (
  admin: any,
  settings: any,
  session: any,
  input: FlowInput,
) => {
  const connectionId = String(input.conversation?.conexao_id || "").trim();
  const courseSettings = await getCourseAgentSettings(admin, connectionId);
  if (!courseSettings.enabled) {
    return routeCourseAgentToCommercial(
      admin,
      settings,
      courseSettings,
      session,
      input,
      "agent_disabled",
    );
  }

  const next = await saveSession(admin, {
    ...session,
    conversa_id: input.conversation.id,
    telefone: input.phone,
    aluno_id:
      session?.aluno_id ||
      input.alunoByPhone?.id ||
      input.conversation?.aluno_id ||
      null,
    status: "course_agent",
    attempts: 0,
    handoff_required: false,
    data: {
      ...(session?.data || {}),
      courseAgentActive: true,
      courseAgentStage: "modality",
      courseAgentModality: null,
      courseAgentInterest: null,
      courseAgentOptions: [],
      courseAgentClarifications: 0,
      courseAgentAwaitingQuestion: false,
    },
  });
  await sendFlowText(admin, {
    conversation: input.conversation,
    aluno: input.alunoByPhone,
    phone: input.phone,
    text: `${courseSettings.greetingMessage}\n\n${COURSE_AGENT_MENU}`,
  });
  await safeLogCourseAgentEvent(admin, {
    connectionId,
    conversationId: input.conversation.id,
    eventType: "started",
  });
  return next;
};

const processCourseAgent = async (
  admin: any,
  settings: any,
  builder: FlowBuilderDefinition | null,
  session: any,
  input: FlowInput,
) => {
  const connectionId = String(input.conversation?.conexao_id || "").trim();
  const courseSettings = await getCourseAgentSettings(admin, connectionId);
  if (!courseSettings.enabled) {
    return routeCourseAgentToCommercial(
      admin,
      settings,
      courseSettings,
      session,
      input,
      "agent_disabled_during_session",
    );
  }

  const choice = parseMenuNumber(input.content);
  if (choice === 0 || /\b(voltar|menu\s*principal|inicio|início)\b/i.test(input.content)) {
    if (builder) {
      const startNode = builder.nodes.find((node) =>
        node.id === builder.startNodeId && node.enabled
      );
      if (!startNode) {
        return routeCourseAgentToCommercial(
          admin,
          settings,
          courseSettings,
          session,
          input,
          "main_menu_unavailable",
        );
      }
      return showBuilderNode(admin, builder, startNode, session, input, {
        courseAgentActive: false,
        courseAgentStage: null,
        courseAgentModality: null,
        courseAgentInterest: null,
        courseAgentOptions: [],
        courseAgentClarifications: 0,
        courseAgentAwaitingQuestion: false,
      });
    }
    return askRoutingStage(admin, session, input, "main_menu", settings.menu_message, {
      courseAgentActive: false,
      courseAgentStage: null,
      courseAgentModality: null,
      courseAgentInterest: null,
      courseAgentOptions: [],
      courseAgentClarifications: 0,
      courseAgentAwaitingQuestion: false,
    });
  }

  if (
    choice === 6 ||
    /\b(comercial|vendedor|matricula|matrícula)\b/i.test(input.content)
  ) {
    return routeCourseAgentToCommercial(
      admin,
      settings,
      courseSettings,
      session,
      input,
      "requested_commercial",
    );
  }

  if (/\boutra\s+modalidade\b/i.test(input.content)) {
    const next = await saveSession(admin, {
      ...session,
      status: "course_agent",
      attempts: 0,
      data: {
        ...(session?.data || {}),
        courseAgentActive: true,
        courseAgentStage: "modality",
        courseAgentModality: null,
        courseAgentInterest: null,
        courseAgentOptions: [],
        courseAgentClarifications: 0,
        courseAgentAwaitingQuestion: false,
      },
    });
    await sendFlowText(admin, {
      conversation: input.conversation,
      aluno: input.alunoByPhone,
      phone: input.phone,
      text: COURSE_AGENT_MENU,
    });
    return next;
  }

  const stage = String(session?.data?.courseAgentStage || "modality");
  if (stage === "polo") {
    let polo: any | null = null;
    let poloLabel = "";
    if (choice && choice >= 1 && choice <= 4) {
      poloLabel = POLO_CHOICES[choice];
      polo = await findPoloByLabel(admin, poloLabel);
    } else if (choice === 5) {
      polo = await findDefaultRoutingPolo(admin);
      poloLabel = "Outra cidade";
    }
    if (!polo?.id) {
      await sendFlowText(admin, {
        conversation: input.conversation,
        aluno: input.alunoByPhone,
        phone: input.phone,
        text:
          `Escolha uma unidade para eu encaminhar ao Comercial responsável.\n\n${POLO_MENU}`,
      });
      return session;
    }
    const next = await saveSession(admin, {
      ...session,
      status: "course_agent",
      attempts: 0,
      data: {
        ...(session?.data || {}),
        poloId: polo.id,
        poloLabel,
      },
    });
    return routeCourseAgentToCommercial(
      admin,
      settings,
      courseSettings,
      next,
      input,
      String(
        session?.data?.courseAgentPendingHandoffReason ||
          "guided_course_handoff",
      ),
    );
  }

  if (stage === "modality") {
    const modality = courseAgentModalityForChoice(choice) ||
      courseAgentModalityFromText(input.content);
    if (modality) {
      const next = await saveSession(admin, {
        ...session,
        status: "course_agent",
        attempts: 0,
        data: {
          ...(session?.data || {}),
          courseAgentActive: true,
          courseAgentStage: "area",
          courseAgentModality: modality,
          courseAgentInterest: null,
          courseAgentOptions: [],
          courseAgentClarifications: 0,
          courseAgentAwaitingQuestion: false,
        },
      });
      await sendFlowText(admin, {
        conversation: input.conversation,
        aluno: input.alunoByPhone,
        phone: input.phone,
        text: courseAgentAreaPrompt(modality),
      });
      return next;
    }

    if (choice !== 5) {
      const next = await saveSession(admin, {
        ...session,
        status: "course_agent",
        attempts: Number(session?.attempts || 0) + 1,
      });
      await sendFlowText(admin, {
        conversation: input.conversation,
        aluno: input.alunoByPhone,
        phone: input.phone,
        text: `Escolha uma modalidade para eu filtrar o catálogo.\n\n${COURSE_AGENT_MENU}`,
      });
      return next;
    }

    const next = await saveSession(admin, {
      ...session,
      status: "course_agent",
      attempts: 0,
      data: {
        ...(session?.data || {}),
        courseAgentActive: true,
        courseAgentStage: "question",
        courseAgentModality: null,
        courseAgentInterest: null,
        courseAgentOptions: [],
        courseAgentClarifications: 0,
        courseAgentAwaitingQuestion: true,
      },
    });
    await sendFlowText(admin, {
      conversation: input.conversation,
      aluno: input.alunoByPhone,
      phone: input.phone,
      text: "Escreva sua dúvida e, se for sobre um curso específico, informe também o nome do curso.",
    });
    return next;
  }

  const selectedModality = String(
    session?.data?.courseAgentModality || "",
  ) as CourseAgentModalityKey;
  const hasSelectedModality = [
    "graduacao_ead",
    "curso_livre",
    "tecnico",
    "especializacao",
  ].includes(selectedModality);

  if (stage === "area" || stage === "course_choice") {
    if (!hasSelectedModality) {
      const next = await saveSession(admin, {
        ...session,
        status: "course_agent",
        attempts: 0,
        data: {
          ...(session?.data || {}),
          courseAgentActive: true,
          courseAgentStage: "modality",
          courseAgentModality: null,
          courseAgentInterest: null,
          courseAgentOptions: [],
        },
      });
      await sendFlowText(admin, {
        conversation: input.conversation,
        aluno: input.alunoByPhone,
        phone: input.phone,
        text: COURSE_AGENT_MENU,
      });
      return next;
    }

    if (stage === "course_choice") {
      const options = Array.isArray(session?.data?.courseAgentOptions)
        ? session.data.courseAgentOptions
        : [];
      const selected = choice ? options[choice - 1] : null;
      if (selected?.id) {
        const course = await getGuidedCourseById(admin, String(selected.id));
        if (course) {
          const next = await saveSession(admin, {
            ...session,
            status: "course_agent",
            attempts: 0,
            data: {
              ...(session?.data || {}),
              courseAgentActive: true,
              courseAgentStage: "question",
              courseAgentSelectedCourseId: course.course_id,
              courseAgentSelectedCourseName: course.course_name,
              courseAgentClarifications: 0,
              courseAgentAwaitingQuestion: true,
            },
          });
          await sendFlowText(admin, {
            conversation: input.conversation,
            aluno: input.alunoByPhone,
            phone: input.phone,
            text: `${formatCourseDetails(course, courseSettings)}\n\nAgora vou encaminhar seu interesse para um atendente do Comercial.`,
          });
          await safeLogCourseAgentEvent(admin, {
            connectionId,
            conversationId: input.conversation.id,
            eventType: "matched_course",
            query: String(session?.data?.courseAgentInterest || ""),
            confidence: 1,
            courseId: course.course_id,
            details: {
              modality: selectedModality,
              selectedFromGuidedSearch: true,
            },
          });
          return routeCourseAgentToCommercial(
            admin,
            settings,
            courseSettings,
            next,
            input,
            "guided_course_selected",
          );
        }
      }
    }

    if (/\boutra\s+[aá]rea\b/i.test(input.content)) {
      const next = await saveSession(admin, {
        ...session,
        status: "course_agent",
        attempts: 0,
        data: {
          ...(session?.data || {}),
          courseAgentActive: true,
          courseAgentStage: "area",
          courseAgentInterest: null,
          courseAgentOptions: [],
          courseAgentClarifications: 0,
        },
      });
      await sendFlowText(admin, {
        conversation: input.conversation,
        aluno: input.alunoByPhone,
        phone: input.phone,
        text: courseAgentAreaPrompt(selectedModality),
      });
      return next;
    }

    const interest = input.content.trim().slice(0, 120);
    const courses = await getGuidedCourseMatches(
      admin,
      selectedModality,
      interest,
      5,
    );
    const clarifications = Number(
      session?.data?.courseAgentClarifications || 0,
    );
    const next = await saveSession(admin, {
      ...session,
      status: "course_agent",
      attempts: courses.length > 0 ? 0 : Number(session?.attempts || 0) + 1,
      data: {
        ...(session?.data || {}),
        courseAgentActive: true,
        courseAgentStage: courses.length > 0 ? "course_choice" : "area",
        courseAgentInterest: interest,
        courseAgentOptions: courses,
        courseAgentClarifications: courses.length > 0
          ? 0
          : clarifications + 1,
        courseAgentAwaitingQuestion: false,
      },
    });
    await sendFlowText(admin, {
      conversation: input.conversation,
      aluno: input.alunoByPhone,
      phone: input.phone,
      text: formatGuidedCourseOptions(
        courses,
        selectedModality,
        interest,
        courseSettings.showPrices,
      ),
    });
    await safeLogCourseAgentEvent(admin, {
      connectionId,
      conversationId: input.conversation.id,
      eventType: courses.length > 0 ? "listed_courses" : "unmatched",
      query: interest,
      details: {
        modality: selectedModality,
        modalityLabel: courseAgentModalityLabel(selectedModality),
        count: courses.length,
      },
    });
    if (
      courses.length === 0 &&
      clarifications >= courseSettings.maxClarifications
    ) {
      return routeCourseAgentToCommercial(
        admin,
        settings,
        courseSettings,
        next,
        input,
        "guided_search_unmatched",
      );
    }
    return next;
  }

  const matches = await matchCourseAgentKnowledge(
    admin,
    connectionId,
    input.content,
  );
  const answer = selectCourseAgentAnswer(
    matches.faqs,
    matches.catalog,
    courseSettings.confidenceThreshold,
  );

  if (answer?.kind === "faq") {
    const next = await saveSession(admin, {
      ...session,
      status: "course_agent",
      attempts: 0,
      data: {
        ...(session?.data || {}),
        courseAgentActive: true,
        courseAgentClarifications: 0,
        courseAgentAwaitingQuestion: false,
      },
    });
    await sendFlowText(admin, {
      conversation: input.conversation,
      aluno: input.alunoByPhone,
      phone: input.phone,
      text: `${answer.match.answer}\n\nPosso responder outra dúvida. Para falar com o Comercial, digite 6.`,
    });
    await safeLogCourseAgentEvent(admin, {
      connectionId,
      conversationId: input.conversation.id,
      eventType: "matched_faq",
      query: input.content,
      confidence: answer.match.confidence,
      faqId: answer.match.faq_id,
      courseId: answer.match.curso_id || null,
    });
    return next;
  }

  if (answer?.kind === "course") {
    const next = await saveSession(admin, {
      ...session,
      status: "course_agent",
      attempts: 0,
      data: {
        ...(session?.data || {}),
        courseAgentActive: true,
        courseAgentStage: "question",
        courseAgentSelectedCourseId: answer.match.course_id,
        courseAgentSelectedCourseName: answer.match.course_name,
        courseAgentClarifications: 0,
        courseAgentAwaitingQuestion: false,
      },
    });
    await sendFlowText(admin, {
      conversation: input.conversation,
      aluno: input.alunoByPhone,
      phone: input.phone,
      text: formatCourseDetails(answer.match, courseSettings),
    });
    await safeLogCourseAgentEvent(admin, {
      connectionId,
      conversationId: input.conversation.id,
      eventType: "matched_course",
      query: input.content,
      confidence: answer.match.confidence,
      courseId: answer.match.course_id,
    });
    return routeCourseAgentToCommercial(
      admin,
      settings,
      courseSettings,
      next,
      input,
      "course_matched",
    );
  }

  const clarifications = Number(session?.data?.courseAgentClarifications || 0);
  await safeLogCourseAgentEvent(admin, {
    connectionId,
    conversationId: input.conversation.id,
    eventType: "unmatched",
    query: input.content,
    confidence: Math.max(
      ...[
        ...matches.faqs.map((item) => Number(item.confidence || 0)),
        ...matches.catalog.map((item) => Number(item.confidence || 0)),
        0,
      ],
    ),
  });
  if (clarifications < courseSettings.maxClarifications) {
    const next = await saveSession(admin, {
      ...session,
      status: "course_agent",
      attempts: Number(session?.attempts || 0) + 1,
      data: {
        ...(session?.data || {}),
        courseAgentActive: true,
        courseAgentClarifications: clarifications + 1,
        courseAgentAwaitingQuestion: true,
      },
    });
    await sendFlowText(admin, {
      conversation: input.conversation,
      aluno: input.alunoByPhone,
      phone: input.phone,
      text: courseSettings.fallbackMessage,
    });
    return next;
  }

  return routeCourseAgentToCommercial(
    admin,
    settings,
    courseSettings,
    session,
    input,
    "low_confidence",
  );
};

const processBuilderFlow = async (
  admin: any,
  settings: any,
  builder: FlowBuilderDefinition,
  session: any,
  input: FlowInput,
) => {
  const nodeId = String(session?.data?.builderNodeId || "");
  const node = builder.nodes.find((item) => item.id === nodeId && item.enabled);
  if (!node) return startBuilderFlow(admin, settings, builder, session, input);

  const choice = parseMenuNumber(input.content);
  const option = findFlowBuilderOption(node, choice);
  if (!option) {
    const attempts = Number(session?.attempts || 0) + 1;
    const next = await saveSession(admin, { ...session, attempts });
    if (attempts >= Number(settings.max_attempts || 2)) {
      return handoff(admin, settings, next, input, "builder_fallback_limit");
    }
    await sendFlowText(admin, {
      conversation: input.conversation,
      aluno: input.alunoByPhone,
      phone: input.phone,
      text: flowText(
        `${settings.fallback_message}\n\n${renderFlowBuilderNode(node)}`,
        input,
      ),
    });
    return;
  }

  const context = await applyBuilderContext(
    admin,
    session,
    input,
    option,
  );
  const nextSession = {
    ...session,
    attempts: 0,
    data: context.data,
  };

  if (option.action === "finance_link") {
    return requestCpfFor(admin, settings, nextSession, input, "link");
  }
  if (option.action === "finance_pix") {
    return requestCpfFor(admin, settings, nextSession, input, "pix");
  }
  if (option.action === "finance_irpf") {
    return requestCpfFor(admin, settings, nextSession, input, "irpf");
  }
  if (option.action === "course_agent") {
    return startCourseAgent(admin, settings, nextSession, input);
  }
  if (
    option.action === "redirect" &&
    (option.institution === "anhanguera" || option.institution === "unopar")
  ) {
    return redirectToInstitution(
      admin,
      nextSession,
      input,
      option.institution,
    );
  }
  if (option.action === "goto") {
    const target = builder.nodes.find((item) =>
      item.id === option.targetNodeId && item.enabled
    );
    if (!target) {
      return handoff(
        admin,
        settings,
        nextSession,
        input,
        `builder_target_unavailable:${option.targetNodeId || "missing"}`,
      );
    }
    return showBuilderNode(
      admin,
      builder,
      target,
      nextSession,
      input,
      context.data,
    );
  }
  if (option.action === "reply" && option.responseMessage) {
    await sendFlowText(admin, {
      conversation: input.conversation,
      aluno: input.alunoByPhone,
      phone: input.phone,
      text: flowText(option.responseMessage, input),
    });
  }
  if (
    option.action === "route" ||
    option.action === "handoff" ||
    option.action === "reply"
  ) {
    return routeToTeam(admin, settings, nextSession, input, {
      setor: option.sector || "atendimento_geral",
      poloId: context.poloId,
      subAssunto: context.subject || option.label,
      institution: option.setInstitution || undefined,
    });
  }

  return handoff(admin, settings, nextSession, input, "builder_action_invalid");
};

const processFinanceMenu = async (
  admin: any,
  settings: any,
  session: any,
  input: FlowInput,
) => {
  const option = parseMenuNumber(input.content);
  if (option === 1 || detectLinkRequest(input.content)) {
    return requestCpfFor(admin, settings, session, input, "link");
  }
  if (option === 2 || detectPixRequest(input.content)) {
    return requestCpfFor(admin, settings, session, input, "pix");
  }
  if (option === 3 || detectIrpfRequest(input.content)) {
    return requestCpfFor(admin, settings, session, input, "irpf");
  }
  if (option === 4 || detectAttendantRequest(input.content)) {
    const defaultPolo = await findDefaultRoutingPolo(admin);
    const poloId =
      String(session?.data?.poloId || input.conversation?.polo_id || "").trim()
      || defaultPolo?.id
      || null;
    return routeToTeam(admin, settings, session, input, {
      setor: "financeiro",
      poloId,
      subAssunto: "Atendimento financeiro",
    });
  }
  return askRoutingStage(
    admin,
    session,
    input,
    "finance_menu",
    `${settings.fallback_message}\n\n${FINANCE_MENU}`,
  );
};

const processUniverseRouting = async (
  admin: any,
  settings: any,
  session: any,
  input: FlowInput,
) => {
  const stage = String(session?.data?.stage || "main_menu");
  const option = parseMenuNumber(input.content);

  if (stage === "finance_menu") {
    return processFinanceMenu(admin, settings, session, input);
  }

  if (stage === "student_institution") {
    if (option === 1) {
      await updateConversationRouting(admin, input, { instituicao: "universo" });
      return askRoutingStage(admin, session, input, "student_polo", POLO_MENU, {
        institution: "universo",
      });
    }
    if (option === 2) return redirectToInstitution(admin, session, input, "anhanguera");
    if (option === 3) return redirectToInstitution(admin, session, input, "unopar");
    return askRoutingStage(
      admin,
      session,
      input,
      "student_institution",
      `${settings.fallback_message}\n\n${INSTITUTION_MENU}`,
    );
  }

  if (stage === "student_polo") {
    if (option && option >= 1 && option <= 4) {
      const poloLabel = POLO_CHOICES[option];
      const polo = await findPoloByLabel(admin, poloLabel);
      await updateConversationRouting(admin, input, {
        polo_id: polo?.id || null,
        sub_assunto: `Unidade ${poloLabel}`,
      });
      return askRoutingStage(
        admin,
        session,
        input,
        "student_help",
        STUDENT_HELP_MENU,
        { poloId: polo?.id || null, poloLabel },
      );
    }
    if (option === 5) {
      return routeToTeam(admin, settings, session, input, {
        setor: "atendimento_geral",
        subAssunto: "Aluno de outra unidade",
      });
    }
    return askRoutingStage(
      admin,
      session,
      input,
      "student_polo",
      `${settings.fallback_message}\n\n${POLO_MENU}`,
    );
  }

  if (stage === "student_help") {
    const poloId = String(session?.data?.poloId || "").trim() || null;
    if (option === 1) {
      return routeToTeam(admin, settings, session, input, {
        setor: "pedagogico_coordenacao",
        poloId,
        subAssunto: "Nota e frequência",
      });
    }
    if (option === 2) {
      await updateConversationRouting(admin, input, {
        setor: "financeiro",
        polo_id: poloId,
        sub_assunto: "Financeiro do aluno",
      });
      return askRoutingStage(
        admin,
        session,
        input,
        "finance_menu",
        FINANCE_MENU,
        { poloId },
      );
    }
    if (option === 3 || detectAttendantRequest(input.content)) {
      return routeToTeam(admin, settings, session, input, {
        setor: "atendimento_geral",
        poloId,
        subAssunto: "Atendimento ao aluno",
      });
    }
    return askRoutingStage(
      admin,
      session,
      input,
      "student_help",
      `${settings.fallback_message}\n\n${STUDENT_HELP_MENU}`,
    );
  }

  if (stage === "enrollment_modality") {
    const modalities: Record<number, string> = {
      1: "Curso Técnico",
      2: "Graduação",
      3: "Pós-graduação",
      4: "Curso Livre",
    };
    if (option && modalities[option]) {
      return askRoutingStage(
        admin,
        session,
        input,
        "enrollment_city",
        CITY_MENU,
        { modality: modalities[option] },
      );
    }
    return askRoutingStage(
      admin,
      session,
      input,
      "enrollment_modality",
      `${settings.fallback_message}\n\n${MODALITY_MENU}`,
    );
  }

  if (stage === "enrollment_city") {
    const modality = String(session?.data?.modality || "Matrícula");
    if (option && option >= 1 && option <= 4) {
      const poloLabel = POLO_CHOICES[option];
      const polo = await findPoloByLabel(admin, poloLabel);
      return routeToTeam(admin, settings, session, input, {
        setor: "comercial_matriculas",
        poloId: polo?.id || null,
        subAssunto: `${modality} — ${poloLabel}`,
      });
    }
    if (option === 5) {
      return routeToTeam(admin, settings, session, input, {
        setor: "comercial_matriculas",
        subAssunto: `${modality} — Outra cidade`,
      });
    }
    return askRoutingStage(
      admin,
      session,
      input,
      "enrollment_city",
      `${settings.fallback_message}\n\n${CITY_MENU}`,
    );
  }

  if (stage === "attendant_sector") {
    const sectorRoutes: Record<number, { setor: string; label: string }> = {
      1: { setor: "comercial_matriculas", label: "Comercial" },
      2: { setor: "secretaria", label: "Secretaria" },
      3: { setor: "financeiro", label: "Financeiro" },
      4: { setor: "pedagogico_coordenacao", label: "Coordenação" },
    };
    if (option && sectorRoutes[option]) {
      const route = sectorRoutes[option];
      const defaultPolo = await findDefaultRoutingPolo(admin);
      return routeToTeam(admin, settings, session, input, {
        setor: route.setor,
        poloId: defaultPolo?.id || null,
        subAssunto: route.label,
      });
    }
    if (option && option >= 5 && option <= 8) {
      const poloLabel = POLO_CHOICES[option - 4];
      const polo = await findPoloByLabel(admin, poloLabel);
      return routeToTeam(admin, settings, session, input, {
        setor: "atendimento_geral",
        poloId: polo?.id || null,
        subAssunto: `Polo ${poloLabel}`,
      });
    }
    if (option === 9) return redirectToInstitution(admin, session, input, "anhanguera");
    if (option === 10) return redirectToInstitution(admin, session, input, "unopar");
    return askRoutingStage(
      admin,
      session,
      input,
      "attendant_sector",
      `${settings.fallback_message}\n\n${ATTENDANT_MENU}`,
    );
  }

  if (option === 1) {
    return askRoutingStage(
      admin,
      session,
      input,
      "student_institution",
      INSTITUTION_MENU,
    );
  }
  if (option === 2) {
    return askRoutingStage(
      admin,
      session,
      input,
      "enrollment_modality",
      MODALITY_MENU,
    );
  }
  if (option === 3) {
    const defaultPolo = await findDefaultRoutingPolo(admin);
    await updateConversationRouting(admin, input, {
      setor: "financeiro",
      polo_id: defaultPolo?.id || null,
      sub_assunto: "Financeiro",
    });
    return askRoutingStage(
      admin,
      session,
      input,
      "finance_menu",
      FINANCE_MENU,
      { poloId: defaultPolo?.id || null },
    );
  }
  if (option === 4) {
    return startCourseAgent(admin, settings, session, input);
  }
  if (
    option === 5 ||
    option === 6 ||
    detectAttendantRequest(input.content)
  ) {
    return askRoutingStage(
      admin,
      session,
      input,
      "attendant_sector",
      ATTENDANT_MENU,
    );
  }
  return askRoutingStage(
    admin,
    session,
    input,
    "main_menu",
    `${settings.fallback_message}\n\n${settings.menu_message}`,
  );
};

export const processWhatsAppFlow = async (admin: any, input: FlowInput) => {
  const connectionId = String(input.conversation?.conexao_id || "").trim();
  const settings = await getFlowSettings(admin, connectionId || null);
  const builder = parseFlowBuilder(settings.routing_config?.flow_builder);

  const storedSession = await getSession(admin, input.conversation.id);
  if (
    storedSession?.status === "awaiting_csat" ||
    input.conversation?.status_atendimento === "aguardando_avaliacao"
  ) {
    return processCsatResponse(admin, storedSession, input);
  }
  if (!settings.enabled) return;
  const session = storedSession?.status === "closed" ? null : storedSession;
  if (session?.handoff_required || session?.status === "handoff") return;

  if (!session) {
    if (builder) {
      return startBuilderFlow(admin, settings, builder, null, input);
    }
    const next = await saveSession(admin, {
      conversa_id: input.conversation.id,
      telefone: input.phone,
      aluno_id: input.alunoByPhone?.id || input.conversation?.aluno_id || null,
      status: "menu",
      attempts: 0,
      handoff_required: false,
      data: {
        stage: settings.flow_type === "universo_main"
          ? "main_menu"
          : "financial_menu",
      },
    });
    await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: flowText(settings.menu_message, input) });
    await logEvent(admin, next, "started", { conversaId: input.conversation.id });
    return;
  }

  if (session.status === "awaiting_cpf") return verifyCpf(admin, settings, session, input);

  if (session.status === "choosing_receivable") {
    const choice = parseMenuNumber(input.content);
    const options = Array.isArray(session.data?.options) ? session.data.options : [];
    const option = choice ? options[choice - 1] : null;
    if (!option) return fallback(admin, settings, session, input);
    return sendPayment(admin, settings, session, input, option, session.selected_payment_method || "link");
  }

  if (session.status === "choosing_irpf_year") {
    const choice = parseMenuNumber(input.content);
    const options = Array.isArray(session.data?.irpfOptions) ? session.data.irpfOptions : [];
    const option = choice ? options[choice - 1] : null;
    if (!option) return fallback(admin, settings, session, input);
    return sendIrpf(admin, settings, session, input, option);
  }

  if (session?.data?.courseAgentActive === true) {
    return processCourseAgent(admin, settings, builder, session, input);
  }

  if (builder) {
    return processBuilderFlow(admin, settings, builder, session, input);
  }

  if (settings.flow_type === "universo_main") {
    return processUniverseRouting(admin, settings, session, input);
  }

  if (detectAttendantRequest(input.content)) {
    return handoff(admin, settings, session, input, "requested_attendant");
  }

  const option = parseMenuNumber(input.content);
  if (option === 1 || detectLinkRequest(input.content)) return requestCpfFor(admin, settings, session, input, "link");
  if (option === 2 || detectPixRequest(input.content)) return requestCpfFor(admin, settings, session, input, "pix");
  if (option === 3 || detectIrpfRequest(input.content)) return requestCpfFor(admin, settings, session, input, "irpf");
  if (option === 4) return handoff(admin, settings, session, input, "menu_attendant");
  return fallback(admin, settings, session, input);
};
