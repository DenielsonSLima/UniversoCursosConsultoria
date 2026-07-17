import type { GatewayWebhookContext } from "../types.ts";

const AUTOMATIC_ENROLLMENT_MODALITIES = new Set([
  "EAD",
  "LIVRE",
  "ESPECIALIZACAO",
]);

const normalizeModality = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const isAutomaticEnrollmentActivationModality = (value: unknown) =>
  AUTOMATIC_ENROLLMENT_MODALITIES.has(normalizeModality(value));

export const activateEnrollmentAfterPayment = async (
  context: GatewayWebhookContext,
  receivable: any,
) => {
  if (!receivable?.matricula_id) return;
  if (String(receivable.tipo_lancamento || "").toUpperCase() !== "MATRICULA") {
    return;
  }

  const { data: matricula, error } = await context.admin
    .from("matriculas")
    .select("id, status, turmas(cursos(id, modalidade))")
    .eq("id", receivable.matricula_id)
    .maybeSingle();
  if (error) throw error;

  const turma = Array.isArray(matricula?.turmas)
    ? matricula?.turmas?.[0]
    : matricula?.turmas;
  const course = Array.isArray(turma?.cursos)
    ? turma?.cursos?.[0]
    : turma?.cursos;
  // TECNICO fica deliberadamente fora: a ativacao depende da analise documental.
  if (!isAutomaticEnrollmentActivationModality(course?.modalidade)) return;

  const { error: updateError } = await context.admin
    .from("matriculas")
    .update({ status: "ATIVO" })
    .eq("id", receivable.matricula_id);
  if (updateError) throw updateError;
};

export const syncOnlineInscriptionPayment = async (
  context: GatewayWebhookContext,
  input: {
    receivable: any;
    gatewayProvider: string;
    environment: string;
    paymentId: string | null;
    paymentLinkId: string | null;
    localStatus: string | null;
    legacyPaymentMethod: string;
    pendingStatus: string;
  },
) => {
  if (!input.receivable?.matricula_id) return;

  const paid = input.localStatus === "PAGO";
  const updates: Record<string, unknown> = {
    gateway_provider: input.gatewayProvider,
    gateway_environment: input.environment,
    gateway_payment_id: input.paymentId,
    gateway_payment_link_id: input.paymentLinkId,
    status: paid ? "PAGO" : input.localStatus || input.pendingStatus,
    forma_pagamento: input.legacyPaymentMethod,
    erro: null,
    updated_at: new Date().toISOString(),
  };

  if (paid) {
    updates.pago_em = new Date().toISOString();
    updates.confirmado_em = new Date().toISOString();
  }

  const { error } = await context.admin
    .from("inscricoes_online")
    .update(updates)
    .eq("matricula_id", input.receivable.matricula_id)
    .eq("gateway_provider", input.gatewayProvider);
  if (error) throw error;
};

/** @deprecated Use activateEnrollmentAfterPayment. */
export const activateEadEnrollment = activateEnrollmentAfterPayment;

/** @deprecated Use syncOnlineInscriptionPayment. */
export const syncEadOnlineInscription = syncOnlineInscriptionPayment;
