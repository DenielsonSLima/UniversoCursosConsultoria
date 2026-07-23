import { syncRouteAwareFutureInstallments } from "../asaas/api/route-aware-future-sync.ts";
import {
  activateEnrollmentAfterPayment,
  syncOnlineInscriptionPayment,
} from "../gateways/webhook/domain/ead-enrollment.ts";
import { BANESE_CNAB_PROVIDER, safeCnabError } from "./policy.ts";
import { type GestorActor, writeCnabAudit } from "./shared.ts";

const syncFutureInstallmentsAfterPayment = async (
  admin: any,
  file: any,
  receivable: any,
) => {
  if (
    !receivable.matricula_id ||
    String(receivable.tipo_lancamento || "").toUpperCase() !== "MATRICULA"
  ) return;

  const { data: matricula, error: matriculaError } = await admin
    .from("matriculas")
    .select(
      "gerar_cobranca_futura, sincronizar_asaas, turmas(gerar_cobrancas_futuras, sincronizar_asaas_futuro)",
    )
    .eq("id", receivable.matricula_id)
    .maybeSingle();
  if (matriculaError) throw matriculaError;
  const turma = Array.isArray(matricula?.turmas)
    ? matricula.turmas[0]
    : matricula?.turmas;
  const gerarFutura = matricula?.gerar_cobranca_futura ??
    turma?.gerar_cobrancas_futuras ?? false;
  const syncEnabled = matricula?.sincronizar_asaas ??
    turma?.sincronizar_asaas_futuro ?? true;
  if (!gerarFutura || !syncEnabled) return;

  try {
    await syncRouteAwareFutureInstallments(
      admin,
      receivable.matricula_id,
      file.environment,
    );
    const { error: clearWarningError } = await admin
      .from("contas_receber")
      .update({
        gateway_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .eq("status", "PAGO")
      .eq("gateway_provider", BANESE_CNAB_PROVIDER)
      .like(
        "gateway_last_error",
        "Pagamento Banese conciliado; parcelas futuras pendentes:%",
      );
    if (clearWarningError) throw clearWarningError;
  } catch (syncError) {
    const warning = safeCnabError(syncError);
    const { error: warningError } = await admin
      .from("contas_receber")
      .update({
        gateway_last_error:
          `Pagamento Banese conciliado; parcelas futuras pendentes: ${warning}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .eq("status", "PAGO")
      .eq("gateway_provider", BANESE_CNAB_PROVIDER);
    if (warningError) throw warningError;
    throw syncError;
  }
};

export const completeCnabActivation = async (
  admin: any,
  actor: GestorActor,
  file: any,
  record: any,
) => {
  if (!record.receivable_id) return;
  const { data: receivable, error } = await admin
    .from("contas_receber")
    .select("*")
    .eq("id", record.receivable_id)
    .maybeSingle();
  if (error) throw error;
  if (!receivable || String(receivable.status || "").toUpperCase() !== "PAGO") {
    throw new Error(
      "Cobrança não está paga para concluir a projeção acadêmica.",
    );
  }
  const paymentMethod = record.liquidation_channel === "PIX" ? "PIX" : "BOLETO";
  await syncOnlineInscriptionPayment({ admin } as any, {
    receivable,
    gatewayProvider: BANESE_CNAB_PROVIDER,
    environment: file.environment,
    paymentId: record.nosso_numero,
    paymentLinkId: null,
    localStatus: "PAGO",
    legacyPaymentMethod: paymentMethod,
    pendingStatus: "AGUARDANDO_PAGAMENTO",
  });
  await activateEnrollmentAfterPayment({ admin } as any, receivable);
  await syncFutureInstallmentsAfterPayment(admin, file, receivable);

  const now = new Date().toISOString();
  const { data: activated, error: updateError } = await admin
    .from("payment_gateway_cnab_records")
    .update({
      status: "ACTIVATED",
      activation_completed_at: now,
      message: "Baixa e projeções dependentes concluídas.",
      updated_at: now,
    })
    .eq("id", record.id)
    .eq("status", "ACTIVATION_PENDING")
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!activated) {
    const { data: current, error: currentError } = await admin
      .from("payment_gateway_cnab_records")
      .select("status")
      .eq("id", record.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (current?.status === "ACTIVATED") return;
    throw new Error("O estado da projeção CNAB mudou durante a ativação.");
  }
  await writeCnabAudit(admin, {
    file_id: file.id,
    record_id: record.id,
    actor_id: actor.id,
    action: "ATIVACAO_CONCLUIDA",
    metadata: {},
  });
};

export const recordCnabActivationFailure = async (
  admin: any,
  actor: GestorActor,
  fileId: string,
  recordId: string,
  error: unknown,
) => {
  const { data: current, error: currentError } = await admin
    .from("payment_gateway_cnab_records")
    .select("status")
    .eq("id", recordId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (current?.status === "ACTIVATED") return;
  if (current?.status !== "ACTIVATION_PENDING") {
    throw new Error(
      "O estado da projeção CNAB mudou durante o tratamento da falha.",
    );
  }
  const message = safeCnabError(error);
  const { data: updated, error: updateError } = await admin
    .from("payment_gateway_cnab_records")
    .update({ message, updated_at: new Date().toISOString() })
    .eq("id", recordId)
    .eq("status", "ACTIVATION_PENDING")
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) {
    throw new Error(
      "O estado da projeção CNAB mudou durante o tratamento da falha.",
    );
  }
  await writeCnabAudit(admin, {
    file_id: fileId,
    record_id: recordId,
    actor_id: actor.id,
    action: "ATIVACAO_FALHOU",
    metadata: { stage: "projection", message },
  });
};
