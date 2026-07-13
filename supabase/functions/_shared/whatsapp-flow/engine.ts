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
    data: { cpfLast4: cpf.slice(-4), matchSource: matchedAluno.match_source || null },
  });
  await sendFlowText(admin, { conversation: input.conversation, aluno: matchedAluno, phone: input.phone, text: flowText(settings.menu_message, verifiedInput) });
  await logEvent(admin, next, "verified", { alunoId: matchedAluno.id, matchSource: matchedAluno.match_source || null });
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

export const processWhatsAppFlow = async (admin: any, input: FlowInput) => {
  const settings = await getFlowSettings(admin);
  if (!settings.enabled) return;

  const session = await getSession(admin, input.conversation.id);
  if (session?.handoff_required || session?.status === "handoff") return;

  if (detectAttendantRequest(input.content)) return handoff(admin, settings, session, input, "requested_attendant");

  if (!session) {
    if (normalizeCpf(input.content)) return verifyCpf(admin, settings, null, input);
    const next = await saveSession(admin, {
      conversa_id: input.conversation.id,
      telefone: input.phone,
      aluno_id: input.alunoByPhone?.id || input.conversation?.aluno_id || null,
      status: "awaiting_cpf",
      attempts: 0,
      handoff_required: false,
      data: {},
    });
    await sendFlowText(admin, { conversation: input.conversation, aluno: input.alunoByPhone, phone: input.phone, text: settings.welcome_message });
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

  const option = parseMenuNumber(input.content);
  if (option === 1 || detectLinkRequest(input.content)) return offerPayment(admin, settings, session, input, "link");
  if (option === 2 || detectPixRequest(input.content)) return offerPayment(admin, settings, session, input, "pix");
  if (option === 3 || detectIrpfRequest(input.content)) return offerIrpf(admin, settings, session, input);
  if (option === 4) return handoff(admin, settings, session, input, "menu_attendant");
  return fallback(admin, settings, session, input);
};
