import type {
  ManualSettlementAttempt,
  ManualSettlementRepository,
  ManualSettlementResult,
} from "./manual-settlement.types.ts";
import { moneyToCents } from "./manual-settlement-money.ts";

const throwIfError = (error: any) => {
  if (error) throw error;
};

export const manualSettlementReceivableSnapshot = (receivable: any) => ({
  status: receivable?.status ?? null,
  valor_cents: moneyToCents(receivable?.valor, "Valor principal"),
  polo_id: receivable?.polo_id ?? null,
  gateway_provider: receivable?.gateway_provider ?? null,
  gateway_environment: receivable?.gateway_environment ?? null,
  gateway_payment_method: receivable?.gateway_payment_method ?? null,
  gateway_payment_id: receivable?.gateway_payment_id ?? null,
  gateway_payment_link_id: receivable?.gateway_payment_link_id ?? null,
  gateway_boleto_nosso_numero: receivable?.gateway_boleto_nosso_numero ?? null,
  gateway_status: receivable?.gateway_status ?? null,
  asaas_payment_id: receivable?.asaas_payment_id ?? null,
  asaas_payment_link_id: receivable?.asaas_payment_link_id ?? null,
  asaas_status: receivable?.asaas_status ?? null,
});

export const createManualSettlementRepository = (
  admin: any,
): ManualSettlementRepository => ({
  async getReceivable(id) {
    const { data, error } = await admin
      .from("contas_receber")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwIfError(error);
    if (!data) throw new Error("Cobrança não encontrada para baixa manual.");
    return data;
  },

  async getAttemptByIdempotencyKey(key) {
    const { data, error } = await admin
      .from("receivable_manual_settlements")
      .select("*")
      .eq("idempotency_key", key)
      .maybeSingle();
    throwIfError(error);
    return data as ManualSettlementAttempt | null;
  },

  async getActiveAttempt(receivableId) {
    const { data, error } = await admin
      .from("receivable_manual_settlements")
      .select("*")
      .eq("receivable_id", receivableId)
      .in("state", [
        "STARTED",
        "REMOTE_CANCELED_LOCAL_PENDING",
        "REVIEW_REQUIRED",
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfError(error);
    return data as ManualSettlementAttempt | null;
  },

  async createAttempt(input) {
    const { data, error } = await admin
      .from("receivable_manual_settlements")
      .insert(input)
      .select("*")
      .single();
    throwIfError(error);
    return data as ManualSettlementAttempt;
  },

  async claimAttempt(attempt, leaseToken, leaseExpiresAt) {
    const { data, error } = await admin
      .from("receivable_manual_settlements")
      .update({
        state: attempt.state === "FAILED_SAFE" ? "STARTED" : attempt.state,
        lease_token: leaseToken,
        lease_expires_at: leaseExpiresAt,
        last_error: null,
      })
      .eq("id", attempt.id)
      .eq("state", attempt.state)
      .eq("updated_at", attempt.updated_at)
      .select("*")
      .maybeSingle();
    throwIfError(error);
    return data as ManualSettlementAttempt | null;
  },

  async markRemoteReady(attemptId, leaseToken, input) {
    const { data, error } = await admin
      .from("receivable_manual_settlements")
      .update({
        ...input,
        state: "REMOTE_CANCELED_LOCAL_PENDING",
        last_error: null,
      })
      .eq("id", attemptId)
      .eq("lease_token", leaseToken)
      .in("state", ["STARTED", "REMOTE_CANCELED_LOCAL_PENDING"])
      .select("*")
      .maybeSingle();
    throwIfError(error);
    if (!data) {
      throw new Error(
        "A tentativa de baixa perdeu a posse de processamento. Atualize a tela antes de continuar.",
      );
    }
    return data as ManualSettlementAttempt;
  },

  async markReviewRequired(attemptId, leaseToken, errorMessage) {
    const { data, error } = await admin
      .from("receivable_manual_settlements")
      .update({
        state: "REVIEW_REQUIRED",
        review_required_at: new Date().toISOString(),
        lease_token: null,
        lease_expires_at: null,
        last_error: errorMessage.slice(0, 1000),
      })
      .eq("id", attemptId)
      .eq("lease_token", leaseToken)
      .select("id")
      .maybeSingle();
    throwIfError(error);
    if (!data) {
      throw new Error(
        "Falha ao preservar a revisão obrigatória da baixa manual.",
      );
    }
  },

  async markSafeFailure(attemptId, leaseToken, errorMessage) {
    const { data, error } = await admin
      .from("receivable_manual_settlements")
      .update({
        state: "FAILED_SAFE",
        review_required_at: null,
        lease_token: null,
        lease_expires_at: null,
        last_error: errorMessage.slice(0, 1000),
      })
      .eq("id", attemptId)
      .eq("lease_token", leaseToken)
      .eq("state", "STARTED")
      .is("remote_canceled_at", null)
      .select("id")
      .maybeSingle();
    throwIfError(error);
    if (!data) {
      throw new Error(
        "Falha ao registrar que a baixa foi interrompida antes do cancelamento bancário.",
      );
    }
  },

  async appendEvent(settlementId, actorId, eventType, details = {}) {
    const { error } = await admin
      .from("receivable_manual_settlement_events")
      .insert({
        settlement_id: settlementId,
        actor_id: actorId,
        event_type: eventType,
        details,
      });
    throwIfError(error);
  },

  async finalize(attemptId, leaseToken) {
    const { data, error } = await admin.rpc(
      "finalize_receivable_manual_settlement",
      {
        p_settlement_id: attemptId,
        p_lease_token: leaseToken,
      },
    );
    throwIfError(error);
    if (!data || typeof data !== "object" || data.success !== true) {
      throw new Error("O banco não confirmou a conclusão da baixa manual.");
    }
    return data as ManualSettlementResult;
  },

  async updateCompletedResult(attemptId, result) {
    const { error } = await admin
      .from("receivable_manual_settlements")
      .update({ result })
      .eq("id", attemptId)
      .eq("state", "COMPLETED");
    throwIfError(error);
  },

  async setFutureSyncError(matriculaId, message) {
    const { error } = await admin
      .from("contas_receber")
      .update({
        gateway_last_error: message.slice(0, 1000),
        asaas_last_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("matricula_id", matriculaId)
      .in("status", ["PENDENTE", "VENCIDO"])
      .neq("tipo_lancamento", "MATRICULA");
    throwIfError(error);
  },
});
