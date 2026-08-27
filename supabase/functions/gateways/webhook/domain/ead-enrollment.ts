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

const isInitialEnrollmentReceivable = (receivable: any) => {
  const launchType = String(receivable?.tipo_lancamento || "").toUpperCase();
  const singlePlan =
    receivable?.regra_financeira_plano_unico_snapshot?.origem ===
      "PLANO_UNICO";
  return launchType === "MATRICULA" ||
    (singlePlan && Number(receivable?.parcela_numero) === 1);
};

const enrollmentCourseFor = (enrollment: any) => {
  const turma = Array.isArray(enrollment?.turmas)
    ? enrollment?.turmas?.[0]
    : enrollment?.turmas;
  return Array.isArray(turma?.cursos) ? turma?.cursos?.[0] : turma?.cursos;
};

export const activateEnrollmentAfterPayment = async (
  context: GatewayWebhookContext,
  receivable: any,
) => {
  if (!receivable?.matricula_id) return;
  // Em planos únicos, a matrícula só é ativada pela primeira parcela. Os
  // títulos seguintes quitam o saldo financeiro, mas não podem alterar o
  // ciclo acadêmico da matrícula por si só.
  if (!isInitialEnrollmentReceivable(receivable)) return;

  const { data: matricula, error } = await context.admin
    .from("matriculas")
    .select("id, status, turmas(cursos(id, modalidade))")
    .eq("id", receivable.matricula_id)
    .maybeSingle();
  if (error) throw error;

  const course = enrollmentCourseFor(matricula);
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

  const matriculaId = String(input.receivable.matricula_id);
  const { data: existingInscription, error: existingInscriptionError } =
    await context.admin
      .from("inscricoes_online")
      .select("id, receivable_id")
      .eq("matricula_id", matriculaId)
      .maybeSingle();
  if (existingInscriptionError) throw existingInscriptionError;

  const existingReceivableId = String(
    existingInscription?.receivable_id || "",
  ).trim();
  const currentReceivableId = String(input.receivable?.id || "").trim();
  const existingIdentityMatches = Boolean(
    existingInscription?.id &&
      (!existingReceivableId ||
        (currentReceivableId && existingReceivableId === currentReceivableId)),
  );

  if (!existingIdentityMatches) {
    // Parcelas comuns não representam uma nova inscrição online. Se já houver
    // uma identidade divergente para uma cobrança inicial, o reparo abaixo
    // continuará responsável por rejeitá-la explicitamente.
    if (!isInitialEnrollmentReceivable(input.receivable)) return;

    if (!existingInscription?.id) {
      const { data: enrollment, error: enrollmentError } = await context.admin
        .from("matriculas")
        .select("id, turmas(cursos(modalidade))")
        .eq("id", matriculaId)
        .maybeSingle();
      if (enrollmentError) throw enrollmentError;

      // Matrículas técnicas criadas internamente não possuem projeção de
      // inscrição online. EAD/Livre/Especialização ainda podem reconstruí-la.
      const course = enrollmentCourseFor(enrollment);
      if (!isAutomaticEnrollmentActivationModality(course?.modalidade)) return;
    }
  }

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
