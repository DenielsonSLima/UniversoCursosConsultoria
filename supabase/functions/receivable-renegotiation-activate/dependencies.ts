import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  ActivationError, type ActivationContext, type ActivationDependencies,
  type ActivationReplacement, type ActivationRequest, type ActivationSource, record,
} from "./contract.ts";
import { createSourceCanceller } from "./cancellation.ts";
import { createReplacementIssuer, type IssuanceIntent, type IssuanceRuntime } from "./issuance.ts";
import { loadActivationRuntime } from "./runtime.ts";
import { assertActivationContext } from "./orchestrator.ts";

const serviceArgs = (context: ActivationContext) => ({
  p_operation_id: context.operationId,
  p_lease_token: context.leaseToken,
});
const itemArgs = (context: ActivationContext, item: ActivationSource | ActivationReplacement) => ({
  ...serviceArgs(context), p_receivable_id: item.receivableId, p_attempt_key: item.attemptKey,
});

const rpc = async (client: SupabaseClient, name: string, args: Record<string, unknown>) => {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.code === "55P03" && error.message === "BANESE_PIX_COOLDOWN") {
      throw new ActivationError("BANESE_PIX_COOLDOWN",
        "Boleto registrado, aguardando o QR Pix oficial. Aguarde o intervalo de consulta e retome a mesma operação, sem emitir outra cobrança.", true);
    }
    const denied = ["42501", "PT403", "28000"].includes(error.code);
    const invalid = ["22023", "22007", "23514", "23505", "40001", "55000", "PT400", "PT409", "P0001", "P0002"].includes(error.code);
    throw new ActivationError(denied ? "ACTIVATION_NOT_AUTHORIZED" : invalid ? "ACTIVATION_SNAPSHOT_CONFLICT" : "ACTIVATION_PERSISTENCE_UNCONFIRMED",
      denied ? "Sem permissão para ativar este acordo." : invalid
      ? "A situação do acordo mudou ou não atende às regras de ativação. Reabra e revise."
      : "A resposta do registro da operação não foi confirmada. Retome a mesma operação.",
      !denied && !invalid, denied ? 403 : 409);
  }
  return data;
};

const confirmedContext = (previous: ActivationContext, value: unknown) => {
  const next = value as ActivationContext;
  assertActivationContext({ agreementId: previous.agreementId, requestId: previous.requestId,
    expectedVersion: 1, expectedFingerprint: "0".repeat(64), confirm: true }, next);
  if (next.operationId !== previous.operationId ||
    Object.entries(previous.identity).some(([key, value]) => next.identity[key as keyof typeof next.identity] !== value) ||
    (next.state !== "ACTIVE" && next.leaseToken !== previous.leaseToken)) {
    throw new ActivationError("PERSISTED_CONTEXT_MISMATCH", "A confirmação persistida não corresponde à operação.");
  }
  return next;
};

const requireAcknowledgement = (value: unknown, field: string, expected: unknown) => {
  if (record(value)[field] !== expected) throw new ActivationError("PERSISTENCE_ACKNOWLEDGEMENT_MISSING",
    "O registro da etapa não foi confirmado. Retome a mesma operação.", true);
};

export const startActivation = (userClient: SupabaseClient, request: ActivationRequest) =>
  rpc(userClient, "start_receivable_renegotiation_activation_secure", {
    p_agreement_id: request.agreementId, p_request_id: request.requestId,
    p_expected_version: request.expectedVersion, p_expected_fingerprint: request.expectedFingerprint,
    p_confirm: request.confirm, p_approve_custom_terms: request.approveCustomTerms ?? false,
  });

