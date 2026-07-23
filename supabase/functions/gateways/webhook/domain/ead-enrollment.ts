import type { GatewayWebhookContext } from "../types.ts";
import { repairOnlineInscription } from "../../online-inscription.ts";

const AUTOMATIC_ENROLLMENT_MODALITIES = new Set<string>([
  "EAD",
  "LIVRE",
  "ESPECIALIZACAO",
]);
export const AUTOMATIC_ENROLLMENT_ACTIVATION_SOURCE_STATUSES = [
  "PENDENTE",
  "AGUARDANDO_PAGAMENTO",
  "AGUARDANDO_CONFIRMACAO",
] as const;
const AUTOMATIC_ACTIVATION_SOURCE_STATUSES = new Set<string>(
  AUTOMATIC_ENROLLMENT_ACTIVATION_SOURCE_STATUSES,
);

const normalizeModality = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const isAutomaticEnrollmentActivationModality = (value: unknown) =>
  AUTOMATIC_ENROLLMENT_MODALITIES.has(normalizeModality(value));

export const isEnrollmentStatusEligibleForAutomaticActivation = (
  value: unknown,
) => AUTOMATIC_ACTIVATION_SOURCE_STATUSES.has(normalizeModality(value));

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
  // Uma baixa atrasada nunca pode reativar matricula encerrada, transferida,
  // trancada ou concluida. A comparacao de status no UPDATE tambem protege a
  // corrida entre esta leitura e uma movimentacao academica.
  if (!isEnrollmentStatusEligibleForAutomaticActivation(matricula?.status)) {
    return;
  }

  const { error: updateError } = await context.admin
    .from("matriculas")
    .update({ status: "ATIVO" })
    .eq("id", receivable.matricula_id)
    .eq("status", matricula.status);
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
  await repairOnlineInscription({
    admin: context.admin,
    receivable: input.receivable,
    gatewayProvider: input.gatewayProvider,
    environment: input.environment,
    paymentId: input.paymentId,
    customerId: input.receivable.gateway_customer_id || null,
    paymentLinkId: input.paymentLinkId,
    localStatus: paid ? "PAGO" : input.localStatus || input.pendingStatus,
    legacyPaymentMethod: input.legacyPaymentMethod,
    pendingStatus: input.pendingStatus,
    paidAt: paid ? input.receivable.data_pagamento || null : null,
    requireGatewayTransaction: true,
  });
};

/** @deprecated Use activateEnrollmentAfterPayment. */
export const activateEadEnrollment = activateEnrollmentAfterPayment;

/** @deprecated Use syncOnlineInscriptionPayment. */
export const syncEadOnlineInscription = syncOnlineInscriptionPayment;
