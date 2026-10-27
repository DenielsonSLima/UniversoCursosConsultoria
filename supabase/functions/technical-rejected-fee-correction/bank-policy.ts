import { queryBaneseEffectivePayments } from "../banese/core/adapter/boleto-payment-query.ts";
import type { BaneseAccessToken, SupabaseAdminRpcClient } from "../banese/core/adapter/types.ts";
import { assertOfficialAbsence, record } from "./contract.ts";
export const loadRejectedFeeBankPolicy = async (admin: SupabaseAdminRpcClient, receivableId: string, token: string) => {
  const response = await admin.rpc("rejected_fee_bank_policy_service", {
    p_receivable_id: receivableId, p_creation_token: token,
  });
  if (response.error) throw new Error("REJECTED_FEE_BANK_POLICY_UNAVAILABLE");
  const row = record(response.data);
  if (row.required === false) return null;
  if (row.required !== true || row.environment !== "production" || typeof row.allowNewPost !== "boolean" ||
    !/^[0-9]{1,20}$/.test(String(row.convenio)) || !/^[0-9]{9}$/.test(String(row.nossoNumero))) {
    throw new Error("REJECTED_FEE_BANK_POLICY_INVALID");
  }
  return { allowNewPost: row.allowNewPost, environment: "production", convenio: String(row.convenio), nossoNumero: String(row.nossoNumero) };
};
export const enforceRejectedFeePreflight = (
  policy: Awaited<ReturnType<typeof loadRejectedFeeBankPolicy>>,
  current: { environment: string; convenio: string; nossoNumero: string },
  status: number, body: unknown,
) => {
  if (!policy) return;
  if (policy.environment !== current.environment || policy.convenio !== current.convenio ||
    policy.nossoNumero !== current.nossoNumero) throw new Error("REJECTED_FEE_BANK_IDENTITY_CHANGED");
  if (status < 200 || status >= 300) {
    assertOfficialAbsence(status, body);
    if (!policy.allowNewPost) throw new Error("REJECTED_FEE_DUE_DATE_EXPIRED_NO_NEW_POST");
  }
};

export const assertRejectedFeeMatchedTitle = async (raw: unknown, endpoint: string, token: BaneseAccessToken) => {
  if (Number(record(raw).CodigoSituacaoBoleto) !== 2) throw new Error("REJECTED_FEE_EXISTING_TITLE_NOT_ACTIVE");
  const result = await queryBaneseEffectivePayments({ baseEndpoint: endpoint, token, allowFailure: false, strict: true });
  if (result.payments.length !== 0) throw new Error("REJECTED_FEE_EXISTING_TITLE_PAYMENT_FOUND");
};
