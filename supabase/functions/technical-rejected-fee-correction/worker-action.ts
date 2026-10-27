import { requestBaneseBoletoAccessToken } from "../banese/core/adapter/auth.ts";
import { BANESE_BOLETO_ENDPOINTS } from "../banese/core/adapter/types.ts";
import { readResponseBody } from "../banese/core/adapter/utils.ts";
import { assertOfficialAbsence, parseInspectionLease, parseInspectionRequest, record, type RejectedFeeRpcClient } from "./contract.ts";

export const runRejectedFeeAbsenceInspection = async (
  admin: RejectedFeeRpcClient,
  body: unknown,
  deps = { fetch, token: requestBaneseBoletoAccessToken },
) => {
  const request = parseInspectionRequest(body);
  const claim = await admin.rpc("claim_rejected_fee_absence_service", {
    p_operation_id: request.operationId, p_manifest_hash: request.manifestHash,
  });
  if (claim.error) throw new Error("REJECTED_FEE_INSPECTION_CLAIM_FAILED");
  const lease = parseInspectionLease(claim.data, request.operationId, request.manifestHash);
  const signal = AbortSignal.timeout(35_000);
  const access = await deps.token({ rpc: async (name, args) => await admin.rpc(name, args) }, "production", { signal });
  const response = await deps.fetch(
    `${BANESE_BOLETO_ENDPOINTS.production.baseUrl}/convenios/${lease.convenio}/boletos/${lease.nossoNumero}`,
    { method: "GET", headers: { Authorization: `${access.tokenType} ${access.accessToken}`, Accept: "application/json" }, signal },
  );
  const raw = await readResponseBody(response);
  try {
    assertOfficialAbsence(response.status, raw);
  } catch {
    // Never log the bank body, payer details, identifiers or free-text descriptions.
    const row = record(raw);
    const errors = row.Erros;
    const candidates = Array.isArray(errors)
      ? errors.slice(0, 3).map(error => record(error).CodigoErroProcessamento) : [];
    for (const field of ["Codigo", "code"]) {
      if (row[field] !== undefined) candidates.push(row[field]);
    }
    const codes = candidates.slice(0, 5).map(code => {
      return typeof code === "string" && /^(?:[A-Z][A-Z0-9_]{0,63}|[0-9]{1,4})$/.test(code)
        ? code : "REDACTED";
    });
    const description = typeof row.Descricao === "string" && /^ERRO_[A-Z_]{1,59}$/.test(row.Descricao)
      ? row.Descricao : "REDACTED";
    throw new Error(`REJECTED_FEE_EXACT_OFFICIAL_ABSENCE_NOT_CONFIRMED HTTP_${response.status} CODES_${codes.join("_") || "NONE"} DESCRIPTION_${description}`);
  }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(raw)));
  const evidence = {
    operation: "EXACT_RESERVED_TITLE_ABSENCE", method: "GET", environment: "production",
    convenio: lease.convenio, nossoNumero: lease.nossoNumero, httpStatus: 404,
    errorCode: "ERRO_BOLETO_NAO_ENCONTRADO", checkedAt: new Date().toISOString(),
    responseHash: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join(""),
  };
  const confirmed = await admin.rpc("confirm_rejected_fee_absence_service", {
    p_operation_id: lease.operationId, p_manifest_hash: lease.manifestHash,
    p_lease_token: lease.leaseToken, p_evidence: evidence,
  });
  if (confirmed.error || record(confirmed.data).confirmed !== true) {
    throw new Error("REJECTED_FEE_ABSENCE_EVIDENCE_NOT_COMMITTED");
  }
  return { operationId: lease.operationId, absenceConfirmed: true, financiallyChanged: false, issued: false };
};
