import { assertBaneseBankNumbers, assertBaneseDueDateFactor } from "../banese/internal/bank-fields.ts";
import { normalizeBaneseFinancialTerms, type BaneseFinancialTermsInput } from "../banese/internal/financial-terms.ts";
import { assertBaneseFinancialTermsEqual } from "../banese/internal/financial-terms-response.ts";
import { normalizeBanesePixPayload, normalizeBanesePixQrImage } from "../banese/internal/pix-validation.ts";
import type { GatewayChargeResult } from "../gateways/router.ts";

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export type Admin = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
export interface Job { jobId: string; leaseToken: string; receivableId: string }
export interface Material extends Job {
  action: "CREATE" | "GET"; credentialId: string; receivable: Record<string, unknown>;
  payer: Record<string, unknown>; metadata: Record<string, unknown>; fiscalNumber: string; fiscalDescription: string;
}
export const parseJob = (value: unknown): Job => {
  const item = record(value);
  const result = { jobId: String(item.jobId || ""), leaseToken: String(item.leaseToken || ""), receivableId: String(item.receivableId || "") };
  if (!Object.values(result).every(id => uuid.test(id))) throw new Error("INVALID_EVIDENCE");
  return result;
};
export const parseMaterial = (value: unknown, job: Job): Material => {
  const item = record(value), c = record(item.receivable), payer = record(item.payer);
  if (item.jobId !== job.jobId || item.leaseToken !== job.leaseToken || c.id !== job.receivableId
    || !["CREATE", "GET"].includes(String(item.action)) || !uuid.test(String(item.credentialId))
    || c.categoria !== "OUTROS_CREDITOS" || c.tipo_lancamento !== "OUTRO_CREDITO"
    || c.matricula_id != null || c.turma_id != null || c.origem_cronograma_id != null
    || c.cliente_id !== payer.id || !String(item.fiscalNumber || "").trim()
    || !String(item.fiscalDescription || "").trim() || String(item.fiscalDescription).length > 2000
    || !String(c.descricao || "").includes(String(item.fiscalDescription))) throw new Error("INVALID_EVIDENCE");
  canonicalTerms(c);
  return { ...job, action: item.action as Material["action"], credentialId: String(item.credentialId),
    receivable: c, payer, metadata: record(item.metadata), fiscalNumber: String(item.fiscalNumber), fiscalDescription: String(item.fiscalDescription) };
};
export const canonicalTerms = (c: Record<string, unknown>) => {
  const terms = normalizeBaneseFinancialTerms(record(c.gateway_financial_terms) as BaneseFinancialTermsInput);
  if (terms.nominalAmount !== Number(c.valor) || terms.dueDate !== String(c.data_vencimento).slice(0, 10)) throw new Error("INVALID_EVIDENCE");
  return terms;
};
export const validateResult = (result: GatewayChargeResult, material: Material): GatewayChargeResult => {
  const c = material.receivable, number = String(result.bankSlipOurNumber || "");
  const bank = assertBaneseBankNumbers(result.bankSlipDigitableLine, result.bankSlipBarcode);
  assertBaneseDueDateFactor(bank.barcode, String(c.data_vencimento).slice(0, 10));
  if (result.providerCode !== "banese_card" || result.remotePaymentId !== number || !/^\d{9}$/.test(number)
    || !(material.action === "CREATE" ? ["PENDING","REGISTERING"] : ["PENDING"]).includes(String(result.remoteStatus))
    || result.issuerPoloId !== c.gateway_issuer_polo_id
    || bank.barcode.slice(30, 39) !== number || Number(bank.barcode.slice(9, 19)) / 100 !== Number(c.valor)
    || Boolean(result.pixPayload) !== Boolean(result.pixEncodedImage)
    || material.action === "GET" && c.gateway_boleto_nosso_numero !== number) throw new Error("INVALID_EVIDENCE");
  const financialTerms = assertBaneseFinancialTermsEqual(canonicalTerms(c), result.financialTerms as BaneseFinancialTermsInput);
  return { ...result, bankSlipBarcode: bank.barcode, bankSlipDigitableLine: bank.digitableLine,
    financialTerms, pixPayload: result.pixPayload ? normalizeBanesePixPayload(result.pixPayload, Number(c.valor)).payload : null,
    pixEncodedImage: result.pixEncodedImage ? normalizeBanesePixQrImage(result.pixEncodedImage) : null };
};
export const leaseArgs = (job: Job) => ({ p_job_id: job.jobId, p_lease_token: job.leaseToken });
export const rpc = async (admin: Admin, name: string, args?: Record<string, unknown>) => {
  const response = await admin.rpc(name, args);
  if (response.error) throw response.error;
  return response.data;
};