export const createActivationDependencies = (input: {
  admin: SupabaseClient;
  start: ActivationDependencies["start"];
  supabaseUrl: string;
}): ActivationDependencies => {
  let runtime: IssuanceRuntime | null = null;
  const issueReplacement = createReplacementIssuer({
    admin: input.admin,
    supabaseUrl: input.supabaseUrl,
    runtime: () => {
      if (!runtime) throw new ActivationError("PREFLIGHT_REQUIRED", "A configuração bancária não foi validada.");
      return runtime;
    },
    markIntent: async (context, item) => {
      const result = record(await rpc(input.admin, "mark_receivable_renegotiation_issuance_intent_secure", itemArgs(context, item)));
      if (!["POST_ALLOWED", "GET_ONLY"].includes(String(result.mode)) || !record(result.receivable).id) {
        throw new ActivationError("ISSUANCE_CLAIM_INVALID", "Autorização exclusiva da nova parcela não confirmada.");
      }
      return result as IssuanceIntent;
    },
    recordCreation: async (context, item, capture) => {
      const acknowledgement = await rpc(input.admin, "record_receivable_renegotiation_bank_response_secure", {
        ...itemArgs(context, item), p_response: capture,
      });
      requireAcknowledgement(acknowledgement, "recorded", true);
    },
  });
  return {
    start: input.start,
    claim: async (operationId) => await rpc(input.admin, "claim_receivable_renegotiation_activation_secure", {
      p_operation_id: operationId, p_lease_seconds: 180,
    }) as ActivationContext,
    preflight: async (context) => { runtime = await loadActivationRuntime(input.admin, context); },
    markCancelIntent: async (context, source) => {
      const result = record(await rpc(input.admin, "mark_receivable_renegotiation_cancel_intent_secure", itemArgs(context, source)));
      if (result.mode !== "PUT_ALLOWED") {
        // A lost response or race must not permit an additional PUT.
        throw new ActivationError("CANCEL_ALREADY_STARTED", "A baixa já possui intenção registrada. Retome por consulta.", true);
      }
    },
    cancelSource: createSourceCanceller(input.admin as unknown as Parameters<typeof createSourceCanceller>[0]),
    confirmSource: async (context, source, evidence) => {
      const result = confirmedContext(context, await rpc(input.admin, "confirm_receivable_renegotiation_source_cancel_secure", {
        ...itemArgs(context, source), p_evidence: evidence,
      }));
      if (result.sources.find((item) => item.receivableId === source.receivableId)?.state !== "CANCELED_CONFIRMED") {
        throw new ActivationError("CANCELLATION_PERSISTENCE_UNCONFIRMED", "Confirmação da baixa não foi persistida.", true);
      }
    },
    prepareReplacements: async (context) => await rpc(input.admin,
      "prepare_receivable_renegotiation_replacements_secure", serviceArgs(context)) as ActivationContext,
    issueReplacement,
    confirmReplacement: async (context, item, result) => {
      const persisted = confirmedContext(context, await rpc(input.admin, "confirm_receivable_renegotiation_replacement_issued_secure", {
        ...itemArgs(context, item), p_result: result,
      }));
      if (persisted.replacements.find((replacement) => replacement.receivableId === item.receivableId)?.state !== "ISSUED") {
        throw new ActivationError("ISSUANCE_PERSISTENCE_UNCONFIRMED", "Confirmação da emissão não foi persistida.", true);
      }
    },
    finish: async (context) => {
      const result = confirmedContext(context, await rpc(input.admin,
        "finish_receivable_renegotiation_activation_secure", serviceArgs(context)));
      requireAcknowledgement(result, "state", "ACTIVE");
    },
    release: async (context) => {
      requireAcknowledgement(await rpc(input.admin, "release_receivable_renegotiation_activation_secure",
        serviceArgs(context)), "released", true);
    },
    fail: async (context, error) => {
      if (error.retryable) {
        requireAcknowledgement(await rpc(input.admin, "release_receivable_renegotiation_activation_secure",
          { ...serviceArgs(context), p_retry_code: error.code === "BANESE_PIX_PENDING" ? error.code : null }), "released", true);
      } else {
        requireAcknowledgement(await rpc(input.admin, "mark_receivable_renegotiation_activation_review_secure", {
          ...serviceArgs(context), p_error_code: error.code,
        }), "state", "REVIEW_REQUIRED");
      }
    },
  };
};
