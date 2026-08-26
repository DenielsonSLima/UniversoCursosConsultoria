import {
  getCredential,
  isCredentialConfiguredForRoute,
} from "../api/credentials.ts";
import { normalizeCourseFinanceiroConfig } from "../../asaas/core/payment-methods.ts";
import { resolveEadCharge } from "./ead-finance.ts";
import {
  resolveGatewayEnvironment,
  resolvePaymentGatewayRoute,
} from "./ead-context.ts";
import type {
  CheckoutBody,
  CheckoutRuntime,
  GatewayEnvironment,
  GatewayPaymentMethod,
  GatewayProviderCode,
  StudentEadCheckoutTarget,
} from "./types.ts";
import { UUID_RE } from "./utils.ts";

export type EadCheckoutPresentation = "BOLETO" | "PIX";

export type PublicEadPaymentOption = {
  id: GatewayPaymentMethod;
  label: string;
  checkoutMethod: GatewayPaymentMethod;
  presentation?: EadCheckoutPresentation;
};

export class PaymentCheckoutHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PaymentCheckoutHttpError";
    this.status = status;
  }
}

const studentTitleNotFound = () =>
  new PaymentCheckoutHttpError(
    404,
    "Cobranca EAD nao localizada para este aluno.",
  );

const bearerToken = (req: Request) =>
  String(req.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

const loadAuthenticatedAluno = async (runtime: CheckoutRuntime) => {
  const token = bearerToken(runtime.req);
  if (!token) {
    throw new PaymentCheckoutHttpError(
      401,
      "Entre como aluno antes de consultar as formas de pagamento.",
    );
  }

  const { data: authData, error: authError } = await runtime.admin.auth.getUser(
    token,
  );
  const authUserId = String(authData?.user?.id || "");
  if (authError || !UUID_RE.test(authUserId)) {
    throw new PaymentCheckoutHttpError(
      401,
      "Sessao invalida para consultar as formas de pagamento.",
    );
  }

  const { data: aluno, error: alunoError } = await runtime.admin
    .from("parceiros")
    .select("*")
    .eq("auth_user_id", authUserId)
    .eq("tipo", "Aluno")
    .maybeSingle();
  if (alunoError) throw alunoError;
  if (!aluno?.id || String(aluno.tipo || "").toUpperCase() !== "ALUNO") {
    throw studentTitleNotFound();
  }
  return aluno;
};

export const loadStudentEadCheckoutTarget = async (
  runtime: CheckoutRuntime,
  receivableId: string,
): Promise<{ course: any; target: StudentEadCheckoutTarget }> => {
  if (!UUID_RE.test(receivableId)) {
    throw new PaymentCheckoutHttpError(400, "Cobranca EAD invalida.");
  }
  const aluno = await loadAuthenticatedAluno(runtime);
  const { data: receivable, error: receivableError } = await runtime.admin
    .from("contas_receber")
    .select("*")
    .eq("id", receivableId)
    .maybeSingle();
  if (receivableError) throw receivableError;
  if (!receivable || receivable.cliente_id !== aluno.id) {
    throw studentTitleNotFound();
  }
  const receivableStatus = String(receivable.status || "").toUpperCase();
  if (
    receivable.data_pagamento !== null ||
    !["PENDENTE", "VENCIDO"].includes(receivableStatus) ||
    String(receivable.tipo_lancamento || "").toUpperCase() !== "MATRICULA" ||
    !UUID_RE.test(String(receivable.matricula_id || ""))
  ) {
    throw studentTitleNotFound();
  }

  const { data: matricula, error: matriculaError } = await runtime.admin
    .from("matriculas")
    .select("id, aluno_id, turma_id")
    .eq("id", receivable.matricula_id)
    .maybeSingle();
  if (matriculaError) throw matriculaError;
  if (!matricula || matricula.aluno_id !== aluno.id) {
    throw studentTitleNotFound();
  }

  if (
    receivable.turma_id && matricula?.turma_id &&
    receivable.turma_id !== matricula.turma_id
  ) {
    throw studentTitleNotFound();
  }

  const turmaId = String(receivable.turma_id || matricula?.turma_id || "");
  if (!UUID_RE.test(turmaId)) throw studentTitleNotFound();

  const { data: turma, error: turmaError } = await runtime.admin
    .from("turmas")
    .select("*")
    .eq("id", turmaId)
    .maybeSingle();
  if (turmaError) throw turmaError;
  if (!turma?.curso_id) throw studentTitleNotFound();

  const { data: course, error: courseError } = await runtime.admin
    .from("cursos")
    .select(
      "id, nome, modalidade, valor, publicar_site, status, financeiro_config",
    )
    .eq("id", turma.curso_id)
    .maybeSingle();
  if (courseError) throw courseError;
  if (!course || String(course.modalidade || "").toUpperCase() !== "EAD") {
    throw studentTitleNotFound();
  }
  return {
    course,
    target: {
      receivableId: receivable.id,
      alunoId: aluno.id,
      courseId: course.id,
      turmaId,
      aluno,
      receivable,
      turma,
      matricula,
    },
  };
};

const loadRouteCredential = async (
  admin: any,
  credentialId: string | null,
  providerCode: GatewayProviderCode,
  environment: GatewayEnvironment,
) => {
  if (credentialId) {
    const { data, error } = await admin
      .from("payment_gateway_credentials")
      .select("*")
      .eq("id", credentialId)
      .maybeSingle();
    if (error) throw error;
    if (
      data?.provider_code === providerCode &&
      String(data?.environment || "") === environment
    ) {
      return data;
    }
    return null;
  }
  return getCredential(admin, providerCode, environment);
};

const resolveRoutableMethod = async (
  runtime: CheckoutRuntime,
  course: any,
  method: GatewayPaymentMethod,
  environment: GatewayEnvironment,
  presentation?: EadCheckoutPresentation,
) => {
  try {
    resolveEadCharge(course, { method, installments: 1, presentation });
    const resolved = await resolvePaymentGatewayRoute(
      runtime.admin,
      "EAD",
      method,
      environment,
    );
    const credential = await loadRouteCredential(
      runtime.admin,
      resolved.route.credentialId,
      resolved.route.providerCode,
      resolved.environment,
    );
    const ready = await isCredentialConfiguredForRoute(
      runtime.admin,
      resolved.route.providerCode,
      resolved.environment,
      method,
      credential,
    );
    return ready ? { method, providerCode: resolved.route.providerCode } : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (
      !/nao esta ativa|nao permite|permanece bloqueada|nenhuma forma|valor do curso|desativad/i
        .test(message)
    ) {
      console.warn("payment-options route resolution failed", {
        method,
        reason: message,
      });
    }
    return null;
  }
};

const courseAllowsPresentation = (
  course: any,
  presentation: EadCheckoutPresentation,
) => {
  const financeiroConfig = normalizeCourseFinanceiroConfig(
    course?.financeiro_config || {},
  );
  return presentation === "PIX"
    ? financeiroConfig.metodosRecebimento.pix
    : financeiroConfig.metodosRecebimento.boleto;
};

export const resolveStudentEadPaymentOptions = async (
  runtime: CheckoutRuntime,
) => {
  const receivableId = String(runtime.body.receivableId || "");
  const { course, target } = await loadStudentEadCheckoutTarget(
    runtime,
    receivableId,
  );
  const chargeCourse = { ...course, valor: target.receivable.valor };
  const environment = await resolveGatewayEnvironment(runtime.admin);
  const boletoPresentation = courseAllowsPresentation(course, "BOLETO")
    ? "BOLETO"
    : courseAllowsPresentation(course, "PIX")
    ? "PIX"
    : null;
  const boleto = boletoPresentation
    ? await resolveRoutableMethod(
      runtime,
      chargeCourse,
      "BOLETO",
      environment,
      boletoPresentation,
    )
    : null;
  const card = await resolveRoutableMethod(
    runtime,
    chargeCourse,
    "CREDIT_CARD",
    environment,
  );
  const options: PublicEadPaymentOption[] = [];

  if (boleto?.providerCode === "banese_card") {
    if (courseAllowsPresentation(course, "PIX")) {
      options.push({
        id: "PIX",
        label: "Pix",
        checkoutMethod: "BOLETO",
        presentation: "PIX",
      });
    }
    if (courseAllowsPresentation(course, "BOLETO")) {
      options.push({
        id: "BOLETO",
        label: "Boleto com Pix",
        checkoutMethod: "BOLETO",
        presentation: "BOLETO",
      });
    }
  }
  if (card) {
    options.push({
      id: "CREDIT_CARD",
      label: "Cartao",
      checkoutMethod: "CREDIT_CARD",
    });
  }

  return { success: true, modalidade: "EAD" as const, options };
};

export const validateCheckoutPresentation = (
  body: CheckoutBody,
  method: GatewayPaymentMethod,
  providerCode: GatewayProviderCode,
  course: any,
): EadCheckoutPresentation | null => {
  const raw = body.presentation ?? body.eadPaymentPresentation;
  if (raw === undefined || raw === null || raw === "") {
    return method === "BOLETO" ? "BOLETO" : null;
  }

  const presentation = String(raw).trim().toUpperCase();
  if (presentation !== "BOLETO" && presentation !== "PIX") {
    throw new PaymentCheckoutHttpError(
      400,
      "Apresentacao de pagamento EAD invalida.",
    );
  }
  if (method !== "BOLETO") {
    throw new PaymentCheckoutHttpError(
      400,
      "A apresentacao BolePix exige o metodo bancario BOLETO.",
    );
  }
  if (presentation === "PIX" && providerCode !== "banese_card") {
    throw new PaymentCheckoutHttpError(
      400,
      "A apresentacao Pix nao esta disponivel para esta rota bancaria.",
    );
  }
  if (!courseAllowsPresentation(course, presentation)) {
    throw new PaymentCheckoutHttpError(
      400,
      `Este curso nao permite a apresentacao ${presentation}.`,
    );
  }
  return presentation;
};

export const echoCheckoutPresentation = <T extends Record<string, unknown>>(
  response: T,
  presentation: EadCheckoutPresentation | null,
) => {
  const payment = response.payment && typeof response.payment === "object"
    ? response.payment as Record<string, unknown>
    : null;
  const pixQrCode = payment?.pixQrCode &&
      typeof payment.pixQrCode === "object"
    ? payment.pixQrCode as Record<string, unknown>
    : null;
  const hasOfficialPix = Boolean(
    String(pixQrCode?.payload || "").trim() ||
      String(pixQrCode?.encodedImage || "").trim(),
  );
  const downgradedToBoleto = presentation === "PIX" && !hasOfficialPix;
  const effectivePresentation = downgradedToBoleto ? "BOLETO" : presentation;

  return {
    ...response,
    ...(effectivePresentation ? { presentation: effectivePresentation } : {}),
    ...(downgradedToBoleto
      ? { presentationFallbackReason: "PIX_UNAVAILABLE_USE_BOLETO" }
      : {}),
  };
};
