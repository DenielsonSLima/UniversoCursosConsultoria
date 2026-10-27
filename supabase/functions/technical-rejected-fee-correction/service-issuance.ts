import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createGatewayCharge, type GatewayChargeResult } from "../gateways/router.ts";
import { loadServiceFeeIssuanceScope } from "../technical-manual-cycle-issuance/dependencies.ts";
import { loadReceivable, payerForGateway } from "../technical-manual-cycle-issuance/receivable-issuance.ts";
import { resolveCanonicalManualCycleBaneseTerms } from "../technical-manual-cycle-issuance/financial-terms.ts";
import { validateBaneseGatewayResult } from "../technical-manual-cycle-issuance/contract.ts";
import { isStrictlyIssued } from "../technical-manual-cycle-issuance/receivable-state.ts";
import { record } from "./contract.ts";
import { recoverServiceFeeExactTitle } from "./service-recovery.ts";

export const REJECTED_FEE_SERVICE_ACTION = "issue_approved_rejected_fee_service";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const parseServiceFeeRequest = (body: unknown) => {
  const r = record(body);
  if (Object.keys(r).sort().join() !== "action,manifestHash,operationId" ||
    r.action !== REJECTED_FEE_SERVICE_ACTION || !UUID.test(String(r.operationId)) ||
    !/^[a-f0-9]{64}$/.test(String(r.manifestHash))) throw new Error("REJECTED_FEE_SERVICE_REQUEST_INVALID");
  return { operationId: String(r.operationId), manifestHash: String(r.manifestHash) };
};
const dependencies = {
  scope: loadServiceFeeIssuanceScope, load: loadReceivable, create: createGatewayCharge,
  recover: recoverServiceFeeExactTitle, terms: resolveCanonicalManualCycleBaneseTerms,
  validate: validateBaneseGatewayResult, issued: isStrictlyIssued,
};

// No caller-supplied fee, payer, amount, date, token or user ID is accepted.
export const runApprovedRejectedFeeService = async (
  admin: SupabaseClient, supabaseUrl: string, body: unknown, deps = dependencies,
) => {
  const request = parseServiceFeeRequest(body);
  const args = { p_operation_id: request.operationId, p_manifest_hash: request.manifestHash };
  const claimed = await admin.rpc("claim_rejected_fee_service_issuance", args);
  if (claimed.error) throw new Error("REJECTED_FEE_SERVICE_CLAIM_FAILED");
  const claim = record(claimed.data);
  if (claim.operationId !== request.operationId || claim.manifestHash !== request.manifestHash ||
    !UUID.test(String(claim.receivableId)) || !UUID.test(String(claim.matriculaId)) ||
    !UUID.test(String(claim.requestId)) || typeof claim.recoveryOnly !== "boolean" ||
    (claim.completed !== true && !UUID.test(String(claim.leaseToken)))) {
    throw new Error("REJECTED_FEE_SERVICE_CAPABILITY_INVALID");
  }
  const receivableId = String(claim.receivableId), requestId = String(claim.requestId);
  let stage: "SCOPE" | "LOAD" | "TERMS" | "CREATE" | "RECOVER" | "VALIDATE" | "PERSIST" = "SCOPE";
  try {
    const scope = await deps.scope(admin, String(claim.matriculaId));
    stage = "LOAD";
    const loaded = await deps.load(admin, receivableId);
    const r = loaded.receivable;
    if (r.id !== receivableId || r.matricula_id !== scope.matriculaId || r.turma_id !== scope.turmaId ||
      r.polo_id !== scope.poloId || r.gateway_issuer_polo_id !== scope.issuerPoloId ||
      Number(r.valor) !== 100 || String(r.data_vencimento).slice(0, 10) !== "2026-10-30" ||
      r.tipo_lancamento !== "REMATRICULA") throw new Error("REJECTED_FEE_SERVICE_SCOPE_CHANGED");
    if (claim.completed === true) {
      if (!deps.issued(loaded, scope)) throw new Error("REJECTED_FEE_SERVICE_COMPLETION_DRIFT");
      return { operationId: request.operationId, completed: true, replayed: true, issued: true };
    }
    if (r.gateway_creation_token !== requestId || loaded.transactions.length !== 0) {
      throw new Error("REJECTED_FEE_SERVICE_ATTEMPT_CHANGED");
    }
    let result: GatewayChargeResult;
    if (claim.recoveryOnly) {
      // Once claimed, even an uncertain/failed first attempt can only perform exact GET recovery.
      stage = "RECOVER";
      result = await deps.recover({ admin, loaded, scope, strictEffectivePayments: true });
    } else {
      stage = "TERMS";
      const financialTerms = await deps.terms(admin, r);
      stage = "CREATE";
      await deps.create({
        admin, supabaseUrl, providerCode: "banese_card", credentialId: scope.credentialId,
        environment: "production", paymentMethod: "BOLETO", receivable: r,
        payer: payerForGateway(loaded.payer), amount: Number(r.valor),
        description: String(r.descricao || "Rematrícula técnica"), dueDate: "2026-10-30",
        installments: 1, successUrl: null, failureUrl: null, pendingUrl: null,
        financialTerms, allowPendingBolePix: false,
      });
      // A POST response is not enough: re-read the exact title and effective payments.
      stage = "RECOVER";
      result = await deps.recover({ admin, loaded, scope, strictEffectivePayments: true });
    }
    stage = "VALIDATE";
    const normalized = deps.validate(result, r);
    stage = "PERSIST";
    const saved = await admin.rpc("persist_rejected_fee_service_issuance", {
      ...args, p_lease_token: claim.leaseToken, p_result: normalized,
    });
    if (saved.error || record(saved.data).success !== true) {
      throw new Error("REJECTED_FEE_SERVICE_PERSISTENCE_UNCONFIRMED");
    }
    return { operationId: request.operationId, completed: true, replayed: false, issued: true };
  } catch (error) {
    const safeDetail = error instanceof Error && /^REJECTED_FEE_SERVICE_(QUERY_UNCONFIRMED|QUERY_HTTP_[1-5]\d{2}_(ABSENT|UNCONFIRMED)|SNAPSHOT_[01]{6})$/.test(error.message)
      ? error.message : "REJECTED_FEE_SERVICE_UNCONFIRMED";
    try {
      if (claim.completed !== true) {
        // No provider response or PII is written to this diagnostic. The attempt is never reset.
        await admin.rpc("fail_rejected_fee_service_issuance", {
          ...args, p_lease_token: claim.leaseToken, p_diagnostic: "SERVICE_ATTEMPT_REQUIRES_EXACT_GET",
        });
      }
    } catch {
      // A diagnostic-RPC failure must not expose its provider response either.
    }
    // Provider errors can contain payer data or credentials; never retain them as cause.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`REJECTED_FEE_SERVICE_REQUIRES_EXACT_GET STAGE_${stage} ${safeDetail}`);
  }
};
